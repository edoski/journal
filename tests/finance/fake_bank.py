"""A fake Enable Banking API for tests: no network, scripted answers."""

from __future__ import annotations

import json
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from finance.client import EnableBankingClient, HttpRequest, HttpResponse
from finance.config import Settings


@dataclass
class Call:
    method: str
    path: str
    query: dict[str, str]
    body: Any
    headers: dict[str, str]


def tx(
    day: str,
    amount: str,
    indicator: str = "DBIT",
    *,
    ref: str | None = None,
    creditor: str | None = None,
    debtor: str | None = None,
    remittance: list[str] | None = None,
    status: str = "BOOK",
    currency: str = "EUR",
) -> dict[str, Any]:
    """A transaction shaped like the API reference's Transaction."""
    item: dict[str, Any] = {
        "transaction_amount": {"currency": currency, "amount": amount},
        "credit_debit_indicator": indicator,
        "status": status,
        "booking_date": day,
        "value_date": day,
    }
    if ref is not None:
        item["entry_reference"] = ref
    if creditor is not None:
        item["creditor"] = {"name": creditor}
    if debtor is not None:
        item["debtor"] = {"name": debtor}
    if remittance is not None:
        item["remittance_information"] = remittance
    return item


@dataclass
class FakeBank:
    """Routes requests like api.enablebanking.com would, from scripted data."""

    accounts: list[dict[str, Any]] = field(default_factory=list)
    # uid -> list of pages; each page is (transactions, continuation_key)
    pages: dict[str, list[tuple[list[dict[str, Any]], str | None]]] = field(
        default_factory=dict
    )
    balances: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    # queued failures: (method, path prefix) -> list of (status, error code)
    failures: list[tuple[str, str, int, str | None]] = field(default_factory=list)
    calls: list[Call] = field(default_factory=list)
    session_id: str = "session-1"
    valid_until: str = "2027-04-11T10:00:00.000000+00:00"
    auth_url: str = "https://bank.example/authorize?x=1"

    def __call__(self, request: HttpRequest) -> HttpResponse:
        parts = urllib.parse.urlsplit(request.url)
        assert parts.scheme == "https" and parts.netloc == "api.enablebanking.com"
        query = {k: v[0] for k, v in urllib.parse.parse_qs(parts.query).items()}
        body = json.loads(request.body) if request.body else None
        self.calls.append(
            Call(request.method, parts.path, query, body, dict(request.headers))
        )
        assert request.headers["Authorization"].startswith("Bearer ")
        assert not any(name.lower().startswith("psu-") for name in request.headers)
        for index, (method, prefix, status, error) in enumerate(self.failures):
            if method == request.method and parts.path.startswith(prefix):
                del self.failures[index]
                payload = {
                    "message": f"scripted {error}",
                    "code": status,
                    "error": error,
                }
                return HttpResponse(status, json.dumps(payload).encode())
        return self._route(request.method, parts.path, query, body)

    def _ok(self, payload: Any) -> HttpResponse:
        return HttpResponse(200, json.dumps(payload).encode())

    def _route(
        self, method: str, path: str, query: dict[str, str], body: Any
    ) -> HttpResponse:
        if method == "POST" and path == "/auth":
            return self._ok(
                {"url": self.auth_url, "authorization_id": "auth-1", "psu_id_hash": "h"}
            )
        if method == "POST" and path == "/sessions":
            return self._ok(
                {
                    "session_id": self.session_id,
                    "accounts": self.accounts,
                    "aspsp": {"name": "FinecoBank", "country": "IT"},
                    "psu_type": "personal",
                    "access": {"valid_until": self.valid_until},
                }
            )
        if method == "DELETE" and path.startswith("/sessions/"):
            return self._ok({"message": "OK"})
        if method == "GET" and path.endswith("/balances"):
            uid = path.split("/")[2]
            return self._ok({"balances": self.balances.get(uid, [])})
        if method == "GET" and path.endswith("/transactions"):
            uid = path.split("/")[2]
            pages = self.pages.get(uid, [([], None)])
            key = query.get("continuation_key")
            index = 0 if key is None else int(key.rsplit("-", 1)[1])
            items, following = pages[index]
            return self._ok({"transactions": items, "continuation_key": following})
        return HttpResponse(404, b'{"message": "not found"}')

    def requests(self, method: str, suffix: str) -> list[Call]:
        return [c for c in self.calls if c.method == method and c.path.endswith(suffix)]


def client_factory(bank: FakeBank) -> Callable[[Settings], EnableBankingClient]:
    def make(settings: Settings) -> EnableBankingClient:
        return EnableBankingClient(
            settings, transport=bank, token_factory=lambda now: f"h.c{now}.s"
        )

    return make


def account(
    uid: str,
    hash_: str,
    iban: str = "IT00X0000000000000000000000",
    name: str = "ROSSI MARIO",
) -> dict[str, Any]:
    return {
        "uid": uid,
        "identification_hash": hash_,
        "identification_hashes": [hash_],
        "account_id": {"iban": iban},
        "name": name,
        "currency": "EUR",
        "cash_account_type": "CACC",
    }
