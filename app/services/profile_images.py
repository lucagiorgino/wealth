import warnings
from io import BytesIO

from PIL import Image, ImageOps

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
MAX_AVATAR_DIMENSION = 256
IMAGE_TYPES = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}


class InvalidProfileImage(Exception):
    pass


def normalize_avatar(data: bytes, content_type: str) -> bytes:
    return normalize_image(data, content_type, IMAGE_TYPES)


def normalize_image(data: bytes, content_type: str, image_types: dict[str, str]) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=list(image_types.values())) as image:
                if (
                    image.format != image_types[content_type]
                    or max(image.size) > MAX_IMAGE_DIMENSION
                    or getattr(image, "n_frames", 1) != 1
                ):
                    raise InvalidProfileImage
                image.verify()
            with Image.open(BytesIO(data), formats=list(image_types.values())) as image:
                image.load()
                oriented = ImageOps.exif_transpose(image)
                oriented.thumbnail((MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION))
                clean = Image.new("RGBA", oriented.size)
                clean.paste(oriented.convert("RGBA"))
                output = BytesIO()
                clean.save(output, format="PNG")
                return output.getvalue()
    except (
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InvalidProfileImage from None
