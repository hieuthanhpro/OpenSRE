#!/usr/bin/env python3
"""
Oracle Live Diagnostic Presets Tool (OpenSRE Skill Module)
---------------------------------------------------------
Categorized collection of standard diagnostic queries for fast system inspection.
Passes queries to query_oracle.py for execution.

Presets Available:
  - active_sessions : Sessions đang ACTIVE trong hệ thống
  - locks           : Các session gây nghẽn Lock / Blocking sessions
  - cpu             : Tìm các câu lệnh SQL chiếm CPU cao nhất
  - high_cost       : Tìm các câu lệnh SQL có Optimizer Cost cao, thời gian chạy lâu
  - long_ops        : Tìm các câu lệnh / công việc đang chạy lâu (Long operations)
  - physical_io     : Tìm các câu lệnh SQL chiếm Physical Read / Disk I/O cao nhất
  - buffer_gets     : Tìm các câu lệnh SQL tiêu tốn nhiều RAM (Buffer Gets)
  - tablespaces     : Tỉ lệ % dung lượng đĩa cứng của các Tablespace
  - temp_usage      : Các session tiêu tốn dung lượng Temporary Tablespace nhiều nhất

Usage:
    python monitor_presets.py --preset cpu
    python monitor_presets.py --preset high_cost
    python monitor_presets.py --preset long_ops
    python monitor_presets.py --preset physical_io
    python monitor_presets.py --preset locks
    python monitor_presets.py --list
"""

import argparse
import sys
from pathlib import Path

# Add current script dir to sys.path to import query_oracle
script_dir = Path(__file__).resolve().parent
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

from query_oracle import execute_read_only_query

