"""Tests for media reader scan helpers."""

from __future__ import annotations

import datetime
from pathlib import Path


import sync.readers.media as media_module
from sync.readers.media import (
    _frontmatter_text,
    _heal_frontmatter_date,
    _parse_date_link,
    _parse_rating,
    scan_books,
    scan_podcasts,
)


class TestParseDateLink:
    def test_wikilink_format(self):
        result = _parse_date_link("[[2025-12-30]]")
        assert result == datetime.date(2025, 12, 30)

    def test_plain_date_format(self):
        result = _parse_date_link("2025-01-15")
        assert result == datetime.date(2025, 1, 15)

    def test_empty_string(self):
        assert _parse_date_link("") is None

    def test_none_input(self):
        assert _parse_date_link(None) is None

    def test_invalid_date(self):
        assert _parse_date_link("[[2025-13-45]]") is None

    def test_wikilink_with_extra_text(self):
        result = _parse_date_link("Started on [[2025-12-30]]")
        assert result == datetime.date(2025, 12, 30)


class TestParseRating:
    def test_valid_rating(self):
        assert _parse_rating("8.5") == 8.5
        assert _parse_rating(" 9 ") == 9.0

    def test_invalid_rating(self):
        assert _parse_rating("") is None
        assert _parse_rating("abc") is None


class TestFrontmatterText:
    def test_returns_string_value(self):
        assert _frontmatter_text({"key": "value"}, "key") == "value"

    def test_missing_or_non_string_values_return_empty(self):
        assert _frontmatter_text({}, "missing") == ""
        assert _frontmatter_text({"key": None}, "key") == ""
        assert _frontmatter_text({"key": 123}, "key") == ""


