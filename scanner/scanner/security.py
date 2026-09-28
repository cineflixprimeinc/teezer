"""SSRF/LFI guards for the download_url / file_path inputs scan requests
carry. Both ImageScanner and VideoScanner take the same two fields and
previously fetched/read them with no validation at all - a caller (anything
that can reach this service, not just Laravel) could point download_url at
an internal address or file_path at an arbitrary on-disk file.
"""

import ipaddress
import os
import socket
from urllib.parse import urlparse

# Always blocked regardless of ALLOWED_DOWNLOAD_HOSTS - these are the actual
# SSRF targets (cloud metadata endpoints, localhost admin ports, other boxes
# on the private network), not just "not our storage host".
_BLOCKED_NETS = [
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
    )
]


def _is_blocked_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # unparseable - treat as unsafe rather than let it through
    return any(addr in net for net in _BLOCKED_NETS)


def validate_download_url(url: str) -> None:
    """Raises ValueError if url isn't a safe http(s) target to fetch."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("download_url must be http:// or https://")
    host = parsed.hostname
    if not host:
        raise ValueError("download_url is missing a host")

    allowed = [h.strip().lower() for h in os.getenv("ALLOWED_DOWNLOAD_HOSTS", "").split(",") if h.strip()]
    if allowed and host.lower() not in allowed:
        raise ValueError(f"download_url host '{host}' is not in ALLOWED_DOWNLOAD_HOSTS")

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError(f"download_url host '{host}' could not be resolved") from exc
    if any(_is_blocked_ip(info[4][0]) for info in infos):
        raise ValueError(f"download_url host '{host}' resolves to a private/internal address")


def validate_file_path(path: str) -> None:
    """Raises ValueError if path isn't inside an ALLOWED_FILE_ROOTS entry.

    Unset ALLOWED_FILE_ROOTS is intentionally permissive (matches the prior
    behaviour) - this branch only fires for the local/public disk, which
    production doesn't use (see ModerationService::buildPayload()), and
    self-hosted deployments on that disk need to opt in with the actual
    storage root rather than have it guessed at.
    """
    roots = [r.strip() for r in os.getenv("ALLOWED_FILE_ROOTS", "").split(",") if r.strip()]
    if not roots:
        return
    real = os.path.realpath(path)
    if not any(real == os.path.realpath(r) or real.startswith(os.path.realpath(r) + os.sep) for r in roots):
        raise ValueError(f"file_path '{path}' is outside ALLOWED_FILE_ROOTS")
