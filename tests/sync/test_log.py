from __future__ import annotations

import io
import json
import logging
import sys

import pytest

from sync.log import configure_logging, get_logger


def test_get_logger_namespaces_sync():
    assert get_logger("sync.study.db").name == "journal.sync.study.db"
    assert get_logger("sync.run.__main__").name == "journal.sync.run.__main__"


def test_get_logger_requires_non_empty_name():
    with pytest.raises(ValueError):
        get_logger("")


def test_configure_logging_is_idempotent():
    configure_logging(level="INFO", log_format="text")
    journal_logger = logging.getLogger("journal")
    first_handlers = list(journal_logger.handlers)

    configure_logging(level="INFO", log_format="text")
    second_handlers = list(journal_logger.handlers)

    assert len(first_handlers) == 1
    assert len(second_handlers) == 1
    assert first_handlers[0] is second_handlers[0]


def test_json_format_outputs_structured_payload(monkeypatch):
    stderr = io.StringIO()
    monkeypatch.setattr(sys, "stderr", stderr)

    configure_logging(level="INFO", log_format="json")
    logger = get_logger("sync.tests")
    logger.info("hello world")

    lines = [line for line in stderr.getvalue().splitlines() if line.strip()]
    assert lines
    payload = json.loads(lines[-1])
    assert payload["level"] == "INFO"
    assert payload["logger"] == "journal.sync.tests"
    assert payload["message"] == "hello world"
