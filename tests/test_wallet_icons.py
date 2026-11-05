import socket
from email.message import Message
from io import BytesIO

import pytest
from PIL import Image, PngImagePlugin

from app.services import wallet_icons
from app.services.profile_images import MAX_UPLOAD_BYTES
from app.services.wallet_icons import InvalidWalletIcon, WalletIconUnavailable, download_favicon


def image_bytes(format="PNG", size=(32, 32)):
    output = BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("private", "discard")
    Image.new("RGBA", size, "red").save(output, format, pnginfo=metadata)
    return output.getvalue()


@pytest.fixture
def remote(monkeypatch):
    class Transport:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def settimeout(self, timeout):
            pass

        def connect(self, address):
            self.address = address

    class Response(BytesIO):
        status = 200

        def __init__(self):
            super().__init__(remote.body)
            self.headers = Message()
            self.headers["Content-Type"] = remote.content_type

    class Connection:
        def __init__(self, host, timeout):
            self.host = host
            remote.connection = self

        def request(self, method, path, headers):
            remote.request = (method, path, headers)

        def getresponse(self):
            response = Response()
            response.status = remote.status
            return response

        def close(self):
            remote.closed = True

    class TLS:
        def wrap_socket(self, raw, server_hostname):
            remote.server_hostname = server_hostname
            return raw

    remote = type("Remote", (), {})()
    remote.body = image_bytes()
    remote.content_type = "image/png"
    remote.status = 200
    remote.closed = False
    remote.addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
    monkeypatch.setattr(wallet_icons.socket, "getaddrinfo", lambda *a, **k: remote.addresses)
    monkeypatch.setattr(wallet_icons.socket, "socket", lambda *a: Transport())
    monkeypatch.setattr(wallet_icons.ssl, "create_default_context", TLS)
    monkeypatch.setattr(wallet_icons.http.client, "HTTPSConnection", Connection)
    return remote


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/favicon.ico",
        "https://user:pass@example.com/favicon.ico",
        "https://example.com:8443/favicon.ico",
        "https://example.com/favicon.ico#fragment",
        "https://example.com/with space",
        "https://example.com/\r\nHeader: injected",
        "https://example.com\\@127.0.0.1/icon",
        "not-a-url",
    ],
)
def test_favicon_urls_are_validated_before_network_access(monkeypatch, url):
    def unexpected(*args, **kwargs):
        pytest.fail("Invalid URL reached DNS")

    monkeypatch.setattr(wallet_icons.socket, "getaddrinfo", unexpected)
    with pytest.raises(InvalidWalletIcon):
        download_favicon(url)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "192.168.1.1",
        "::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "224.0.0.1",
    ],
)
def test_favicons_refuse_any_private_or_non_unicast_dns_result(remote, address):
    remote.addresses.append((socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)))
    with pytest.raises(InvalidWalletIcon):
        download_favicon("https://example.com/favicon.ico")
    assert remote.closed
    assert not hasattr(remote, "request")


@pytest.mark.parametrize(
    ("format", "content_type"), [("PNG", "image/png"), ("ICO", "image/x-icon")]
)
def test_favicon_pins_checked_ip_and_normalizes_static_images(remote, format, content_type):
    remote.body = image_bytes(format)
    remote.content_type = content_type
    result = download_favicon("https://example.com/favicon.ico?size=32")
    assert remote.connection.sock.address == ("93.184.216.34", 443)
    assert remote.server_hostname == "example.com"
    assert remote.request[0:2] == ("GET", "/favicon.ico?size=32")
    assert "Authorization" not in remote.request[2]
    assert remote.closed
    with Image.open(BytesIO(result)) as image:
        assert image.format == "PNG"
        assert max(image.size) <= 256
        assert "private" not in image.info


@pytest.mark.parametrize("status", [301, 302, 307, 404, 500])
def test_favicon_does_not_follow_redirects_or_accept_error_bodies(remote, status):
    remote.status = status
    with pytest.raises(InvalidWalletIcon):
        download_favicon("https://example.com/favicon.ico")
    assert remote.closed


@pytest.mark.parametrize(
    ("body", "content_type"),
    [
        (b"", "image/png"),
        (b"not an image", "image/png"),
        (b"<svg/>", "image/svg+xml"),
        (b"x" * (MAX_UPLOAD_BYTES + 1), "image/png"),
        (image_bytes(), "image/webp"),
        (image_bytes(size=(4097, 1)), "image/png"),
    ],
)
def test_invalid_or_oversized_favicons_are_rejected(remote, body, content_type):
    remote.body = body
    remote.content_type = content_type
    with pytest.raises(InvalidWalletIcon):
        download_favicon("https://example.com/favicon.ico")
    assert remote.closed


def test_favicon_network_failure_is_explicit(remote, monkeypatch):
    def unavailable(*args, **kwargs):
        raise socket.gaierror

    monkeypatch.setattr(wallet_icons.socket, "getaddrinfo", unavailable)
    with pytest.raises(WalletIconUnavailable):
        download_favicon("https://example.com/favicon.ico")
    assert remote.closed
