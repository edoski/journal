import json
from pathlib import Path

import pytest

from learning import preferences
from learning.workspace import support_directory


def stored() -> object:
    return json.loads(preferences.global_path().read_text())


def test_validate_normalizes_instructions_and_null_deletes() -> None:
    assert preferences.validate(
        {"teaching_style": "  Example first ", "pace": None}, "preferences"
    ) == {"teaching_style": "Example first", "pace": None}
    assert preferences.validate({}, "preferences") == {}


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ([], "global_preferences must be an object mapping dimensions"),
        ({"Teaching Style": "x"}, "did you mean 'teaching_style'"),
        ({"1pace": "x"}, "global_preferences: invalid dimension"),
        ({"x" * 41: "x"}, "invalid dimension"),
        ({"pace": ""}, r"global_preferences\.pace must be a nonempty instruction"),
        ({"pace": 3}, "nonempty instruction"),
    ],
)
def test_validate_names_the_field_and_the_fix(changes: object, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        preferences.validate(changes, "global_preferences")


def test_dimension_names_suggest_the_valid_form() -> None:
    assert preferences.dimension_name("Teaching Style") == "teaching_style"
    assert preferences.dimension_name("visual-medium") == "visual_medium"
    assert preferences.dimension_name("2 columns") == "d_2_columns"
    assert preferences.DIMENSION.fullmatch(preferences.dimension_name("x" * 60))


def test_merge_replaces_deletes_and_orders_by_dimension() -> None:
    assert preferences.merge(
        {"pace": "Slow", "format": "Short"}, {"pace": None, "depth": "Deep"}
    ) == {"depth": "Deep", "format": "Short"}


def test_global_file_round_trips_with_its_exact_shape() -> None:
    assert preferences.global_path() == support_directory() / "preferences.json"
    assert preferences.read_global() == {}
    assert preferences.save_global({"pace": "Slow", "format": "Short"}) == {
        "format": "Short",
        "pace": "Slow",
    }
    assert stored() == {
        "schema": 1,
        "preferences": {"format": "Short", "pace": "Slow"},
    }
    assert preferences.save_global({"pace": None}) == {"format": "Short"}
    assert preferences.read_global() == {"format": "Short"}


def test_unchanged_or_empty_saves_write_nothing() -> None:
    assert preferences.save_global({"pace": None}) == {}
    assert not preferences.global_path().exists()
    preferences.save_global({"pace": "Slow"})
    modified = preferences.global_path().stat().st_mtime_ns
    assert preferences.save_global({"pace": "Slow"}) == {"pace": "Slow"}
    assert preferences.global_path().stat().st_mtime_ns == modified


@pytest.mark.parametrize(
    "contents",
    [
        "[]",
        '{"schema_version": 1, "rules": []}',
        '{"schema": 2, "preferences": {}}',
        '{"schema": 1, "preferences": {"Pace": "x"}}',
        '{"schema": 1, "preferences": {"pace": null}}',
        '{"schema": 1, "preferences": {}, "extra": 1}',
    ],
)
def test_invalid_global_file_is_an_error_that_is_never_overwritten(
    contents: str,
) -> None:
    path: Path = preferences.global_path()
    path.parent.mkdir(parents=True)
    path.write_text(contents)
    with pytest.raises(ValueError):
        preferences.read_global()
    with pytest.raises(ValueError):
        preferences.save_global({"pace": "Slow"})
    assert path.read_text() == contents


def test_effective_preferences_let_the_course_win_per_dimension() -> None:
    assert preferences.effective({"pace": "Course"}) == {"pace": "Course"}
    preferences.save_global({"pace": "Global", "format": "Short"})
    assert preferences.effective({"pace": "Course", "depth": "Deep"}) == {
        "depth": "Deep",
        "format": "Short",
        "pace": "Course",
    }
