from __future__ import annotations

import io
import json
import logging
import sys

import pytest

import sync.log as log_module
from sync.log import configure_logging, get_logger


def test_get_logger_namespaces_sync():
    assert get_logger("sync.study.repository").name == "journal.sync.study.repository"
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


def test_configure_logging_rebuilds_closed_stream_handler(monkeypatch):
    journal_logger = logging.getLogger("journal")
    for handler in list(journal_logger.handlers):
        journal_logger.removeHandler(handler)
        handler.close()
    monkeypatch.setattr(log_module, "_ACTIVE_CONFIG", None)

    first_stderr = io.StringIO()
    monkeypatch.setattr(sys, "stderr", first_stderr)

    configure_logging(level="INFO", log_format="text")
    first_handler = journal_logger.handlers[0]
    assert isinstance(first_handler, logging.StreamHandler)
    assert first_handler.stream is first_stderr
    first_stderr.close()

    second_stderr = io.StringIO()
    monkeypatch.setattr(sys, "stderr", second_stderr)

    configure_logging(level="INFO", log_format="text")
    second_handler = logging.getLogger("journal").handlers[0]
    assert second_handler is not first_handler
    assert second_handler.stream is second_stderr

    logger = get_logger("sync.tests")
    logger.warning("recovered stream")
    assert "recovered stream" in second_stderr.getvalue()


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
