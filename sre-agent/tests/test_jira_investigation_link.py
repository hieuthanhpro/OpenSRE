import os
import sys
from pathlib import Path

import httpx
import pytest

_SKILL_SCRIPTS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".claude",
    "skills",
    "project-jira",
    "scripts",
)
sys.path.insert(0, _SKILL_SCRIPTS)

from jira_client import (  # noqa: E402
    RUN_ID_FILENAME,
    investigation_link_footer,
    jira_request,
    read_thread_run_id,
    with_investigation_link,
)


def test_footer_builds_teams_parity_url():
    footer = investigation_link_footer("https://opensre.example.com", "abc123")
    assert footer == (
        "---\n[View in OpenSRE](https://opensre.example.com/team/agent-runs/abc123)"
    )


def test_footer_strips_trailing_slash_and_whitespace():
    footer = investigation_link_footer(" https://opensre.example.com/ ", " abc123 ")
    assert "https://opensre.example.com/team/agent-runs/abc123" in footer


def test_footer_omitted_when_base_or_run_id_missing():
    assert investigation_link_footer("", "abc") is None
    assert investigation_link_footer("https://x.com", "") is None
    assert investigation_link_footer("  ", "  ") is None


def test_with_investigation_link_appends_to_existing_description():
    out = with_investigation_link(
        "Findings here", "---\n[View in OpenSRE](https://x/r)"
    )
    assert out.startswith("Findings here")
    assert "[View in OpenSRE](https://x/r)" in out


def test_with_investigation_link_empty_description_is_footer_only():
    footer = "---\n[View in OpenSRE](https://x/r)"
    assert with_investigation_link("", footer) == footer
    assert with_investigation_link("  ", None) == "  "


def test_read_thread_run_id_from_cwd(tmp_path: Path):
    (tmp_path / RUN_ID_FILENAME).write_text(" run-xyz \n", encoding="utf-8")
    assert read_thread_run_id(tmp_path) == "run-xyz"


def test_read_thread_run_id_missing_file(tmp_path: Path, monkeypatch):
    start = tmp_path / "workspace"
    start.mkdir()
    boundary = start.resolve()
    original_parents = Path.parents.fget

    def limited_parents(self):
        if self.resolve() == boundary:
            return ()
        return original_parents(self)

    monkeypatch.setattr(Path, "parents", property(limited_parents))
    assert read_thread_run_id(start) == ""


def test_read_thread_run_id_two_levels_up(tmp_path: Path):
    root = tmp_path / "thread-workspace"
    scripts = root / ".claude" / "skills" / "project-jira" / "scripts"
    scripts.mkdir(parents=True)
    (root / RUN_ID_FILENAME).write_text("run-from-root", encoding="utf-8")
    assert read_thread_run_id(scripts) == "run-from-root"


def test_read_thread_run_id_nearest_ancestor_wins(tmp_path: Path):
    root = tmp_path / "workspace"
    sub = root / "scripts"
    sub.mkdir(parents=True)
    (root / RUN_ID_FILENAME).write_text("root-id", encoding="utf-8")
    (sub / RUN_ID_FILENAME).write_text("sub-id", encoding="utf-8")
    assert read_thread_run_id(sub) == "sub-id"


def test_read_thread_run_id_empty_file_skipped(tmp_path: Path):
    root = tmp_path / "workspace"
    sub = root / "scripts"
    sub.mkdir(parents=True)
    (sub / RUN_ID_FILENAME).write_text("   \n", encoding="utf-8")
    (root / RUN_ID_FILENAME).write_text("parent-id", encoding="utf-8")
    assert read_thread_run_id(sub) == "parent-id"


def test_jira_request_error_includes_response_body(monkeypatch):
    def fake_request(self, method, url, **kwargs):
        request = httpx.Request(method, url)
        return httpx.Response(
            400,
            request=request,
            text='{"errorMessages":["Project requires custom field"]}',
        )

    monkeypatch.setenv("JIRA_URL", "https://jira.example.com")
    monkeypatch.delenv("JIRA_BASE_URL", raising=False)
    monkeypatch.setenv("JIRA_EMAIL", "user@example.com")
    monkeypatch.setenv("JIRA_API_TOKEN", "token")
    monkeypatch.setattr(httpx.Client, "request", fake_request)

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        jira_request("POST", "/issue", json_body={"fields": {}})
    msg = str(exc_info.value)
    assert "400" in msg
    assert "Project requires custom field" in msg


import create_issue  # noqa: E402


def _jira_request_must_not_be_called(*_args, **_kwargs):
    pytest.fail("jira_request must not be called")


def test_create_issue_appends_footer(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("WEB_UI_PUBLIC_BASE_URL", "https://opensre.example.com")
    (tmp_path / RUN_ID_FILENAME).write_text("run-abc", encoding="utf-8")
    captured = {}

    def fake_jira_request(method, path, json_body=None):
        captured["json_body"] = json_body
        return {"key": "OPS-1", "id": "10001"}

    monkeypatch.setattr(create_issue, "jira_request", fake_jira_request)
    monkeypatch.setattr(create_issue, "make_text_body", lambda text: {"raw": text})
    monkeypatch.setattr(create_issue, "get_browse_url", lambda: "")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Need on-call",
            "--description",
            "Likely cause: cron missed",
        ],
    )
    create_issue.main()
    desc = captured["json_body"]["fields"]["description"]["raw"]
    assert "Likely cause: cron missed" in desc
    assert (
        "[View in OpenSRE](https://opensre.example.com/team/agent-runs/run-abc)" in desc
    )


