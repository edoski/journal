from pathlib import Path
from uuid import uuid4

import pytest

from learning import lessons, storage


def test_lesson_metadata_never_replaces_teaching_headings(tmp_path: Path) -> None:
    session = str(uuid4())
    storage.update(tmp_path / "state/smm.json", 0, lambda _: {"title": "SMM"})
    path = lessons.publish(tmp_path, session, "# Linear maps\n\nText.")
    lessons.label(tmp_path, session, title="Singular systems", scope="smm")
    lessons.publish(tmp_path, session, "# Linear maps\n\nNext explanation.")
    assert "# Linear maps\n\nNext explanation." in path.read_text()
    assert '"title":"Singular systems"' in path.read_text()
    assert not (tmp_path / "index.md").exists()
    assert not (tmp_path / "courses").exists()
    before = path.read_text()
    with pytest.raises(ValueError, match="unknown lesson scope"):
        lessons.label(tmp_path, session, title="Maps", scope="unknown")
    assert path.read_text() == before
    path.write_text("# Personal note\n")
    with pytest.raises(ValueError, match="unowned lesson"):
        lessons.label(tmp_path, session, title="Do not overwrite")
    assert path.read_text() == "# Personal note\n"


def test_empty_projection_preserves_identity_without_creating_a_note(
    tmp_path: Path,
) -> None:
    session = str(uuid4())
    path = lessons.publish(tmp_path, session, "")
    assert not path.exists()
    lessons.publish(tmp_path, session, "## Linear maps\n\nPrior teaching.")
    lessons.publish(tmp_path, session, "")
    assert '"title":"Linear maps"' in path.read_text()
    assert "Prior teaching" not in path.read_text()
    storage.update(tmp_path / "state/smm.json", 0, lambda _: {"title": "SMM"})
    lessons.label(tmp_path, session, title="Named lesson", scope="smm")
    lessons.publish(tmp_path, session, "New teaching.")
    lessons.publish(tmp_path, session, "")
    assert '"title":"Named lesson"' in path.read_text()
    assert '"named":true,"scope":"smm"' in path.read_text()
    assert "New teaching" not in path.read_text()
    before = path.read_text()
    lessons.publish(tmp_path, session, "")
    assert path.read_text() == before
    path.write_text("# Personal note\n")
    with pytest.raises(ValueError, match="unowned lesson"):
        lessons.publish(tmp_path, session, "")
    assert path.read_text() == "# Personal note\n"


def test_lesson_publisher_updates_only_its_owned_note(tmp_path: Path) -> None:
    session_id = str(uuid4())
    path = lessons.publish(tmp_path, session_id, "# Lesson\n\nFirst turn.")
    assert "# Lesson\n\nFirst turn.\n" in path.read_text(encoding="utf-8")
    modified = path.stat().st_mtime_ns
    assert lessons.publish(tmp_path, session_id, "# Lesson\n\nFirst turn.") == path
    assert path.stat().st_mtime_ns == modified
    assert lessons.publish(tmp_path, session_id, "# Lesson\n\nNext turn.") == path
    assert "# Lesson\n\nNext turn.\n" in path.read_text(encoding="utf-8")
    user_note = "# My note\n\nKeep this content.\n"
    path.write_text(user_note, encoding="utf-8")
    with pytest.raises(ValueError, match="unowned lesson"):
        lessons.publish(tmp_path, session_id, "Replacement")
    assert path.read_text(encoding="utf-8") == user_note


def test_learner_notes_survive_corrections_restart_and_empty_branches(
    tmp_path: Path,
) -> None:
    session = str(uuid4())
    path = lessons.publish(tmp_path, session, "# Maps\n\nFirst explanation.")
    path.write_text(
        path.read_text().replace(
            "<!-- learning-generated:start -->",
            "My reminder above.\n\n<!-- learning-generated:start -->",
        )
        + "\nMy handwritten example belongs here.\n"
    )
    for teaching in (
        "# Maps\n\nCorrected explanation.",
        "",
        "# Maps\n\nResumed explanation.",
    ):
        lessons.publish(tmp_path, session, teaching)
        text = path.read_text()
        assert text.count("My reminder above.") == 1
        assert text.count("My handwritten example belongs here.") == 1
    before = path.read_text()
    lessons.publish(tmp_path, session, "# Maps\n\nResumed explanation.")
    assert path.read_text() == before


def test_edits_inside_generated_teaching_are_never_overwritten(tmp_path: Path) -> None:
    session = str(uuid4())
    path = lessons.publish(tmp_path, session, "Teaching.")
    path.write_text(
        path.read_text().replace("Teaching.", "Teaching with my correction.")
    )
    edited = path.read_text()
    with pytest.raises(lessons.LessonConflict, match="teaching was edited"):
        lessons.publish(tmp_path, session, "Next teaching.")
    assert path.read_text() == edited
    lessons.label(tmp_path, session, title="My course")
    labelled = path.read_text()
    with pytest.raises(lessons.LessonConflict):
        lessons.publish(tmp_path, session, "")
    assert path.read_text() == labelled
    assert "Teaching with my correction." in labelled


@pytest.mark.parametrize(
    "incoming", ["Prior teaching.\n\nMy personal annotation.", "New teaching.", ""]
)
def test_existing_unmarked_notes_are_adopted_without_losing_content(
    tmp_path: Path, incoming: str
) -> None:
    session = str(uuid4())
    path = tmp_path / "sessions" / f"{session}.md"
    path.parent.mkdir()
    original = "Prior teaching.\n\nMy personal annotation.\n"
    path.write_text(
        f'<!-- learning-session:{session} -->\n<!-- learning-lesson:{{"title":"Old session"}} -->\n\n{original}'
    )
    lessons.publish(tmp_path, session, incoming)
    assert original in path.read_text()
    assert path.read_text().count(original) == 1
    before = path.read_text()
    lessons.publish(tmp_path, session, incoming)
    assert path.read_text() == before


def test_tampered_region_markers_fail_without_changing_notes(tmp_path: Path) -> None:
    session = str(uuid4())
    path = lessons.publish(tmp_path, session, "Teaching.")
    path.write_text(path.read_text().replace("<!-- learning-generated:end -->", ""))
    before = path.read_text()
    with pytest.raises(lessons.LessonConflict, match="no intact generated region"):
        lessons.publish(tmp_path, session, "Replacement.")
    assert path.read_text() == before