PRESET_QUERIES = {
    # 1. Active Sessions
    "active_sessions": {
        "title": "Sessions đang ACTIVE trong hệ thống",
        "sql": """
            SELECT s.inst_id, s.sid, s.serial#, s.username, s.osuser, s.machine, s.status,
                   DECODE(s.wait_time, 0, s.event, 'CPU') AS wait_event,
                   s.seconds_in_wait, s.sql_id, s.logon_time
            FROM gv$session s
            WHERE s.status = 'ACTIVE' AND s.type = 'USER'
              AND s.username NOT IN ('SYS', 'SYSTEM', 'DBSNMP')
            ORDER BY s.seconds_in_wait DESC
        """
    },
    # 2. Locks & Blocking Sessions
    "locks": {
        "title": "Các session gây nghẽn Lock / Blocking Sessions",
        "sql": """
            SELECT s.inst_id, s.blocking_session, s.sid, s.serial#, s.sql_id,
                   s.seconds_in_wait, s.username, s.osuser, s.machine, s.event
            FROM gv$session s
            WHERE s.blocking_session IS NOT NULL
            ORDER BY s.seconds_in_wait DESC
        """
    },
    # 3. Tìm câu lệnh chiếm tải CPU cao
    "cpu": {
        "title": "Tìm các câu lệnh SQL chiếm CPU cao nhất",
        "sql": """
            SELECT * FROM (
                SELECT sql_id,
                       ROUND(cpu_time / 1000000, 2) AS cpu_seconds,
                       ROUND(elapsed_time / 1000000, 2) AS elapsed_seconds,
                       executions,
                       ROUND(buffer_gets, 0) AS buffer_gets,
                       disk_reads,
                       SUBSTR(sql_text, 1, 120) AS sql_text
                FROM v$sqlarea
                WHERE cpu_time > 0
                ORDER BY cpu_time DESC
            ) WHERE ROWNUM <= 20
        """
    },
    # 4. Tìm câu lệnh SQL chiếm COST cao, thời gian chạy lâu
    "high_cost": {
        "title": "Tìm các câu lệnh SQL có Optimizer Cost cao, thời gian chạy lâu",
        "sql": """
            SELECT * FROM (
                SELECT sql_id,
                       optimizer_cost,
                       ROUND(cpu_time / 1000000, 2) AS cpu_seconds,
                       ROUND(elapsed_time / 1000000, 2) AS elapsed_seconds,
                       executions,
                       buffer_gets,
                       disk_reads,
                       SUBSTR(sql_text, 1, 120) AS sql_text
                FROM v$sqlarea
                WHERE optimizer_cost IS NOT NULL
                ORDER BY optimizer_cost DESC
            ) WHERE ROWNUM <= 20
        """
    },
    # 5. Tìm các câu lệnh SQL / Jobs chạy lâu (Long Operations)
    "long_ops": {
        "title": "Tìm các câu lệnh / công việc đang chạy lâu (Long operations)",
        "sql": """
            SELECT s.sid, s.serial#, s.username, s.opname, s.target,
                   s.sofar, s.totalwork,
                   ROUND(s.time_remaining, 0) AS sec_remaining,
                   ROUND(s.elapsed_seconds, 0) AS sec_elapsed,
                   s.sql_id, s.message
            FROM gv$session_longops s
            WHERE s.time_remaining > 0
            ORDER BY s.time_remaining DESC
        """
    },
    # 6. Tìm các câu lệnh SQL chiếm Physical Read / Disk I/O cao
    "physical_io": {
        "title": "Tìm các câu lệnh SQL chiếm Physical Read / Disk I/O cao nhất",
        "sql": """
            SELECT * FROM (
                SELECT sql_id,
                       disk_reads,
                       ROUND(physical_read_bytes / 1024 / 1024, 2) AS read_mb,
                       ROUND(physical_write_bytes / 1024 / 1024, 2) AS write_mb,
                       executions,
                       ROUND(elapsed_time / 1000000, 2) AS elapsed_seconds,
                       SUBSTR(sql_text, 1, 120) AS sql_text
                FROM v$sqlarea
                WHERE disk_reads > 0
                ORDER BY disk_reads DESC
            ) WHERE ROWNUM <= 20
        """
    },
    # 7. Tìm các câu lệnh SQL tiêu tốn nhiều RAM (Buffer Gets)
    "buffer_gets": {
        "title": "Tìm các câu lệnh SQL tiêu tốn nhiều RAM (Buffer Gets)",
        "sql": """
            SELECT * FROM (
                SELECT sql_id,
                       buffer_gets,
                       executions,
                       ROUND(buffer_gets / GREATEST(executions, 1), 2) AS gets_per_exec,
                       sharable_mem,
                       SUBSTR(sql_text, 1, 120) AS sql_text
                FROM v$sqlarea
                WHERE buffer_gets > 0
                ORDER BY buffer_gets DESC
            ) WHERE ROWNUM <= 20
        """
    },
    # 8. Dung lượng Tablespace
    "tablespaces": {
        "title": "Tỉ lệ % dung lượng đĩa cứng của các Tablespace",
        "sql": """
            SELECT df.tablespace_name,
                   ROUND(df.total_mb, 2) AS total_mb,
                   ROUND(df.total_mb - fs.free_mb, 2) AS used_mb,
                   ROUND(fs.free_mb, 2) AS free_mb,
                   ROUND((df.total_mb - fs.free_mb) / df.total_mb * 100, 2) AS pct_used
            FROM (SELECT tablespace_name, SUM(bytes)/1024/1024 AS total_mb FROM dba_data_files GROUP BY tablespace_name) df
            JOIN (SELECT tablespace_name, SUM(bytes)/1024/1024 AS free_mb FROM dba_free_space GROUP BY tablespace_name) fs
              ON df.tablespace_name = fs.tablespace_name
            ORDER BY pct_used DESC
        """
    },
    # 9. Session chiếm nhiều Temp Tablespace nhất
    "temp_usage": {
        "title": "Các session tiêu tốn dung lượng Temporary Tablespace nhiều nhất",
        "sql": """
            SELECT s.sid, s.serial#, s.username, s.osuser, s.machine,
                   ROUND(u.blocks * (SELECT value FROM v$parameter WHERE name='db_block_size') / 1024 / 1024, 2) AS temp_mb,
                   s.sql_id, s.status
            FROM gv$session s
            JOIN gv$sort_usage u ON s.saddr = u.session_addr AND s.inst_id = u.inst_id
            ORDER BY temp_mb DESC
        """
    }
}

def main():
    parser = argparse.ArgumentParser(description="Oracle Live Diagnostic Presets Tool")
    parser.add_argument("--preset", choices=list(PRESET_QUERIES.keys()), help="Select preset category")
    parser.add_argument("--list", action="store_true", help="List all available presets with descriptions")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    if args.list:
        print("=== Available Diagnostic Presets ===")
        for key, info in PRESET_QUERIES.items():
            print(f"- {key:<15} : {info['title']}")
        return

    if not args.preset:
        print("Please specify a preset with --preset <name> or list presets with --list", file=sys.stderr)
        sys.exit(1)

    preset_info = PRESET_QUERIES[args.preset]
    print(f"=== Running Diagnostic Preset: {preset_info['title']} ===")
    execute_read_only_query(preset_info["sql"], as_json=args.json)

if __name__ == "__main__":
    main()
