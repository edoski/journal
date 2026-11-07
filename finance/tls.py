"""A verifying TLS context that also works in the bundled Journal.app Python.

The app runs a relocated uv-managed CPython whose OpenSSL looks for roots at
compiled-in default paths. On this Mac those point at `/private/etc/ssl`, but
nothing guarantees it for every build, and an empty store would make every
request fail. So the context starts from Python's defaults (which also honour
`SSL_CERT_FILE`) and, only if that loads no root at all, adds the macOS system
roots: exported once per process from the System Roots keychain with
`/usr/bin/security`, falling back to the LibreSSL bundle `/etc/ssl/cert.pem`
that macOS ships. Verification and hostname checks stay on in every case; with
no roots at all the call fails instead of connecting unverified.
"""

from __future__ import annotations

import functools
import ssl
import subprocess
from collections.abc import Callable
from pathlib import Path

SYSTEM_ROOTS_KEYCHAIN = "/System/Library/Keychains/SystemRootCertificates.keychain"
SYSTEM_CERT_BUNDLE = Path("/etc/ssl/cert.pem")


class TrustError(RuntimeError):
    """No trusted root certificates could be loaded."""


def export_system_roots() -> str | None:
    """PEM text of the macOS system roots (public certificates only)."""
    try:
        result = subprocess.run(
            [
                "/usr/bin/security",
                "find-certificate",
                "-a",
                "-p",
                SYSTEM_ROOTS_KEYCHAIN,
            ],
            capture_output=True,
            check=False,
            timeout=30,
            text=True,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or "BEGIN CERTIFICATE" not in result.stdout:
        return None
    return result.stdout


def _root_count(context: ssl.SSLContext) -> int:
    return int(context.cert_store_stats().get("x509_ca", 0))


def build_context(
    *,
    export: Callable[[], str | None] = export_system_roots,
    bundle: Path = SYSTEM_CERT_BUNDLE,
) -> ssl.SSLContext:
    """A client context with certificate and hostname verification."""
    context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    if _root_count(context) == 0:
        roots = export()
        if roots:
            try:
                context.load_verify_locations(cadata=roots)
            except ssl.SSLError:
                pass
    if _root_count(context) == 0 and bundle.is_file():
        try:
            context.load_verify_locations(cafile=str(bundle))
        except ssl.SSLError:
            pass
    if _root_count(context) == 0:
        raise TrustError(
            "no trusted root certificates: Python's defaults, the macOS system "
            f"roots and {bundle} all gave none"
        )
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise TrustError("TLS verification is not enabled")
    return context


@functools.cache
def default_context() -> ssl.SSLContext:
    """The process-wide context (roots are loaded once per process)."""
    return build_context()
