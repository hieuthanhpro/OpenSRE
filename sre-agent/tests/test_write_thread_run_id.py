from pathlib import Path

import server_simple


def test_write_thread_run_id(tmp_path: Path):
    server_simple.write_thread_run_id(
        "thread-a", "run-aaa", sessions_root=str(tmp_path)
    )
    path = tmp_path / "thread-a" / server_simple.RUN_ID_FILENAME
    assert path.read_text(encoding="utf-8") == "run-aaa"


def test_write_thread_run_id_overwrites(tmp_path: Path):
    server_simple.write_thread_run_id(
        "thread-a", "run-old", sessions_root=str(tmp_path)
    )
    server_simple.write_thread_run_id(
        "thread-a", "run-new", sessions_root=str(tmp_path)
    )
    path = tmp_path / "thread-a" / server_simple.RUN_ID_FILENAME
    assert path.read_text(encoding="utf-8") == "run-new"


def test_write_thread_run_id_skips_blank(tmp_path: Path):
    server_simple.write_thread_run_id("thread-a", "", sessions_root=str(tmp_path))
    assert not (tmp_path / "thread-a").exists()
