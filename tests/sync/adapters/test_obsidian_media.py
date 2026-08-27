"""Observable contract tests for ObsidianMediaSource."""

from __future__ import annotations

import datetime
from pathlib import Path

import pytest

from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.obsidian_media import ObsidianMediaSource
from sync.contracts.media import MediaItem
from sync.contracts.notes import NotePublication
from sync.ports.notes import NoteUpdater


class _StubMediaCacheStore:
    def __init__(self, state: dict | None = None) -> None:
        self.state = state or {"books": {}, "podcasts": {}}
        self.saved: list[dict] = []

    def load(self):
        return self.state

    def save(self, state):
        self.state = state
        self.saved.append(state)


def _write_note(path: Path, frontmatter: list[str]) -> None:
    path.write_text(
        "\n".join(["---", *frontmatter, "---", "Body"]),
        encoding="utf-8",
    )


def _note_store(tmp_path: Path) -> MarkdownNoteStore:
    return MarkdownNoteStore(lock_root=str(tmp_path / "note-locks"))


class _ConcurrentEditStore(MarkdownNoteStore):
    def __init__(self, tmp_path: Path, edit: NoteUpdater) -> None:
        super().__init__(lock_root=str(tmp_path / "note-locks"))
        self.edit = edit
        self.injected = False

    def update(
        self,
        path: str,
        updater: NoteUpdater,
        *,
        template_path: str | None = None,
    ) -> NotePublication:
        if not self.injected:
            self.injected = True
            super().update(path, self.edit)
        return super().update(path, updater, template_path=template_path)


class _FailingNoteStore(MarkdownNoteStore):
    def update(
        self,
        path: str,
        updater: NoteUpdater,
        *,
        template_path: str | None = None,
    ) -> NotePublication:
        _ = (path, updater, template_path)
        raise PermissionError("publication denied")


def test_scan_returns_sorted_in_range_media_and_updates_cache(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    _write_note(
        books_dir / "Later.md",
        ["completed: '[[2026-01-20]]'", "author: B"],
    )
    _write_note(
        books_dir / "Earlier.md",
        ["completed: 2026-01-05", "author: A"],
    )
    _write_note(
        books_dir / "Outside.md",
        ["completed: 2025-12-31", "author: C"],
    )
    _write_note(
        podcasts_dir / "Episode.md",
        [
            "date: 2026-01-10",
            "host: Host",
            "link: https://example.test/episode",
            "visible: true",
        ],
    )
    cache = _StubMediaCacheStore()

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.items == (
        MediaItem(kind="BOOK", title="Earlier", date=datetime.date(2026, 1, 5)),
        MediaItem(kind="BOOK", title="Later", date=datetime.date(2026, 1, 20)),
        MediaItem(kind="PODCAST", title="Episode", date=datetime.date(2026, 1, 10)),
    )
    assert cache.state == {
        "books": {
            "Earlier": "2026-01-05",
            "Later": "2026-01-20",
            "Outside": "2025-12-31",
        },
        "podcasts": {"Episode": "2026-01-10"},
    }
    assert len(cache.saved) == 1


def _series_dir(tmp_path: Path, name: str, *, visible: bool | None = None) -> Path:
    directory = tmp_path / "podcasts" / name
    directory.mkdir(parents=True)
    if visible is not None:
        _write_note(directory / f"{name}.md", [f"visible: {str(visible).lower()}"])
    return directory


def _scan_series(tmp_path: Path, cache: _StubMediaCacheStore | None = None):
    books_dir = tmp_path / "books"
    books_dir.mkdir(exist_ok=True)
    return ObsidianMediaSource(
        str(books_dir),
        str(tmp_path / "podcasts"),
        media_cache_store=cache or _StubMediaCacheStore(),
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))