class TestHealFrontmatterDate:
    def test_rewrites_date_in_frontmatter(self, tmp_path):
        path = tmp_path / "Podcast.md"
        path.write_text(
            "\n".join(
                [
                    "---",
                    "date: 2025-01-01",
                    "host: Test Host",
                    "---",
                    "body",
                ]
            ),
            encoding="utf-8",
        )
        lines = path.read_text(encoding="utf-8").splitlines()

        _heal_frontmatter_date(str(path), lines, datetime.date(2025, 1, 15))

        assert path.read_text(encoding="utf-8").splitlines() == [
            "---",
            "date: 2025-01-15",
            "host: Test Host",
            "---",
            "body",
        ]

    def test_rewrites_custom_key(self, tmp_path):
        path = tmp_path / "Book.md"
        path.write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-01]]"',
                    "author: Test",
                    "---",
                    "body",
                ]
            ),
            encoding="utf-8",
        )
        lines = path.read_text(encoding="utf-8").splitlines()

        _heal_frontmatter_date(
            str(path),
            lines,
            datetime.date(2025, 1, 31),
            "completed",
        )

        assert path.read_text(encoding="utf-8").splitlines() == [
            "---",
            "completed: 2025-01-31",
            "author: Test",
            "---",
            "body",
        ]

    def test_no_matching_key_does_not_rewrite(self, tmp_path):
        path = tmp_path / "NoDate.md"
        original_lines = [
            "---",
            "host: Test",
            "---",
            "body",
        ]
        path.write_text("\n".join(original_lines), encoding="utf-8")

        _heal_frontmatter_date(
            str(path),
            original_lines,
            datetime.date(2025, 1, 31),
        )

        assert path.read_text(encoding="utf-8").splitlines() == original_lines

    def test_no_matching_key_does_not_attempt_write(self, monkeypatch, tmp_path):
        path = tmp_path / "NoDate.md"
        original_lines = [
            "---",
            "host: Test",
            "---",
            "date: 2025-01-01",
        ]
        path.write_text("\n".join(original_lines), encoding="utf-8")
        writes: list[str] = []
        real_open = open

        def _track_open(file: str, mode: str = "r", *args, **kwargs):  # type: ignore[no-untyped-def]
            if file == str(path) and "w" in mode:
                writes.append(mode)
            return real_open(file, mode, *args, **kwargs)

        monkeypatch.setattr("builtins.open", _track_open)

        _heal_frontmatter_date(str(path), original_lines, datetime.date(2025, 1, 31))

        assert writes == []
        assert path.read_text(encoding="utf-8").splitlines() == original_lines

    def test_missing_frontmatter_delimiters_does_not_attempt_write(
        self, monkeypatch, tmp_path
    ):
        path = tmp_path / "NoFrontmatter.md"
        original_lines = [
            "date: 2025-01-01",
            "body",
        ]
        path.write_text("\n".join(original_lines), encoding="utf-8")
        writes: list[str] = []
        real_open = open

        def _track_open(file: str, mode: str = "r", *args, **kwargs):  # type: ignore[no-untyped-def]
            if file == str(path) and "w" in mode:
                writes.append(mode)
            return real_open(file, mode, *args, **kwargs)

        monkeypatch.setattr("builtins.open", _track_open)

        _heal_frontmatter_date(
            str(path),
            original_lines,
            datetime.date(2025, 1, 31),
        )

        assert writes == []
        assert path.read_text(encoding="utf-8").splitlines() == original_lines

    def test_does_not_mutate_body_date_like_lines(self, tmp_path):
        path = tmp_path / "Podcast.md"
        path.write_text(
            "\n".join(
                [
                    "---",
                    "date: 2025-01-01",
                    "---",
                    "notes",
                    "date: do-not-touch",
                ]
            ),
            encoding="utf-8",
        )
        lines = path.read_text(encoding="utf-8").splitlines()
        _heal_frontmatter_date(str(path), lines, datetime.date(2025, 1, 2))

        assert path.read_text(encoding="utf-8").splitlines() == [
            "---",
            "date: 2025-01-02",
            "---",
            "notes",
            "date: do-not-touch",
        ]

    def test_logs_successful_heal(self, monkeypatch, tmp_path):
        path = tmp_path / "Podcast.md"
        path.write_text(
            "\n".join(
                [
                    "---",
                    "date: 2025-01-01",
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        lines = path.read_text(encoding="utf-8").splitlines()
        calls: list[tuple[object, ...]] = []

        def _info(*args: object) -> None:
            calls.append(args)

        monkeypatch.setattr(media_module.logger, "info", _info)
        _heal_frontmatter_date(str(path), lines, datetime.date(2025, 1, 2))

        assert calls == [
            (
                "Healed %s in %s -> %s",
                "date",
                "Podcast.md",
                "2025-01-02",
            )
        ]

    def test_write_failure_is_swallowed(self, monkeypatch, tmp_path):
        path = tmp_path / "Podcast.md"
        path.write_text(
            "\n".join(
                [
                    "---",
                    "date: 2025-01-01",
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        lines = path.read_text(encoding="utf-8").splitlines()
        write_path = str(path)
        real_open = open
        calls: list[tuple[object, ...]] = []

        def _boom_open(file: str, mode: str = "r", *args, **kwargs):  # type: ignore[no-untyped-def]
            if file == write_path and "w" in mode:
                raise OSError("nope")
            return real_open(file, mode, *args, **kwargs)

        def _warning(*args: object) -> None:
            calls.append(args)

        monkeypatch.setattr("builtins.open", _boom_open)
        monkeypatch.setattr(media_module.logger, "warning", _warning)

        _heal_frontmatter_date(write_path, lines, datetime.date(2025, 1, 2))
        assert Path(write_path).read_text(encoding="utf-8").splitlines() == [
            "---",
            "date: 2025-01-01",
            "---",
        ]
        assert len(calls) == 1
        assert calls[0][0] == "Failed to heal frontmatter in %s: %s"
        assert calls[0][1] == write_path
        assert isinstance(calls[0][2], OSError)
        assert str(calls[0][2]) == "nope"


class TestScanBooks:
    def test_finds_completed_books_in_range(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        book_file = book_dir / "Test Book.md"
        book_file.write_text(
            """---
author: Test Author
started: "[[2025-01-01]]"
completed: "[[2025-01-15]]"
rating: 8.5
---
# Notes
""",
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert len(books) == 1
        assert books[0].title == "Test Book"
        assert books[0].author == "Test Author"
        assert books[0].started == datetime.date(2025, 1, 1)
        assert books[0].completed == datetime.date(2025, 1, 15)
        assert books[0].rating == 8.5

    def test_excludes_books_outside_range(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        book_file = book_dir / "Old Book.md"
        book_file.write_text(
            """---
author: Old Author
started: "[[2024-01-01]]"
completed: "[[2024-01-15]]"
---
""",
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert len(books) == 0

    def test_excludes_incomplete_books(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        book_file = book_dir / "In Progress.md"
        book_file.write_text(
            """---
author: Some Author
started: "[[2025-01-01]]"
completed:
---
""",
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert len(books) == 0

    def test_empty_directory(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert books == []

    def test_nonexistent_directory(self, tmp_path):
        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(tmp_path / "nonexistent"),
        )
        assert books == []

    def test_uses_cached_completed_date_and_heals_file(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        book_file = book_dir / "Cached Book.md"
        book_file.write_text(
            "\n".join(
                [
                    "---",
                    "author: A",
                    'completed: "[[2025-01-20]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        books, cache, modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
            cached_dates={"Cached Book": "2025-01-10"},
        )

        assert len(books) == 1
        assert books[0].completed == datetime.date(2025, 1, 10)
        assert cache == {"Cached Book": "2025-01-10"}
        assert modified is False
        assert "completed: 2025-01-10" in book_file.read_text(encoding="utf-8")

    def test_new_books_update_cache_and_sort_by_completion(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "B Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-20]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        (book_dir / "A Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        books, cache, modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["A Book", "B Book"]
        assert cache == {"A Book": "2025-01-10", "B Book": "2025-01-20"}
        assert modified is True

    def test_non_markdown_files_do_not_stop_scan(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "000-note.txt").write_text("skip", encoding="utf-8")
        (book_dir / "Valid Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["Valid Book"]

    def test_non_markdown_files_do_not_break_scan_with_order_control(
        self, monkeypatch, tmp_path
    ):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "skip.txt").write_text("skip", encoding="utf-8")
        (book_dir / "Valid Book.md").write_text(
            "\n".join(["---", 'completed: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["skip.txt", "Valid Book.md"]
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["Valid Book"]

    def test_ignores_markdown_directories_and_keeps_scanning(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "000-folder.md").mkdir()
        (book_dir / "Valid Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["Valid Book"]

    def test_non_file_markdown_entries_do_not_break_scan_with_order_control(
        self, monkeypatch, tmp_path
    ):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "skip.md").mkdir()
        (book_dir / "Valid Book.md").write_text(
            "\n".join(["---", 'completed: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["skip.md", "Valid Book.md"]
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["Valid Book"]

    def test_unreadable_file_does_not_stop_scan(self, monkeypatch, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        bad_path = book_dir / "A Bad.md"
        good_path = book_dir / "B Good.md"
        bad_path.write_text("x", encoding="utf-8")
        good_path.write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        real_safe_read = media_module.safe_read_file

        def _safe_read(path: str) -> list[str] | None:
            if path == str(bad_path):
                return None
            return real_safe_read(path)

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Bad.md", "B Good.md"]
        )
        monkeypatch.setattr(media_module, "safe_read_file", _safe_read)

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["B Good"]

    def test_invalid_completed_date_does_not_stop_scan(self, monkeypatch, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "A Invalid.md").write_text(
            "\n".join(
                [
                    "---",
                    "completed: INVALID",
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        (book_dir / "B Valid.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-12]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Invalid.md", "B Valid.md"]
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["B Valid"]

    def test_out_of_range_book_does_not_stop_scan(self, monkeypatch, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "A Old.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2024-12-31]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        (book_dir / "B New.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Old.md", "B New.md"]
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["B New"]

    def test_includes_books_on_range_boundaries(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "Start Book.md").write_text(
            "\n".join(["---", 'completed: "[[2025-01-01]]"', "---"]),
            encoding="utf-8",
        )
        (book_dir / "End Book.md").write_text(
            "\n".join(["---", 'completed: "[[2025-01-31]]"', "---"]),
            encoding="utf-8",
        )

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert [book.title for book in books] == ["Start Book", "End Book"]

    def test_missing_author_defaults_to_empty_string(self, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "No Author.md").write_text(
            "\n".join(["---", 'completed: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )
        assert len(books) == 1
        assert books[0].author == ""

    def test_invalid_cached_date_does_not_trigger_heal(self, monkeypatch, tmp_path):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        healed: list[tuple[str, datetime.date, str]] = []

        def _heal(
            path: str, _lines: list[str], date: datetime.date, key: str = "date"
        ) -> None:
            healed.append((path, date, key))

        monkeypatch.setattr(media_module, "_heal_frontmatter_date", _heal)

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
            cached_dates={"Book": "not-a-date"},
        )
        assert len(books) == 1
        assert healed == []

    def test_cached_mismatch_logs_warning_with_exact_payload(
        self, monkeypatch, tmp_path
    ):
        book_dir = tmp_path / "books"
        book_dir.mkdir()
        (book_dir / "Book.md").write_text(
            "\n".join(
                [
                    "---",
                    'completed: "[[2025-01-12]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        warnings: list[tuple[object, ...]] = []

        def _warning(*args: object) -> None:
            warnings.append(args)

        monkeypatch.setattr(media_module.logger, "warning", _warning)

        books, _cache, _modified = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
            cached_dates={"Book": "2025-01-10"},
        )
        assert len(books) == 1
        assert warnings == [
            (
                "Book '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                "Book",
                datetime.date(2025, 1, 12),
                datetime.date(2025, 1, 10),
            )
        ]


class TestScanPodcasts:
    def test_finds_podcasts_in_range(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        podcast_file = podcast_dir / "Great Episode.md"
        podcast_file.write_text(
            """---
host: Lex Fridman
date: "[[2025-01-10]]"
rating: 9.0
link: https://example.com
---
# Notes
""",
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert len(podcasts) == 1
        assert podcasts[0].title == "Great Episode"
        assert podcasts[0].host == "Lex Fridman"
        assert podcasts[0].date == datetime.date(2025, 1, 10)
        assert podcasts[0].rating == 9.0
        assert podcasts[0].link == "https://example.com"

    def test_excludes_podcasts_outside_range(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        podcast_file = podcast_dir / "Old Episode.md"
        podcast_file.write_text(
            """---
host: Someone
date: "[[2024-06-15]]"
---
""",
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert len(podcasts) == 0

    def test_uses_cached_date_and_heals_file(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        podcast_file = podcast_dir / "Cached Episode.md"
        podcast_file.write_text(
            "\n".join(
                [
                    "---",
                    'date: "[[2025-01-25]]"',
                    "host: H",
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        podcasts, cache, modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
            cached_dates={"Cached Episode": "2025-01-05"},
        )

        assert len(podcasts) == 1
        assert podcasts[0].date == datetime.date(2025, 1, 5)
        assert cache == {"Cached Episode": "2025-01-05"}
        assert modified is False
        assert "date: 2025-01-05" in podcast_file.read_text(encoding="utf-8")

    def test_new_podcasts_update_cache_and_parse_optional_link(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "Episode A.md").write_text(
            "\n".join(
                [
                    "---",
                    'date: "[[2025-01-02]]"',
                    "link:",
                    "---",
                ]
            ),
            encoding="utf-8",
        )
        (podcast_dir / "Episode B.md").write_text(
            "\n".join(
                [
                    "---",
                    'date: "[[2025-01-20]]"',
                    "link: https://example.com",
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        podcasts, cache, modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["Episode A", "Episode B"]
        assert podcasts[0].link is None
        assert podcasts[1].link == "https://example.com"
        assert cache == {"Episode A": "2025-01-02", "Episode B": "2025-01-20"}
        assert modified is True

    def test_non_markdown_files_do_not_stop_scan(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "000-note.txt").write_text("skip", encoding="utf-8")
        (podcast_dir / "Valid Episode.md").write_text(
            "\n".join(
                [
                    "---",
                    'date: "[[2025-01-10]]"',
                    "---",
                ]
            ),
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["Valid Episode"]

    def test_non_markdown_files_do_not_break_scan_with_order_control(
        self, monkeypatch, tmp_path
    ):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "skip.txt").write_text("skip", encoding="utf-8")
        (podcast_dir / "Valid Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["skip.txt", "Valid Episode.md"]
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["Valid Episode"]

    def test_ignores_markdown_directories_and_keeps_scanning(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "000-folder.md").mkdir()
        (podcast_dir / "Valid Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["Valid Episode"]

    def test_non_file_markdown_entries_do_not_break_scan_with_order_control(
        self, monkeypatch, tmp_path
    ):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "skip.md").mkdir()
        (podcast_dir / "Valid Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["skip.md", "Valid Episode.md"]
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["Valid Episode"]

    def test_unreadable_file_does_not_stop_scan(self, monkeypatch, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        bad_path = podcast_dir / "A Bad.md"
        good_path = podcast_dir / "B Good.md"
        bad_path.write_text("x", encoding="utf-8")
        good_path.write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )

        real_safe_read = media_module.safe_read_file

        def _safe_read(path: str) -> list[str] | None:
            if path == str(bad_path):
                return None
            return real_safe_read(path)

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Bad.md", "B Good.md"]
        )
        monkeypatch.setattr(media_module, "safe_read_file", _safe_read)

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["B Good"]

    def test_invalid_date_does_not_stop_scan(self, monkeypatch, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "A Invalid.md").write_text(
            "\n".join(["---", "date: INVALID", "---"]),
            encoding="utf-8",
        )
        (podcast_dir / "B Valid.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-12]]"', "---"]),
            encoding="utf-8",
        )

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Invalid.md", "B Valid.md"]
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["B Valid"]

    def test_out_of_range_podcast_does_not_stop_scan(self, monkeypatch, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "A Old.md").write_text(
            "\n".join(["---", 'date: "[[2024-12-31]]"', "---"]),
            encoding="utf-8",
        )
        (podcast_dir / "B New.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )

        monkeypatch.setattr(
            media_module.os, "listdir", lambda _: ["A Old.md", "B New.md"]
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == ["B New"]

    def test_includes_podcasts_on_range_boundaries(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "Start Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-01]]"', "---"]),
            encoding="utf-8",
        )
        (podcast_dir / "End Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-31]]"', "---"]),
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert [podcast.title for podcast in podcasts] == [
            "Start Episode",
            "End Episode",
        ]

    def test_missing_host_defaults_to_empty_string(self, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "No Host.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )
        assert len(podcasts) == 1
        assert podcasts[0].host == ""

    def test_invalid_cached_date_does_not_trigger_heal(self, monkeypatch, tmp_path):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-10]]"', "---"]),
            encoding="utf-8",
        )
        healed: list[tuple[str, datetime.date, str]] = []

        def _heal(
            path: str, _lines: list[str], date: datetime.date, key: str = "date"
        ) -> None:
            healed.append((path, date, key))

        monkeypatch.setattr(media_module, "_heal_frontmatter_date", _heal)

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
            cached_dates={"Episode": "not-a-date"},
        )
        assert len(podcasts) == 1
        assert healed == []

    def test_cached_mismatch_logs_warning_with_exact_payload(
        self, monkeypatch, tmp_path
    ):
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()
        (podcast_dir / "Episode.md").write_text(
            "\n".join(["---", 'date: "[[2025-01-12]]"', "---"]),
            encoding="utf-8",
        )
        warnings: list[tuple[object, ...]] = []

        def _warning(*args: object) -> None:
            warnings.append(args)

        monkeypatch.setattr(media_module.logger, "warning", _warning)

        podcasts, _cache, _modified = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
            cached_dates={"Episode": "2025-01-10"},
        )
        assert len(podcasts) == 1
        assert warnings == [
            (
                "Podcast '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                "Episode",
                datetime.date(2025, 1, 12),
                datetime.date(2025, 1, 10),
            )
        ]
