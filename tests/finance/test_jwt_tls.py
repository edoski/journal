"""RS256 signing with a throwaway key, and the TLS context."""

from __future__ import annotations

import base64
import json
import ssl
import subprocess
from pathlib import Path

import pytest

from finance import tls
from finance.client import EnableBankingClient, HttpRequest, HttpResponse
from finance.config import Settings
from finance.jwt import SigningError, make_token


def _segment(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _verify(
    token: str, key: Path, tmp_path: Path
) -> subprocess.CompletedProcess[bytes]:
    header, claims, signature = token.split(".")
    public = tmp_path / "public.pem"
    subprocess.run(
        ["/usr/bin/openssl", "rsa", "-in", str(key), "-pubout", "-out", str(public)],
        check=True,
        capture_output=True,
    )
    sig = tmp_path / "sig.bin"
    sig.write_bytes(_segment(signature))
    return subprocess.run(
        [
            "/usr/bin/openssl",
            "dgst",
            "-sha256",
            "-verify",
            str(public),
            "-signature",
            str(sig),
        ],
        input=f"{header}.{claims}".encode(),
        capture_output=True,
        check=False,
    )


def test_token_has_enable_bankings_header_and_claims_and_verifies(
    rsa_key: Path, tmp_path: Path
) -> None:
    token = make_token("app-id-123", rsa_key, now=1_800_000_000)
    header, claims, _ = token.split(".")
    assert json.loads(_segment(header)) == {
        "alg": "RS256",
        "kid": "app-id-123",
        "typ": "JWT",
    }
    assert json.loads(_segment(claims)) == {
        "aud": "api.enablebanking.com",
        "exp": 1_800_003_600,
        "iat": 1_800_000_000,
        "iss": "enablebanking.com",
    }
    result = _verify(token, rsa_key, tmp_path)
    assert result.returncode == 0, result.stderr
    assert b"Verified OK" in result.stdout


def test_a_tampered_token_does_not_verify(rsa_key: Path, tmp_path: Path) -> None:
    token = make_token("app-id-123", rsa_key, now=1_800_000_000)
    header, _, signature = token.split(".")
    forged_claims = base64.urlsafe_b64encode(b'{"iss":"x"}').rstrip(b"=").decode()
    assert (
        _verify(f"{header}.{forged_claims}.{signature}", rsa_key, tmp_path).returncode
        != 0
    )


def test_a_pkcs8_key_signs_too(rsa_key: Path, tmp_path: Path) -> None:
    pkcs8 = tmp_path / "pkcs8.pem"
    subprocess.run(
        [
            "/usr/bin/openssl",
            "pkcs8",
            "-topk8",
            "-nocrypt",
            "-in",
            str(rsa_key),
            "-out",
            str(pkcs8),
        ],
        check=True,
        capture_output=True,
    )
    assert pkcs8.read_text().startswith("-----BEGIN PRIVATE KEY-----")
    token = make_token("app", pkcs8, now=1_800_000_000)
    assert _verify(token, pkcs8, tmp_path).returncode == 0


def test_signing_fails_clearly_without_a_usable_key(tmp_path: Path) -> None:
    with pytest.raises(SigningError, match="not found"):
        make_token("app", tmp_path / "missing.pem", now=1)
    garbage = tmp_path / "garbage.pem"
    garbage.write_text("not a key")
    with pytest.raises(SigningError, match="could not sign"):
        make_token("app", garbage, now=1)


def test_the_client_reuses_a_token_until_close_to_expiry() -> None:
    issued: list[int] = []
    clock = {"now": 1000.0}

    def token(now: int) -> str:
        issued.append(now)
        return f"t{now}"

    seen: list[str] = []

    def transport(request: HttpRequest) -> HttpResponse:
        seen.append(request.headers["Authorization"])
        return HttpResponse(200, b'{"balances": []}')

    client = EnableBankingClient(
        Settings("app", Path("k")),
        transport=transport,
        clock=lambda: clock["now"],
        token_factory=token,
    )
    client.balances("u")
    clock["now"] = 1000.0 + 3000
    client.balances("u")
    clock["now"] = 1000.0 + 3400
    client.balances("u")
    assert issued == [1000, 4400]
    assert seen == ["Bearer t1000", "Bearer t1000", "Bearer t4400"]


def _empty_context(purpose: ssl.Purpose = ssl.Purpose.SERVER_AUTH) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return context


def test_tls_uses_python_defaults_when_they_hold_roots() -> None:
    called: list[bool] = []
    context = tls.build_context(export=lambda: called.append(True) or None)
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    assert context.cert_store_stats()["x509_ca"] > 0
    assert called == []


def test_tls_falls_back_to_the_system_roots_then_the_bundle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(tls.ssl, "create_default_context", _empty_context)
    pem = Path("/etc/ssl/cert.pem").read_text()
    exported = tls.build_context(export=lambda: pem, bundle=Path("/nonexistent"))
    assert exported.cert_store_stats()["x509_ca"] > 0
    bundled = tls.build_context(export=lambda: None)
    assert bundled.cert_store_stats()["x509_ca"] > 0
    assert bundled.verify_mode == ssl.CERT_REQUIRED and bundled.check_hostname


def test_tls_refuses_to_run_without_roots(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tls.ssl, "create_default_context", _empty_context)
    with pytest.raises(tls.TrustError):
        tls.build_context(export=lambda: None, bundle=Path("/nonexistent"))


def test_the_system_roots_export_command(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []

    def fake_run(args, **kwargs):  # type: ignore[no-untyped-def]
        seen.append(args)
        return subprocess.CompletedProcess(
            args, 0, stdout="-----BEGIN CERTIFICATE-----\n", stderr=""
        )

    monkeypatch.setattr(tls.subprocess, "run", fake_run)
    assert tls.export_system_roots() == "-----BEGIN CERTIFICATE-----\n"
    assert seen == [
        [
            "/usr/bin/security",
            "find-certificate",
            "-a",
            "-p",
            "/System/Library/Keychains/SystemRootCertificates.keychain",
        ]
    ]