def test_scan_collapses_a_series_folder_into_one_entry_dated_by_latest_episode(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-01-01", "host: Host"])
    _write_note(directory / "Part Two.md", ["date: 2026-01-31", "host: Host"])

    bundle = _scan_series(tmp_path)

    assert bundle.items == (
        MediaItem(kind="PODCAST", title="Genesis", date=datetime.date(2026, 1, 31)),
    )


def test_scan_dates_a_series_by_its_latest_episode_inside_the_window(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2025-12-31", "host: Host"])
    _write_note(directory / "Part Two.md", ["date: 2026-01-10", "host: Host"])
    _write_note(directory / "Part Three.md", ["date: 2026-02-01", "host: Host"])

    bundle = _scan_series(tmp_path)

    assert bundle.items[0].date == datetime.date(2026, 1, 10)


def test_scan_omits_a_visible_series_without_episodes_in_the_window(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-02-10", "host: Host"])

    bundle = _scan_series(tmp_path)

    assert bundle.items == ()


def test_scan_dates_a_visible_series_by_every_episode_it_holds(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    _write_note(
        directory / "Part Two.md",
        ["date: 2026-01-24", "host: Host", "visible: false"],
    )

    bundle = _scan_series(tmp_path)

    assert bundle.items[0].date == datetime.date(2026, 1, 24)


def test_scan_hides_a_series_whose_index_note_does_not_opt_in(
    tmp_path: Path,
) -> None:
    hidden = _series_dir(tmp_path, "Hidden", visible=False)
    _write_note(hidden / "Part One.md", ["date: 2026-01-10", "host: Host"])
    unindexed = _series_dir(tmp_path, "Unindexed")
    _write_note(unindexed / "Part One.md", ["date: 2026-01-11", "host: Host"])

    bundle = _scan_series(tmp_path)

    assert bundle.items == ()


def test_scan_keeps_a_hidden_series_hidden_whatever_its_episodes_say(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Hidden", visible=False)
    _write_note(
        directory / "Part One.md",
        ["date: 2026-01-10", "host: Host", "visible: true"],
    )

    bundle = _scan_series(tmp_path)

    assert bundle.items == ()


def test_scan_namespaces_series_episodes_in_the_date_cache(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    podcasts_dir = tmp_path / "podcasts"
    _write_note(
        podcasts_dir / "Part One.md",
        ["date: 2026-01-11", "host: Host", "visible: true"],
    )
    cache = _StubMediaCacheStore()

    bundle = _scan_series(tmp_path, cache)

    assert [item.title for item in bundle.items] == ["Genesis", "Part One"]
    assert cache.state["podcasts"] == {
        "Part One": "2026-01-11",
        "Genesis/Part One": "2026-01-10",
    }


def test_scan_regenerates_the_series_index_note(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part Two.md", ["date: 2026-01-24", "host: Host"])
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    index_path = directory / "Genesis.md"

    _scan_series(tmp_path)

    assert index_path.read_text(encoding="utf-8").splitlines() == [
        "---",
        "visible: true",
        "---",
        "",
        "| EPISODE | DATE |",
        "| ------- | ---- |",
        "| [[Part One]] | `2026-01-10` |",
        "| [[Part Two]] | `2026-01-24` |",
    ]


def test_scan_keeps_escaped_pipe_episode_rows_byte_stable(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part | One.md", ["date: 2026-01-10", "host: Host"])
    index_path = directory / "Genesis.md"

    _scan_series(tmp_path)
    first_render = index_path.read_bytes()

    _scan_series(tmp_path)

    assert b"| [[Part \\| One]] | `2026-01-10` |" in first_render
    assert index_path.read_bytes() == first_render


def test_scan_keeps_lenient_escaped_pipe_rows_byte_stable(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(directory / "Part | One.md", ["date: 2026-01-10", "host: Host"])
    index_path = directory / "Genesis.md"
    existing = "\n".join(
        [
            "---",
            "visible: true",
            "---",
            "",
            "| EPISODE       | DATE",
            "| ------------- | ----------",
            "| [[Part \\| One]] | `2026-01-10`",
        ]
    ).encode()
    index_path.write_bytes(existing)

    _scan_series(tmp_path)
    first_scan = index_path.read_bytes()
    _scan_series(tmp_path)

    assert first_scan == existing
    assert index_path.read_bytes() == existing


def test_scan_creates_a_hidden_index_note_for_a_series_without_one(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])

    bundle = _scan_series(tmp_path)

    assert bundle.items == ()
    assert (directory / "Genesis.md").read_text(encoding="utf-8").splitlines() == [
        "---",
        "visible: false",
        "---",
        "",
        "| EPISODE | DATE |",
        "| ------- | ---- |",
        "| [[Part One]] | `2026-01-10` |",
    ]


def test_scan_preserves_hand_written_index_frontmatter(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    index_path = directory / "Genesis.md"
    _write_note(index_path, ["visible: true", "host: Host", "genre: history"])

    bundle = _scan_series(tmp_path)

    assert [item.title for item in bundle.items] == ["Genesis"]
    assert index_path.read_text(encoding="utf-8").splitlines() == [
        "---",
        "visible: true",
        "host: Host",
        "genre: history",
        "---",
        "",
        "| EPISODE | DATE |",
        "| ------- | ---- |",
        "| [[Part One]] | `2026-01-10` |",
    ]


def test_series_regeneration_preserves_frontmatter_edited_before_publication(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])

    def add_genre(lines: list[str] | None) -> list[str] | None:
        if lines is None:
            return None
        updated = list(lines)
        updated.insert(2, "genre: history")
        return updated

    books_dir = tmp_path / "books"
    books_dir.mkdir()
    source = ObsidianMediaSource(
        str(books_dir),
        str(tmp_path / "podcasts"),
        media_cache_store=_StubMediaCacheStore(),
        note_store=_ConcurrentEditStore(tmp_path, add_genre),
    )

    source.scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    index = (directory / "Genesis.md").read_text(encoding="utf-8")
    assert "genre: history" in index
    assert "| [[Part One]] | `2026-01-10` |" in index


def test_visible_series_publication_failure_aborts_scan(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=True)
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    source = ObsidianMediaSource(
        str(books_dir),
        str(tmp_path / "podcasts"),
        media_cache_store=_StubMediaCacheStore(),
        note_store=_FailingNoteStore(lock_root=str(tmp_path / "note-locks")),
    )

    with pytest.raises(PermissionError, match="publication denied"):
        source.scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert "visible: true" in (directory / "Genesis.md").read_text(encoding="utf-8")


def test_scan_leaves_a_reformatted_series_index_alone(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    index_path = directory / "Genesis.md"
    padded = [
        "---",
        "visible: true",
        "---",
        "",
        "| EPISODE        | DATE         |",
        "| -------------- | ------------ |",
        "| [[Part One]]   | `2026-01-10` |",
    ]
    index_path.write_text("\n".join(padded) + "\n", encoding="utf-8")

    _scan_series(tmp_path)

    assert index_path.read_text(encoding="utf-8").splitlines() == padded


def test_scan_rewrites_a_reformatted_index_when_episodes_change(tmp_path: Path) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    _write_note(directory / "Part Two.md", ["date: 2026-01-24", "host: Host"])
    index_path = directory / "Genesis.md"
    index_path.write_text(
        "\n".join(
            [
                "---",
                "visible: true",
                "---",
                "",
                "| EPISODE        | DATE         |",
                "| -------------- | ------------ |",
                "| [[Part One]]   | `2026-01-10` |",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    _scan_series(tmp_path)

    assert index_path.read_text(encoding="utf-8").splitlines() == [
        "---",
        "visible: true",
        "---",
        "",
        "| EPISODE | DATE |",
        "| ------- | ---- |",
        "| [[Part One]] | `2026-01-10` |",
        "| [[Part Two]] | `2026-01-24` |",
    ]


def test_scan_indexes_hidden_episodes_and_skips_the_index_note_itself(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis", visible=False)
    _write_note(
        directory / "Part One.md",
        ["date: 2026-01-10", "host: Host", "visible: false"],
    )
    _write_note(
        directory / "Part Two.md",
        ["date: 2026-01-24", "host: Host", "visible: true"],
    )

    _scan_series(tmp_path)
    index_lines = (directory / "Genesis.md").read_text(encoding="utf-8").splitlines()

    _scan_series(tmp_path)

    assert "| [[Part One]] | `2026-01-10` |" in index_lines
    assert "[[Genesis]]" not in "\n".join(index_lines)
    assert (directory / "Genesis.md").read_text(
        encoding="utf-8"
    ).splitlines() == index_lines
    assert not (directory / "Genesis.md.tmp").exists()


def test_scan_keeps_a_dated_index_note_out_of_its_own_episode_list(
    tmp_path: Path,
) -> None:
    directory = _series_dir(tmp_path, "Genesis")
    _write_note(
        directory / "Genesis.md",
        ["visible: true", "date: 2026-01-30", "host: Host"],
    )
    _write_note(directory / "Part One.md", ["date: 2026-01-10", "host: Host"])
    cache = _StubMediaCacheStore()

    bundle = _scan_series(tmp_path, cache)

    assert bundle.items[0].date == datetime.date(2026, 1, 10)
    assert "[[Genesis]]" not in (directory / "Genesis.md").read_text(encoding="utf-8")
    assert cache.state["podcasts"] == {"Genesis/Part One": "2026-01-10"}


def test_scan_omits_podcasts_that_are_not_visible_but_still_caches_them(
    tmp_path: Path,
) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    _write_note(
        podcasts_dir / "Hidden.md",
        ["date: 2026-01-10", "host: Host", "visible: false"],
    )
    _write_note(
        podcasts_dir / "Unmarked.md",
        ["date: 2026-01-11", "host: Host"],
    )
    _write_note(
        podcasts_dir / "Shown.md",
        ["date: 2026-01-12", "host: Host", "visible: true"],
    )
    cache = _StubMediaCacheStore()

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert [item.title for item in bundle.items] == ["Shown"]
    assert cache.state["podcasts"] == {
        "Hidden": "2026-01-10",
        "Unmarked": "2026-01-11",
        "Shown": "2026-01-12",
    }


def test_scan_heals_dates_of_podcasts_that_are_not_visible(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    podcast_path = podcasts_dir / "Hidden.md"
    _write_note(podcast_path, ["date: 2026-02-01", "host: Host", "visible: false"])
    cache = _StubMediaCacheStore(
        {
            "books": {},
            "podcasts": {"Hidden": "2026-01-15"},
        }
    )

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.items == ()
    assert "date: 2026-01-15" in podcast_path.read_text(encoding="utf-8")
    assert cache.saved == []


def test_scan_heals_corrupted_date_from_cache(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    book_path = books_dir / "Book.md"
    _write_note(
        book_path,
        ["completed: 2026-02-01", "author: Author"],
    )
    cache = _StubMediaCacheStore(
        {
            "books": {"Book": "2026-01-15"},
            "podcasts": {},
        }
    )

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.items[0].date == datetime.date(2026, 1, 15)
    assert "completed: 2026-01-15" in book_path.read_text(encoding="utf-8")
    assert not book_path.with_suffix(".md.tmp").exists()
    assert cache.saved == []


def test_date_healing_preserves_frontmatter_edited_before_publication(
    tmp_path: Path,
) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    book_path = books_dir / "Book.md"
    _write_note(book_path, ["completed: 2026-02-01", "author: Original"])
    cache = _StubMediaCacheStore({"books": {"Book": "2026-01-15"}, "podcasts": {}})

    def change_author(lines: list[str] | None) -> list[str] | None:
        if lines is None:
            return None
        return [
            "author: Concurrent" if line == "author: Original" else line
            for line in lines
        ]

    source = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
        note_store=_ConcurrentEditStore(tmp_path, change_author),
    )

    source.scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    healed = book_path.read_text(encoding="utf-8")
    assert "completed: 2026-01-15" in healed
    assert "author: Concurrent" in healed


def test_scan_ignores_missing_directories_and_malformed_notes(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    _write_note(books_dir / "Invalid.md", ["author: Nobody"])
    cache = _StubMediaCacheStore()

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(tmp_path / "missing-podcasts"),
        media_cache_store=cache,
        note_store=_note_store(tmp_path),
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.items == ()
    assert cache.saved == []
