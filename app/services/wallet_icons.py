import http.client
import ipaddress
import socket
import ssl
from contextlib import suppress
from threading import Timer
from time import monotonic
from urllib.parse import urlsplit

from app.services.profile_images import (
    IMAGE_TYPES,
    MAX_UPLOAD_BYTES,
    InvalidProfileImage,
    normalize_image,
)

FAVICON_TYPES = {**IMAGE_TYPES, "image/x-icon": "ICO", "image/vnd.microsoft.icon": "ICO"}


class InvalidWalletIcon(Exception):
    pass


class WalletIconUnavailable(Exception):
    pass


def favicon_target(url: str) -> tuple[str, str]:
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
            or parsed.fragment
            or "\\" in url
            or any(ord(char) <= 32 or ord(char) == 127 for char in url)
        ):
            raise InvalidWalletIcon
        host = parsed.hostname.encode("idna").decode("ascii")
        path = parsed.path or "/"
        if parsed.query:
            path += "?" + parsed.query
        path.encode("ascii")
        return host, path
    except (ValueError, UnicodeError):
        raise InvalidWalletIcon from None


def download_favicon(url: str) -> bytes:
    host, path = favicon_target(url)
    connection = http.client.HTTPSConnection(host, timeout=2)
    deadline = monotonic() + 3
    timer = None
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(
            not ipaddress.ip_address(address[4][0]).is_global
            or ipaddress.ip_address(address[4][0]).is_multicast
            for address in addresses
        ):
            raise InvalidWalletIcon
        if monotonic() >= deadline:
            raise WalletIconUnavailable
        # Connect to the checked address, retaining the hostname for TLS and Host.
        family, socktype, proto, _, address = addresses[0]
        with socket.socket(family, socktype, proto) as raw:
            raw.settimeout(2)
            raw.connect(address)
            connection.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=host)
        transport = connection.sock

        def expire():
            # Interrupt slow response headers as well as a trickling image body.
            with suppress(OSError):
                transport.shutdown(socket.SHUT_RDWR)

        timer = Timer(max(0, deadline - monotonic()), expire)
        timer.daemon = True
        timer.start()
        connection.request("GET", path, headers={"Accept": ", ".join(FAVICON_TYPES)})
        with connection.getresponse() as response:
            if response.status != 200:
                raise InvalidWalletIcon
            content_type = response.headers.get_content_type()
            if content_type not in FAVICON_TYPES:
                raise InvalidWalletIcon
            chunks = []
            size = 0
            while size <= MAX_UPLOAD_BYTES:
                remaining = deadline - monotonic()
                if remaining <= 0:
                    raise WalletIconUnavailable
                transport.settimeout(remaining)
                chunk = response.read1(min(65536, MAX_UPLOAD_BYTES + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
            data = b"".join(chunks)
            if not data or len(data) > MAX_UPLOAD_BYTES:
                raise InvalidWalletIcon
        return normalize_image(data, content_type, FAVICON_TYPES)
    except InvalidProfileImage:
        raise InvalidWalletIcon from None
    except (OSError, http.client.HTTPException):
        raise WalletIconUnavailable from None
    finally:
        if timer is not None:
            timer.cancel()
        connection.close()