def test_create_issue_omits_footer_without_base_url(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("WEB_UI_PUBLIC_BASE_URL", raising=False)
    (tmp_path / RUN_ID_FILENAME).write_text("run-abc", encoding="utf-8")
    captured = {}

    def fake_jira_request(method, path, json_body=None):
        captured["json_body"] = json_body
        return {"key": "OPS-2", "id": "10002"}

    monkeypatch.setattr(create_issue, "jira_request", fake_jira_request)
    monkeypatch.setattr(create_issue, "make_text_body", lambda text: {"raw": text})
    monkeypatch.setattr(create_issue, "get_browse_url", lambda: "")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Need on-call",
            "--description",
            "Findings",
        ],
    )
    create_issue.main()
    desc = captured["json_body"]["fields"]["description"]["raw"]
    assert desc == "Findings"
    assert "View in OpenSRE" not in desc


def test_create_issue_omits_footer_without_run_id(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("WEB_UI_PUBLIC_BASE_URL", "https://opensre.example.com")
    captured = {}

    def fake_jira_request(method, path, json_body=None):
        captured["json_body"] = json_body
        return {"key": "OPS-3", "id": "10003"}

    monkeypatch.setattr(create_issue, "jira_request", fake_jira_request)
    monkeypatch.setattr(create_issue, "make_text_body", lambda text: {"raw": text})
    monkeypatch.setattr(create_issue, "get_browse_url", lambda: "")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Need on-call",
            "--description",
            "Findings",
        ],
    )
    create_issue.main()
    desc = captured["json_body"]["fields"]["description"]["raw"]
    assert desc == "Findings"
    assert "View in OpenSRE" not in desc


def test_create_issue_fields_merges_custom_field(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    captured = {}

    def fake_jira_request(method, path, json_body=None):
        captured["json_body"] = json_body
        return {"key": "OPS-4", "id": "10004"}

    monkeypatch.setattr(create_issue, "jira_request", fake_jira_request)
    monkeypatch.setattr(create_issue, "make_text_body", lambda text: {"raw": text})
    monkeypatch.setattr(create_issue, "get_browse_url", lambda: "")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Ticket",
            "--fields",
            '{"customfield_99999": {"value": "Yes"}}',
        ],
    )
    create_issue.main()
    assert captured["json_body"]["fields"]["customfield_99999"] == {"value": "Yes"}


def test_create_issue_fields_merge_keeps_investigation_footer(
    tmp_path: Path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("WEB_UI_PUBLIC_BASE_URL", "https://opensre.example.com")
    (tmp_path / RUN_ID_FILENAME).write_text("run-merge", encoding="utf-8")
    captured = {}

    def fake_jira_request(method, path, json_body=None):
        captured["json_body"] = json_body
        return {"key": "OPS-5", "id": "10005"}

    monkeypatch.setattr(create_issue, "jira_request", fake_jira_request)
    monkeypatch.setattr(create_issue, "make_text_body", lambda text: {"raw": text})
    monkeypatch.setattr(create_issue, "get_browse_url", lambda: "")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Ticket",
            "--description",
            "Root cause documented",
            "--fields",
            '{"customfield_99999": {"value": "Yes"}}',
        ],
    )
    create_issue.main()
    fields = captured["json_body"]["fields"]
    assert fields["customfield_99999"] == {"value": "Yes"}
    desc = fields["description"]["raw"]
    assert "Root cause documented" in desc
    assert (
        "[View in OpenSRE](https://opensre.example.com/team/agent-runs/run-merge)"
        in desc
    )


def test_create_issue_fields_invalid_json_exits(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(create_issue, "jira_request", _jira_request_must_not_be_called)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Ticket",
            "--fields",
            "not-json",
        ],
    )
    with pytest.raises(SystemExit) as exc_info:
        create_issue.main()
    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "invalid JSON for --fields" in err


def test_create_issue_fields_description_rejected(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(create_issue, "jira_request", _jira_request_must_not_be_called)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Ticket",
            "--fields",
            '{"description": "bypass"}',
        ],
    )
    with pytest.raises(SystemExit) as exc_info:
        create_issue.main()
    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "--description" in err
    assert "description in --fields" in err


@pytest.mark.parametrize("fields_value", ("[]", '"x"'))
def test_create_issue_fields_must_be_json_object(
    tmp_path: Path, monkeypatch, capsys, fields_value: str
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(create_issue, "jira_request", _jira_request_must_not_be_called)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "create_issue.py",
            "--project",
            "OPS",
            "--summary",
            "Ticket",
            "--fields",
            fields_value,
        ],
    )
    with pytest.raises(SystemExit) as exc_info:
        create_issue.main()
    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "--fields must be a JSON object" in err
