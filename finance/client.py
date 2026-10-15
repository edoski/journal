"""Enable Banking API client (stdlib urllib, verified TLS, no redirects).

Endpoints, fields and error codes follow
https://enablebanking.com/docs/api/reference/ and
https://enablebanking.com/docs/faq/. No PSU headers are sent: the FAQ asks
scheduled, unattended fetches to send none.
"""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from finance.config import API_ORIGIN, Settings
from finance.jwt import TOKEN_SECONDS, make_token
from finance.tls import default_context

REQUEST_TIMEOUT = 120
TOKEN_MARGIN = 300
# Errors after which only a new bank consent helps (API reference, ErrorCode).
SESSION_ERRORS = frozenset(
    {
        "EXPIRED_SESSION",
        "CLOSED_SESSION",
        "REVOKED_SESSION",
        "SESSION_DOES_NOT_EXIST",
        "WRONG_SESSION_STATUS",
    }
)
RATE_LIMIT_ERROR = "ASPSP_RATE_LIMIT_EXCEEDED"
PERIOD_ERROR = "WRONG_TRANSACTIONS_PERIOD"


@dataclass(frozen=True)
class HttpRequest:
    method: str
    url: str
    headers: Mapping[str, str]
    body: bytes | None


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes


Transport = Callable[[HttpRequest], HttpResponse]


class ApiError(RuntimeError):
    """A non-2xx answer, keeping Enable Banking's `error` code."""

    def __init__(self, status: int, error: str | None, message: str) -> None:
        self.status = status
        self.error = error
        self.message = message
        label = f"{status} {error}" if error else str(status)
        super().__init__(f"Enable Banking answered {label}: {message}")

    @property
    def rate_limited(self) -> bool:
        return self.status == 429 or self.error == RATE_LIMIT_ERROR

    @property
    def needs_reconsent(self) -> bool:
        return self.error in SESSION_ERRORS


class NetworkError(RuntimeError):
    """The request did not get an HTTP answer."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def urllib_transport(
    context: ssl.SSLContext | None = None,
    *,
    https: urllib.request.HTTPSHandler | None = None,
) -> Transport:
    """Send requests with urllib over a verifying TLS context, never following
    a redirect (`https` replaces the HTTPS handler in tests)."""

    def send(request: HttpRequest) -> HttpResponse:
        handler = https or urllib.request.HTTPSHandler(
            context=context or default_context()
        )
        opener = urllib.request.build_opener(handler, _NoRedirect())
        prepared = urllib.request.Request(
            request.url,
            data=request.body,
            headers=dict(request.headers),
            method=request.method,
        )
        try:
            with opener.open(prepared, timeout=REQUEST_TIMEOUT) as answer:
                return HttpResponse(status=answer.status, body=answer.read())
        except urllib.error.HTTPError as exc:
            return HttpResponse(status=exc.code, body=exc.read() or b"")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise NetworkError(f"could not reach {request.url}: {exc}") from exc

    return send


def _error_from(status: int, body: bytes) -> ApiError:
    try:
        payload = json.loads(body.decode("utf-8")) if body else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    error = payload.get("error")
    message = payload.get("message")
    text = body.decode("utf-8", "replace").strip()[:300]
    return ApiError(
        status,
        error if isinstance(error, str) else None,
        message if isinstance(message, str) else (text or "no details"),
    )


class EnableBankingClient:
    """The calls finance makes; every answer is a decoded JSON object."""

    def __init__(
        self,
        settings: Settings,
        *,
        transport: Transport | None = None,
        clock: Callable[[], float] = time.time,
        token_factory: Callable[[int], str] | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport or urllib_transport()
        self._clock = clock
        self._token_factory = token_factory or (
            lambda now: make_token(settings.application_id, settings.key_path, now=now)
        )
        self._token: tuple[str, float] | None = None
        self.calls = 0

    def _bearer(self) -> str:
        now = self._clock()
        if self._token is None or now >= self._token[1]:
            issued = int(now)
            token = self._token_factory(issued)
            self._token = (token, issued + TOKEN_SECONDS - TOKEN_MARGIN)
        return self._token[0]

    def _call(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, str] | None = None,
        body: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = API_ORIGIN + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {
            "Authorization": f"Bearer {self._bearer()}",
            "Accept": "application/json",
        }
        data = None
        if body is not None:
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        self.calls += 1
        answer = self._transport(HttpRequest(method, url, headers, data))
        if not 200 <= answer.status < 300:
            raise _error_from(answer.status, answer.body)
        try:
            payload = json.loads(answer.body.decode("utf-8")) if answer.body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ApiError(answer.status, None, f"unreadable JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise ApiError(answer.status, None, "the answer is not a JSON object")
        return payload

    def start_authorization(self, *, valid_until: str, state: str) -> dict[str, Any]:
        """POST /auth: returns `url` (the bank link) and `authorization_id`."""
        return self._call(
            "POST",
            "/auth",
            body={
                "access": {
                    "valid_until": valid_until,
                    "balances": True,
                    "transactions": True,
                },
                "aspsp": {
                    "name": self._settings.aspsp_name,
                    "country": self._settings.aspsp_country,
                },
                "state": state,
                "redirect_url": self._settings.redirect_url,
                "psu_type": self._settings.psu_type,
            },
        )

    def create_session(self, code: str) -> dict[str, Any]:
        """POST /sessions: exchanges the redirect `code` for a session."""
        return self._call("POST", "/sessions", body={"code": code})

    def delete_session(self, session_id: str) -> dict[str, Any]:
        """DELETE /sessions/{id}: closes the consent at the bank if possible."""
        return self._call("DELETE", f"/sessions/{urllib.parse.quote(session_id)}")

    def balances(self, account_uid: str) -> dict[str, Any]:
        """GET /accounts/{uid}/balances."""
        return self._call(
            "GET", f"/accounts/{urllib.parse.quote(account_uid)}/balances"
        )

    def transactions(
        self,
        account_uid: str,
        *,
        date_from: str | None,
        strategy: str,
        continuation_key: str | None,
    ) -> dict[str, Any]:
        """GET /accounts/{uid}/transactions, booked entries only, one page."""
        query: dict[str, str] = {"transaction_status": "BOOK", "strategy": strategy}
        if date_from is not None:
            query["date_from"] = date_from
        if continuation_key is not None:
            query["continuation_key"] = continuation_key
        return self._call(
            "GET",
            f"/accounts/{urllib.parse.quote(account_uid)}/transactions",
            query=query,
        )
