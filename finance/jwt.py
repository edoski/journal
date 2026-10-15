"""RS256 JSON Web Tokens for Enable Banking, signed by the system `openssl`.

Enable Banking authorises every call with a JWT: header `typ` JWT, `alg`
RS256, `kid` the application id; claims `iss` enablebanking.com, `aud`
api.enablebanking.com, `iat` and `exp` (at most 24 hours apart). Python's
standard library has no RSA signing, so the SHA-256 PKCS#1 v1.5 signature is
made by `openssl dgst -sha256 -sign <key>` (LibreSSL on macOS); the key never
passes through this process.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
from collections.abc import Mapping
from pathlib import Path

from finance.config import JWT_AUDIENCE, JWT_ISSUER

TOKEN_SECONDS = 3600
SYSTEM_OPENSSL = "/usr/bin/openssl"


class SigningError(RuntimeError):
    """The token could not be signed."""


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _compact(payload: Mapping[str, object]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def openssl_binary() -> str:
    """The system LibreSSL first, so launchd's short PATH does not matter."""
    if os.access(SYSTEM_OPENSSL, os.X_OK):
        return SYSTEM_OPENSSL
    found = shutil.which("openssl")
    if found is None:
        raise SigningError("openssl was not found")
    return found


def sign_rs256(message: bytes, key_path: Path, *, openssl: str | None = None) -> bytes:
    """Sign with SHA-256 and RSA PKCS#1 v1.5 using the key file at `key_path`."""
    if not key_path.is_file():
        raise SigningError(f"private key not found: {key_path}")
    try:
        result = subprocess.run(
            [openssl or openssl_binary(), "dgst", "-sha256", "-sign", str(key_path)],
            input=message,
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SigningError(f"openssl could not sign: {exc}") from exc
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()
        reason = detail[0] if detail else f"exit status {result.returncode}"
        raise SigningError(f"openssl could not sign with {key_path}: {reason}")
    return result.stdout


def make_token(
    application_id: str,
    key_path: Path,
    *,
    now: int,
    lifetime: int = TOKEN_SECONDS,
    openssl: str | None = None,
) -> str:
    """Return a signed token valid from `now` for `lifetime` seconds."""
    header = {"alg": "RS256", "kid": application_id, "typ": "JWT"}
    claims = {
        "aud": JWT_AUDIENCE,
        "exp": now + lifetime,
        "iat": now,
        "iss": JWT_ISSUER,
    }
    signing_input = f"{_b64url(_compact(header))}.{_b64url(_compact(claims))}"
    signature = sign_rs256(signing_input.encode("ascii"), key_path, openssl=openssl)
    return f"{signing_input}.{_b64url(signature)}"
