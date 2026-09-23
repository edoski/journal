"""Publish self-contained study diagrams for native Obsidian embedding."""

from __future__ import annotations

from hashlib import sha256
import math
import os
from pathlib import Path
import re
from urllib.parse import quote
import xml.etree.ElementTree as ET

from learning import storage

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
ELEMENTS = {
    "svg",
    "g",
    "path",
    "line",
    "rect",
    "circle",
    "ellipse",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "title",
    "desc",
    "defs",
    "marker",
    "clipPath",
    "linearGradient",
    "radialGradient",
    "stop",
    "use",
}
ELEMENT_TAGS = {f"{{{SVG_NAMESPACE}}}{name}" for name in ELEMENTS}
LOCAL_URL = re.compile(r"url\(\s*(['\"]?)#[\w.-]+\1\s*\)", re.IGNORECASE)


def validate_svg(svg: str) -> None:
    """Accept an authored static SVG subset, not arbitrary exported web content."""
    document = re.sub(r"^\s*<\?xml\s[^?]*\?>", "", svg, count=1)
    if "<?" in document or re.search(r"<!\s*(DOCTYPE|ENTITY)", document, re.I):
        raise ValueError("SVG must not contain processing instructions or entities")
    try:
        root = ET.fromstring(document)
    except ET.ParseError as error:
        raise ValueError(f"invalid SVG XML: {error}") from error
    if root.tag != f"{{{SVG_NAMESPACE}}}svg":
        raise ValueError("SVG root needs xmlns='http://www.w3.org/2000/svg'")
    try:
        box = [
            float(value)
            for value in re.split(r"[\s,]+", root.attrib["viewBox"].strip())
        ]
    except (KeyError, ValueError) as error:
        raise ValueError(
            "SVG needs a finite viewBox with positive width and height"
        ) from error
    if len(box) != 4 or not all(map(math.isfinite, box)) or min(box[2:]) <= 0:
        raise ValueError("SVG needs a finite viewBox with positive width and height")
    for element in root.iter():
        if element.tag not in ELEMENT_TAGS:
            raise ValueError(f"unsupported static SVG element: {element.tag}")
        for name, value in element.attrib.items():
            if name.startswith("{") and name != f"{{{XLINK_NAMESPACE}}}href":
                raise ValueError(f"unsupported SVG attribute namespace: {name}")
            attribute = name.rsplit("}", 1)[-1].lower()
            if attribute == "style" or attribute.startswith("on") or "\\" in value:
                raise ValueError(
                    "use static SVG presentation attributes, without styles or events"
                )
            if attribute == "href" and not re.fullmatch(r"#[\w.-]+", value):
                raise ValueError("SVG references must point to local fragment IDs")
            remainder = LOCAL_URL.sub("", value)
            if re.search(r"url\s*\(", remainder, re.I):
                raise ValueError("SVG URLs must point to local fragment IDs")


def publish_svg(
    vault: Path, title: str, svg: str, *, assets: Path | None = None
) -> dict[str, str]:
    """Atomically publish a diagram without replacing an earlier diagram."""
    if not title.strip():
        raise ValueError("a visual needs a title")
    content = svg.strip() + "\n"
    validate_svg(content)
    vault = vault.expanduser().resolve()
    directory = (assets or vault / ".study/assets").expanduser().resolve()
    if not directory.is_relative_to(vault):
        raise ValueError(
            "learning assets must be inside the vault for Obsidian embedding"
        )
    stem = re.sub(r"[^\w-]+", "-", title.lower()).strip("-_")[:70] or "diagram"
    digest = sha256(content.encode("utf-8")).hexdigest()[:16]
    path = directory / f"{stem}-{digest}.svg"
    with storage.lock(directory / f".{path.stem}.lock"):
        if path.is_symlink():
            raise ValueError("refusing to replace a linked visual")
        if path.exists():
            if path.read_text(encoding="utf-8") != content:
                raise ValueError("refusing to replace different visual content")
        else:
            storage.publish_text(path, content)
    relative = quote(os.path.relpath(path, vault / ".study/lessons"))
    return {"path": str(path), "embed": f"![Study diagram]({relative})"}
