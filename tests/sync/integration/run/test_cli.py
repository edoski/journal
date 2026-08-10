from __future__ import annotations

import argparse
import sqlite3
from dataclasses import replace
from datetime import date, datetime, time, timedelta
from pathlib import Path
import pytest

import sync.run.__main__ as cli
from sync.config import PATHS
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.contracts.schedule import DayScheduleProfile
from sync.run import wiring
from sync.run.commands import grades as grades_cmd
from sync.run.commands import media_books as media_books_cmd
from sync.run.commands import media_common as media_common_cmd
from sync.run.commands import media_podcast as media_podcast_cmd
from sync.study import flow_automation
from sync.study.repository import FlowSessionRepository

FLOW_GET_PHASE = 'tell application "Flow" to getPhase'
FLOW_GET_TIME = 'tell application "Flow" to getTime'
FLOW_SKIP = 'tell application "Flow" to skip'
FLOW_START = 'tell application "Flow" to start'
FLOW_SHOW = 'tell application "Flow" to show'


def _media_add_args(
    *,
    url: str = "https://www.youtube.com/watch?v=abc123",
    date: str | None = None,
    title: str | None = None,
    host: str | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(url=url, date=date, title=title, host=host)


def _media_book_annotations_import_args(
    *,
    html_path: str,
    note: str,
    work: str | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(html_path=html_path, note=note, work=work)


def _grades_sync_args(degree: str = "bsc") -> argparse.Namespace:
    return argparse.Namespace(degree=degree)


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=time(8, 0),
        study_end=time(18, 0),
        lunch_start=time(13, 30),
        lunch_end=time(14, 30),
        workout_start=time(18, 0),
        is_off_day=False,
    )


def _make_session_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE ZSESSION (
            ZPHASE TEXT,
            ZCOMPLETEDAT REAL,
            ZSTARTEDAT REAL
        )
        """
    )
    conn.commit()
    return conn


def _insert_session_row(
    conn: sqlite3.Connection,
    *,
    phase: str,
    completed_at: float | None,
    started_at: float = 1.0,
) -> None:
    conn.execute(
        "INSERT INTO ZSESSION (ZPHASE, ZCOMPLETEDAT, ZSTARTEDAT) VALUES (?, ?, ?)",
        (phase, completed_at, started_at),
    )
    conn.commit()


def _make_open_flow_conn(*, started_at: float = 1.0) -> sqlite3.Connection:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=None, started_at=started_at)
    return conn


def _print_disabled_output(disabled: bool, *, label: str) -> str:
    value = "true" if disabled else "false"
    return f'{{\n  "{label}" => {value}\n}}'


def _flow_automation_deps(
    tmp_path: Path,
    *,
    run_launchctl=None,
    run_applescript=None,
    connection_factory=None,
    now=None,
) -> flow_automation.FlowAutomationDeps:
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return flow_automation.FlowAutomationDeps(
        paths=replace(PATHS, journal_cache_dir=str(cache_dir)),
        skip_launchd_label=flow_automation.SKIP_LAUNCHD_LABEL,
        skip_launchd_domain=flow_automation.SKIP_LAUNCHD_DOMAIN,
        skip_launchd_target=flow_automation.SKIP_LAUNCHD_TARGET,
        remind_launchd_label=flow_automation.REMIND_LAUNCHD_LABEL,
        remind_launchd_domain=flow_automation.REMIND_LAUNCHD_DOMAIN,
        remind_launchd_target=flow_automation.REMIND_LAUNCHD_TARGET,
        flow_reminder_state_filename=flow_automation.FLOW_REMINDER_STATE_FILENAME,
        flow_reminder_cooldown_seconds=flow_automation.FLOW_REMINDER_COOLDOWN_SECONDS,
        flow_reminder_stagnant_threshold=(
            flow_automation.FLOW_REMINDER_STAGNANT_THRESHOLD
        ),
        repository=FlowSessionRepository(
            connection_factory=connection_factory
            or (lambda _readonly: _make_session_conn())
        ),
        run_launchctl=run_launchctl or (lambda _args: (0, "", "")),
        run_applescript=run_applescript or (lambda _script: None),
        now=now or datetime.now,
    )


def _wiring_deps(
    *,
    session_source_factory,
    status_source_factory,
    schedule_source_factory,
) -> wiring.WiringDeps:
    return wiring.WiringDeps(
        bootstrap_cache_layout=lambda: None,
        session_source_factory=session_source_factory,
        status_source_factory=status_source_factory,
        note_store_factory=lambda: object(),
        training_cache_store_factory=lambda: object(),
        aggregate_source_factory=lambda: object(),
        media_source_factory=lambda: object(),
        schedule_source_factory=schedule_source_factory,
    )


class _StubMediaCacheStore:
    def __init__(self) -> None:
        self.saved: list[dict[str, dict[str, str]]] = []

    def load(self) -> dict[str, dict[str, str]]:
        return {"books": {"Book A": "2026-01-01"}, "podcasts": {}}

    def save(self, state: dict[str, dict[str, str]]) -> None:
        self.saved.append(state)


def _write_book_template(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "author:",
                'completed: <% tp.date.now("YYYY-MM-DD") %>',
                "rating:",
                "---",
                "",
                "## Highlights",
                "---",
                "",
                "## Reflections",
                "---",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _write_podcast_template(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "host:",
                'date: <% tp.date.now("YYYY-MM-DD") %>',
                "link:",
                "visible: false",
                "genre: psychology",
                "---",
                "",
                "# Notes",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _media_deps(
    tmp_path: Path,
    *,
    today: date | None = None,
    cache_store: _StubMediaCacheStore | None = None,
) -> tuple[media_common_cmd.MediaCommandDeps, Path]:
    vault_dir = tmp_path / "vault"
    templates_dir = vault_dir / "notes" / "templates"
    podcasts_dir = vault_dir / "notes" / "podcasts"
    templates_dir.mkdir(parents=True, exist_ok=True)
    podcasts_dir.mkdir(parents=True, exist_ok=True)
    _write_book_template(templates_dir / "book.md")
    _write_podcast_template(templates_dir / "podcast.md")
    deps = media_common_cmd.MediaCommandDeps(
        paths=replace(
            PATHS,
            vault_dir=str(vault_dir),
            podcasts_dir=str(podcasts_dir),
        ),
        media_cache_store_factory=lambda: cache_store or _StubMediaCacheStore(),
        note_store=MarkdownNoteStore(lock_root=str(tmp_path / "note-locks")),
        today=lambda: today or date.today(),
    )
    return deps, podcasts_dir


def _write_book_note(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "author: Carl Jung",
                "completed:",
                "rating:",
                "---",
                "",
                "## Highlights",
                "---",
                "",
                "| PAGE | QUOTE |",
                "| ---- | ----- |",
                "| **1** | Old quote |",
                "",
                "## Reflections",
                "---",
                "",
                "- Keep this reflection",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _write_kindle_export(path: Path) -> None:
    path.write_text(
        "".join(
            [
                "<html><body>",
                '<div class="bookTitle">Memories Dreams Reflections</div>',
                '<div class="authors">Carl Jung</div>',
                '<div class="noteHeading">Highlight - Page 293 · Location 3835</div>',
                '<div class="noteText">First quote with a | pipe</div>',
                '<div class="noteHeading">Bookmark - Page 294 · Location 3840</div>',
                '<div class="noteHeading">Highlight - Location 3901</div>',
                '<div class="noteText">Second quote</div>',
                "</body></html>",
            ]
        ),
        encoding="utf-8",
    )


def _write_anthology_kindle_export(path: Path) -> None:
    path.write_text(
        "".join(
            [
                "<html><body>",
                '<div class="bookTitle">Complete Works of Fyodor Dostoyevsky</div>',
                '<div class="authors">Fyodor Dostoyevsky</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE IDIOT > Location 38592"
                    "</div>"
                ),
                '<div class="noteText">The Idiot quote</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE BROTHERS KARAMAZOV > Location 73625"
                    "</div>"
                ),
                '<div class="noteText">Karamazov quote one</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE BROTHERS KARAMAZOV > Page 512 · Location 74206"
                    "</div>"
                ),
                '<div class="noteText">Karamazov quote two</div>',
                "</body></html>",
            ]
        ),
        encoding="utf-8",
    )


def _write_grades_note(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "## YEAR 1",
                "| EXAM | CFU | GRADE |",
                "| ---- | --- | ----- |",
                "| ALGORITHMS | 6 | 30L |",
                "| ENGLISH B1 | 3 | ID |",
                "",
                "## YEAR 2",
                "| EXAM | CFU | GRADE |",
                "| ---- | --- | ----- |",
                "| MICROECONOMIA | 6 | 24 |",
                "",
                "## OVERALL",
                "| AVERAGE GRADE | % | CFU | LODE | BONUS | THESIS | FINAL |",
                "| ------------- | - | --- | ---- | ----- | ------ | ----- |",
                "| 0 | 0 | 0 | 0 | 0 | 6 | 0 |",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def test_run_daily_sync_non_today_days_first_then_today(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    anchor_day = date.today()
    loaded_session_days: list[date] = []
    resolved_schedule_days: list[date] = []
    synced_days: list[tuple[date, list[dict[str, str]]]] = []

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict[str, str]]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return [{"source_day": day.isoformat()}]

    class _FakeStatusSource:
        def target_days(self, run_anchor: date) -> tuple[date, ...]:
            assert run_anchor == anchor_day
            return (
                run_anchor,
                run_anchor - timedelta(days=1),
                run_anchor - timedelta(days=2),
            )

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: date,
            sessions: list[dict[str, str]],
            day_schedule: DayScheduleProfile,
        ) -> bool:
            assert day_schedule == _default_schedule()
            synced_days.append((day, sessions))
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(wiring, "DailySyncService", _FakeDailySyncService)

    deps = _wiring_deps(
        session_source_factory=_FakeSessionSource,
        status_source_factory=lambda: _FakeStatusSource(),
        schedule_source_factory=_FakeScheduleSource,
    )
    wiring.run_daily_sync(deps=deps)

    expected_days = [
        anchor_day - timedelta(days=2),
        anchor_day - timedelta(days=1),
        anchor_day,
    ]
    assert loaded_session_days == expected_days
    assert resolved_schedule_days == expected_days
    assert [day for day, _sessions in synced_days] == expected_days


def test_run_daily_sync_today_only_when_no_backfill_targets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    anchor_day = date.today()
    loaded_session_days: list[date] = []
    resolved_schedule_days: list[date] = []
    synced_days: list[date] = []

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict[str, str]]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return []

    class _FakeStatusSource:
        def target_days(self, run_anchor: date) -> tuple[date, ...]:
            assert run_anchor == anchor_day
            return (run_anchor,)

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: date,
            sessions: list[dict[str, str]],
            day_schedule: DayScheduleProfile,
        ) -> bool:
            _ = sessions
            assert day_schedule == _default_schedule()
            synced_days.append(day)
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(wiring, "DailySyncService", _FakeDailySyncService)

    deps = _wiring_deps(
        session_source_factory=_FakeSessionSource,
        status_source_factory=lambda: _FakeStatusSource(),
        schedule_source_factory=_FakeScheduleSource,
    )
    wiring.run_daily_sync(deps=deps)

    assert loaded_session_days == [anchor_day]
    assert resolved_schedule_days == [anchor_day]
    assert synced_days == [anchor_day]


def test_monthly_sync_default_anchors_window_to_today(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FrozenDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 19)

    captured: list[tuple[date, date | None]] = []

    class _FakePeriodSyncService:
        def sync_month(
            self,
            window,
            note_path,
            *,
            cleanup_previous,
            cleanup_previous_runner,
        ) -> None:
            _ = note_path, cleanup_previous, cleanup_previous_runner
            captured.append((window.target_date, window.current_date))

    monkeypatch.setattr(wiring.datetime, "date", _FrozenDate)
    monkeypatch.setattr(
        wiring,
        "_build_period_sync_service",
        lambda *, deps=None: _FakePeriodSyncService(),
    )
    monkeypatch.setattr(wiring, "resolve_note_path", lambda filename: filename)

    deps = _wiring_deps(
        session_source_factory=lambda: object(),
        status_source_factory=lambda: object(),
        schedule_source_factory=lambda: object(),
    )
    wiring.run_monthly_sync(month_arg=None, no_cleanup=True, deps=deps)

    assert captured == [(date(2026, 6, 19), date(2026, 6, 19))]


def test_monthly_sync_historical_month_has_no_current_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FrozenDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 7, 8)

    captured: list[tuple[date, date | None]] = []

    class _FakePeriodSyncService:
        def sync_month(
            self,
            window,
            note_path,
            *,
            cleanup_previous,
            cleanup_previous_runner,
        ) -> None:
            _ = note_path, cleanup_previous, cleanup_previous_runner
            captured.append((window.target_date, window.current_date))

    monkeypatch.setattr(wiring.datetime, "date", _FrozenDate)
    monkeypatch.setattr(
        wiring,
        "_build_period_sync_service",
        lambda *, deps=None: _FakePeriodSyncService(),
    )
    monkeypatch.setattr(wiring, "resolve_note_path", lambda filename: filename)

    deps = _wiring_deps(
        session_source_factory=lambda: object(),
        status_source_factory=lambda: object(),
        schedule_source_factory=lambda: object(),
    )
    wiring.run_monthly_sync(month_arg="2026-06", no_cleanup=True, deps=deps)

    assert captured == [(date(2026, 6, 30), None)]


def test_weekly_sync_historical_week_uses_week_end_without_current_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FrozenDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 7, 8)

    captured: list[tuple[date, date | None]] = []

    class _FakePeriodSyncService:
        def sync_week(
            self,
            window,
            note_path,
            *,
            cleanup_previous,
            cleanup_previous_runner,
        ) -> None:
            _ = note_path, cleanup_previous, cleanup_previous_runner
            captured.append((window.target_date, window.current_date))

    monkeypatch.setattr(wiring.datetime, "date", _FrozenDate)
    monkeypatch.setattr(
        wiring,
        "_build_period_sync_service",
        lambda *, deps=None: _FakePeriodSyncService(),
    )
    monkeypatch.setattr(wiring, "resolve_note_path", lambda filename: filename)

    deps = _wiring_deps(
        session_source_factory=lambda: object(),
        status_source_factory=lambda: object(),
        schedule_source_factory=lambda: object(),
    )
    wiring.run_weekly_sync(date_arg="2026-06-29", no_cleanup=True, deps=deps)

    assert captured == [(date(2026, 7, 5), None)]


def test_period_all_runs_in_expected_order(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        wiring,
        "run_daily_sync",
        lambda *, deps=None: calls.append("daily"),
    )
    monkeypatch.setattr(
        wiring,
        "run_weekly_sync",
        lambda *, date_arg, no_cleanup, deps=None: calls.append(
            f"weekly:{date_arg}:{no_cleanup}"
        ),
    )
    monkeypatch.setattr(
        wiring,
        "run_monthly_sync",
        lambda *, month_arg, no_cleanup, deps=None: calls.append(
            f"monthly:{month_arg}:{no_cleanup}"
        ),
    )
    monkeypatch.setattr(
        wiring,
        "run_yearly_sync",
        lambda *, year_arg, deps=None: calls.append(f"yearly:{year_arg}"),
    )

    rc = cli.main(["period", "all"])

    assert rc == 0
    assert calls == [
        "daily",
        "weekly:None:False",
        "monthly:None:False",
        "yearly:None",
    ]


def test_period_all_is_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _boom_daily(*, deps=None) -> None:
        calls.append("daily")
        raise RuntimeError("boom")

    monkeypatch.setattr(wiring, "run_daily_sync", _boom_daily)
    monkeypatch.setattr(
        wiring,
        "run_weekly_sync",
        lambda *, date_arg, no_cleanup, deps=None: calls.append("weekly"),
    )

    rc = cli.main(["period", "all"])

    assert rc == 1
    assert calls == ["daily"]


def test_repository_finds_latest_open_flow() -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="shortBreak", completed_at=None, started_at=1.0)
    _insert_session_row(conn, phase="flow", completed_at=None, started_at=2.0)
    repository = FlowSessionRepository(connection_factory=lambda _readonly: conn)
    assert repository.latest_open_flow_started_at() == 2.0


def test_repository_rejects_completed_latest_flow() -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=1234.0)
    repository = FlowSessionRepository(connection_factory=lambda _readonly: conn)
    assert repository.latest_open_flow_started_at() is None


def test_session_skip_noops_when_disabled(tmp_path: Path) -> None:
    deps = _flow_automation_deps(
        tmp_path,
        run_launchctl=lambda args: (
            0,
            _print_disabled_output(
                disabled=True,
                label=flow_automation.SKIP_LAUNCHD_LABEL,
            ),
            "",
        ),
        run_applescript=lambda _script: (_ for _ in ()).throw(
            AssertionError("AppleScript should not run when skip is disabled")
        ),
        connection_factory=lambda _readonly: (_ for _ in ()).throw(
            AssertionError("DB should not be opened when skip is disabled")
        ),
    )
    assert flow_automation.run_session_skip(deps=deps) == 0


def test_session_skip_executes_when_phase_flow_and_latest_row_open_flow(
    tmp_path: Path,
) -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=None)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    deps = _flow_automation_deps(
        tmp_path,
        run_launchctl=lambda args: (
            0,
            _print_disabled_output(
                disabled=False,
                label=flow_automation.SKIP_LAUNCHD_LABEL,
            ),
            "",
        ),
        run_applescript=_fake_run,
        connection_factory=lambda _readonly: conn,
    )

    assert flow_automation.run_session_skip(deps=deps) == 0
    assert calls == [FLOW_GET_PHASE, FLOW_SKIP, FLOW_START, FLOW_SHOW]


def test_session_skip_state_toggle_calls_launchctl_disable(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    calls: list[list[str]] = []
    responses = [
        (
            0,
            _print_disabled_output(
                disabled=False,
                label=flow_automation.SKIP_LAUNCHD_LABEL,
            ),
            "",
        ),
        (0, "", ""),
        (
            0,
            _print_disabled_output(
                disabled=True,
                label=flow_automation.SKIP_LAUNCHD_LABEL,
            ),
            "",
        ),
    ]

    def _fake_launchctl(args: list[str]) -> tuple[int, str, str]:
        calls.append(args)
        return responses[len(calls) - 1]

    deps = _flow_automation_deps(tmp_path, run_launchctl=_fake_launchctl)
    rc = flow_automation.run_session_skip("toggle", deps=deps)

    assert rc == 0
    assert calls == [
        ["print-disabled", flow_automation.SKIP_LAUNCHD_DOMAIN],
        ["disable", flow_automation.SKIP_LAUNCHD_TARGET],
        ["print-disabled", flow_automation.SKIP_LAUNCHD_DOMAIN],
    ]
    assert "Skip automation: DISABLED" in capsys.readouterr().out


def test_session_remind_noops_when_phase_is_not_flow_and_clears_state(
    tmp_path: Path,
) -> None:
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Break"
        return "ok"

    deps = _flow_automation_deps(
        tmp_path,
        run_launchctl=lambda args: (
            0,
            _print_disabled_output(
                disabled=False,
                label=flow_automation.REMIND_LAUNCHD_LABEL,
            ),
            "",
        ),
        run_applescript=_fake_run,
        connection_factory=lambda _readonly: (_ for _ in ()).throw(
            AssertionError("DB should not be opened when phase is not Flow")
        ),
    )

    flow_automation._save_flow_reminder_state(
        {
            "open_session_started_at": 1.0,
            "remaining_time": "25:00",
            "stagnant_checks": 2,
            "last_reminded_epoch": 1000.0,
        },
        deps,
    )
    state_path = Path(flow_automation._flow_reminder_state_path(deps))
    assert state_path.exists()

    assert flow_automation.run_session_remind(deps=deps) == 0
    assert calls == [FLOW_GET_PHASE]
    assert not state_path.exists()


def test_session_remind_reveals_on_first_stagnant_check(tmp_path: Path) -> None:
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        if script == FLOW_SHOW:
            return "Flow"
        return "ok"

    deps = _flow_automation_deps(
        tmp_path,
        run_launchctl=lambda args: (
            0,
            _print_disabled_output(
                disabled=False,
                label=flow_automation.REMIND_LAUNCHD_LABEL,
            ),
            "",
        ),
        run_applescript=_fake_run,
        connection_factory=lambda _readonly: _make_open_flow_conn(started_at=10.0),
        now=lambda: datetime(2026, 2, 27, 12, 0, 0),
    )

    first_rc = flow_automation.run_session_remind(deps=deps)
    second_rc = flow_automation.run_session_remind(deps=deps)

    assert first_rc == 0
    assert second_rc == 0
    assert calls == [
        FLOW_GET_PHASE,
        FLOW_GET_TIME,
        FLOW_GET_PHASE,
        FLOW_GET_TIME,
        FLOW_SHOW,
    ]
    assert flow_automation._load_flow_reminder_state(deps) == {
        "open_session_started_at": 10.0,
        "remaining_time": "25:00",
        "stagnant_checks": 1,
        "last_reminded_epoch": datetime(2026, 2, 27, 12, 0, 0).timestamp(),
    }


def test_session_remind_respects_cooldown(tmp_path: Path) -> None:
    def _fake_run(script: str) -> str:
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        raise AssertionError("Flow show should not run while cooldown is active")

    deps = _flow_automation_deps(
        tmp_path,
        run_launchctl=lambda args: (
            0,
            _print_disabled_output(
                disabled=False,
                label=flow_automation.REMIND_LAUNCHD_LABEL,
            ),
            "",
        ),
        run_applescript=_fake_run,
        connection_factory=lambda _readonly: _make_open_flow_conn(started_at=10.0),
        now=lambda: datetime.fromtimestamp(1060.0),
    )
    flow_automation._save_flow_reminder_state(
        {
            "open_session_started_at": 10.0,
            "remaining_time": "25:00",
            "stagnant_checks": 1,
            "last_reminded_epoch": 1000.0,
        },
        deps,
    )

    assert flow_automation.run_session_remind(deps=deps) == 0
    state = flow_automation._load_flow_reminder_state(deps)
    assert state["stagnant_checks"] == 2
    assert state["last_reminded_epoch"] == 1000.0


def test_media_podcast_add_creates_note_with_sanitized_filename(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    cache_store = _StubMediaCacheStore()
    deps, podcasts_dir = _media_deps(
        tmp_path,
        today=date(2026, 2, 20),
        cache_store=cache_store,
    )
    monkeypatch.setattr(
        media_podcast_cmd,
        "_fetch_youtube_oembed_metadata",
        lambda _url: ("2017 Personality 01: Introduction", "Jordan B Peterson"),
    )

    rc = media_podcast_cmd.cmd_media_podcast_add(
        _media_add_args(url="https://www.youtube.com/watch?v=kYYJlNbV1OM"),
        deps=deps,
    )

    assert rc == 0
    note_path = podcasts_dir / "2017 Personality 01 - Introduction.md"
    assert note_path.exists()
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "host: Jordan B Peterson" in lines
    assert "date: 2026-02-20" in lines
    assert "link: https://www.youtube.com/watch?v=kYYJlNbV1OM" in lines
    assert "visible: false" in lines
    assert "genre: psychology" in lines
    assert lines[-1] == "# Notes"
    assert cache_store.saved == [
        {
            "books": {"Book A": "2026-01-01"},
            "podcasts": {"2017 Personality 01 - Introduction": "2026-02-20"},
        }
    ]


def test_media_podcast_add_fails_when_note_already_exists(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    cache_store = _StubMediaCacheStore()
    deps, podcasts_dir = _media_deps(
        tmp_path, today=date(2026, 2, 20), cache_store=cache_store
    )
    existing_path = podcasts_dir / "Existing Episode.md"
    existing_content = "---\nhost: Existing\ndate: 2026-01-01\nlink: x\n---\n"
    existing_path.write_text(existing_content, encoding="utf-8")
    monkeypatch.setattr(
        media_podcast_cmd,
        "_fetch_youtube_oembed_metadata",
        lambda _url: ("Existing Episode", "Jordan B Peterson"),
    )

    rc = media_podcast_cmd.cmd_media_podcast_add(
        _media_add_args(url="https://www.youtube.com/watch?v=dup1"),
        deps=deps,
    )

    assert rc == 1
    assert existing_path.read_text(encoding="utf-8") == existing_content
    assert cache_store.saved == []


def test_media_book_annotations_import_replaces_highlights_and_keeps_reflections(
    tmp_path: Path,
) -> None:
    deps, _ = _media_deps(tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "book.md"
    _write_kindle_export(html_path)
    _write_book_note(note_path)

    rc = media_books_cmd.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        ),
        deps=deps,
    )

    assert rc == 0
    content = note_path.read_text(encoding="utf-8")
    assert "| PAGE | QUOTE |" in content
    assert "| LOC. | QUOTE |" in content
    assert "| **293** | First quote with a \\| pipe |" in content
    assert "| **3901** | Second quote |" in content
    assert "Old quote" not in content
    assert "- Keep this reflection" in content
    assert not html_path.exists()


def test_media_book_annotations_import_creates_missing_note_from_template(
    tmp_path: Path,
) -> None:
    deps, _ = _media_deps(tmp_path, today=date(2026, 3, 24))
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "The Brothers Karamazov.md"
    _write_anthology_kindle_export(html_path)

    rc = media_books_cmd.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        ),
        deps=deps,
    )

    assert rc == 0
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "author: Fyodor Dostoyevsky" in lines
    assert "completed: 2026-03-24" in lines
    assert "rating:" in lines
    assert "| **73625** | Karamazov quote one |" in lines
    assert "| **512** | Karamazov quote two |" in lines


@pytest.mark.parametrize("degree", ["bsc", "msc"])
def test_grades_sync_updates_only_selected_degree(
    tmp_path: Path,
    degree: str,
) -> None:
    bsc_path = tmp_path / "bsc" / "GRADES.md"
    msc_path = tmp_path / "msc" / "GRADES.md"
    bsc_path.parent.mkdir()
    msc_path.parent.mkdir()
    _write_grades_note(bsc_path)
    _write_grades_note(msc_path)

    rc = grades_cmd.cmd_grades_sync(
        _grades_sync_args(degree),
        config=grades_cmd.GradesCommandConfig(
            bsc_grades_path=str(bsc_path),
            msc_grades_path=str(msc_path),
        ),
    )

    assert rc == 0
    selected = bsc_path if degree == "bsc" else msc_path
    other = msc_path if degree == "bsc" else bsc_path
    computed_row = "| 27.00 | 0.90 | 15 | 1 | 0 | 6 | 105 |"
    assert computed_row in selected.read_text(encoding="utf-8")
    assert computed_row not in other.read_text(encoding="utf-8")


def test_grades_sync_returns_error_when_file_is_missing(tmp_path: Path) -> None:
    rc = grades_cmd.cmd_grades_sync(
        _grades_sync_args("msc"),
        config=grades_cmd.GradesCommandConfig(
            msc_grades_path=str(tmp_path / "missing.md")
        ),
    )
    assert rc == 1


def test_grades_sync_reports_source_path_for_invalid_content(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    path = tmp_path / "GRADES.md"
    path.write_text("## INVALID\n", encoding="utf-8")

    rc = grades_cmd.cmd_grades_sync(
        _grades_sync_args("msc"),
        config=grades_cmd.GradesCommandConfig(msc_grades_path=str(path)),
    )

    assert rc == 1
    output = capsys.readouterr().out
    assert str(path) in output
    assert "at least one '## YEAR n' section" in output


def test_cli_parser_has_expected_commands() -> None:
    parser = cli.build_parser()

    args = parser.parse_args(["session", "rename", "Retitle", "--confirm"])
    assert args.domain == "session"
    assert args.session_command == "rename"
    assert args.title == "Retitle"
    assert args.confirm is True

    args = parser.parse_args(["session", "skip", "--state", "status"])
    assert args.domain == "session"
    assert args.session_command == "skip"
    assert args.state == "status"

    args = parser.parse_args(["period", "weekly", "--date", "2026-02-17"])
    assert args.domain == "period"
    assert args.period_command == "weekly"
    assert args.date == "2026-02-17"

    args = parser.parse_args(
        [
            "media",
            "book",
            "annotations",
            "import",
            "/tmp/export.html",
            "--note",
            "/tmp/book.md",
        ]
    )
    assert args.domain == "media"
    assert args.media_command == "book"
    assert args.book_command == "annotations"
    assert args.book_annotations_command == "import"
    assert args.html_path == "/tmp/export.html"
    assert args.note == "/tmp/book.md"

    args = parser.parse_args(["grades", "sync", "bsc"])
    assert args.domain == "grades"
    assert args.grades_command == "sync"
    assert args.degree == "bsc"
