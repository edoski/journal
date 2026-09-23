from pathlib import Path

import pytest

from learning.visuals import publish_svg, validate_svg


SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0 L50 50" stroke="black"/></svg>'


def test_publication_reuses_exact_content_and_preserves_earlier_asset(
    tmp_path: Path,
) -> None:
    first = publish_svg(tmp_path, "A vector", SVG)
    path = Path(first["path"])
    modified = path.stat().st_mtime_ns
    assert publish_svg(tmp_path, "A vector", SVG + "\n") == first
    assert path.stat().st_mtime_ns == modified
    second = publish_svg(tmp_path, "A vector", SVG.replace("L50 50", "L80 50"))
    assert first != second
    assert path.read_text() == SVG + "\n"
    assert first["embed"] == f"![Study diagram](../assets/{path.name})"


def test_custom_asset_directory_and_vault_boundary(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    result = publish_svg(vault, "../../A vector", SVG, assets=vault / "figures")
    assert result["embed"].startswith("![Study diagram](../../figures/a-vector-")
    with pytest.raises(ValueError, match="inside the vault"):
        publish_svg(vault, "Outside", SVG, assets=tmp_path / "outside")
    assert not (tmp_path / "outside").exists()


def test_local_svg_references_are_supported() -> None:
    validate_svg(
        SVG.replace(
            "<path ",
            '<defs><marker id="arrow"><path d="M0 0 L1 1"/></marker></defs><path marker-end="url(#arrow)" ',
        )
    )


@pytest.mark.parametrize(
    "content",
    [
        SVG.replace("<path ", "<script>alert(1)</script><path "),
        SVG.replace("<path ", '<image href="https://example.org/image.svg"/><path '),
        SVG.replace("<path ", '<path onload="alert(1)" '),
        SVG.replace("<path ", '<path style="fill:red" '),
        SVG.replace("<path ", '<use href="https://example.org/a.svg#x"/><path '),
        SVG.replace('stroke="black"', 'stroke="url(https://example.org/x)"'),
        '<?xml-stylesheet href="https://example.org/x.css"?>' + SVG,
        '<!DOCTYPE svg [<!ENTITY x "data">]>' + SVG,
        SVG.replace("0 0 100 100", "0 0 nan 100"),
        SVG.replace("0 0 100 100", "0 0 -1 100"),
        "<html/>",
        "<svg",
    ],
)
def test_unsupported_svg_is_rejected_before_writing(
    tmp_path: Path, content: str
) -> None:
    with pytest.raises(ValueError):
        publish_svg(tmp_path, "Invalid", content)
    assert list(tmp_path.iterdir()) == []


def test_conflicting_or_linked_asset_is_not_overwritten(tmp_path: Path) -> None:
    path = Path(publish_svg(tmp_path, "Vector", SVG)["path"])
    path.write_text("user replacement")
    with pytest.raises(ValueError, match="different visual content"):
        publish_svg(tmp_path, "Vector", SVG)
    path.unlink()
    original = tmp_path / "original.svg"
    original.write_text(SVG)
    path.symlink_to(original)
    with pytest.raises(ValueError, match="linked visual"):
        publish_svg(tmp_path, "Vector", SVG)
    assert original.read_text() == SVG
