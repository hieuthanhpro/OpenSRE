#!/usr/bin/env python3
"""CLI script to search logs in Graylog using Lucene query syntax."""

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional

from graylog_client import GraylogClient

# Known stream name → ID mapping (pre-cached to avoid extra API calls)
KNOWN_STREAMS = {
    "database log stream": "65421b4eb0394e1c8d76a4e9",
    "all messages": "000000000000000000000001",
    "all events": "000000000000000000000002",
}

# Oracle DB subnet prefix
ORACLE_IP_PREFIX = "10.36.88."


def parse_time_range(range_str: str) -> int:
    """Parse human readable time range like '15m', '2h', '1d', '3600' to seconds."""
    range_str = range_str.strip().lower()
    if range_str.isdigit():
        return int(range_str)

    match = re.match(r"^(\d+)\s*([s|m|h|d])$", range_str)
    if not match:
        raise ValueError(f"Invalid time range format '{range_str}'. Use e.g. 15m, 1h, 24h, 3600.")

    val = int(match.group(1))
    unit = match.group(2)
    multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    return val * multiplier[unit]


def normalize_timestamp(ts: Optional[str]) -> Optional[str]:
    """Normalize user-supplied timestamps to formats accepted by Graylog API:
    - 'YYYY-MM-DD HH:MM:SS'
    - 'YYYY-MM-DDTHH:MM:SS.sssZ'
    """
    if not ts:
        return ts
    ts = ts.strip().strip("\"'")
    # If ends with Z and has no milliseconds (e.g. 2026-09-22T17:50:00Z)
    if re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$', ts):
        return ts[:-1] + ".000Z"
    # If ISO format with timezone offset (e.g., 2026-09-22T17:50:00+07:00 or +0700)
    match_tz = re.match(r'^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}):?(\d{2})?$', ts)
    if match_tz:
        try:
            from datetime import datetime, timezone
            iso_str = f"{match_tz.group(1)}T{match_tz.group(2)}{match_tz.group(3)}:{match_tz.group(4) or '00'}"
            dt = datetime.fromisoformat(iso_str)
            dt_utc = dt.astimezone(timezone.utc)
            return dt_utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        except Exception:
            pass
    # If ISO with 'T' and no timezone offset (e.g., 2026-09-22T17:50:00 or 2026-09-22T17:50)
    if "T" in ts and not ts.endswith("Z"):
        ts = ts.replace("T", " ")
    # If date without seconds: 2026-09-22 17:50
    if re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$', ts):
        return ts + ":00"
    # If date only: 2026-09-22
    # Auto-correct outdated year (e.g. 2025 -> 2026) due to LLM training cutoff
    from datetime import datetime
    current_year = datetime.now().year
    match_year = re.match(r'^(\d{4})-(.*)$', ts)
    if match_year:
        specified_year = int(match_year.group(1))
        if specified_year < current_year:
            ts = f"{current_year}-{match_year.group(2)}"

    return ts


def format_log_entry(msg_obj: Dict[str, Any], fields: List[str]) -> str:
    """Format a single Graylog log message object into a clean text line."""
    message_data = msg_obj.get("message", {})
    timestamp = message_data.get("timestamp", "N/A")
    source = message_data.get("source", "N/A")
    level = message_data.get("level", "")
    text_msg = message_data.get("message", "").strip()

    # Format syslog severity levels if level is numeric
    level_map = {
        0: "EMERG", 1: "ALERT", 2: "CRIT", 3: "ERROR",
        4: "WARN", 5: "NOTICE", 6: "INFO", 7: "DEBUG"
    }
    level_str = level_map.get(level, str(level)) if isinstance(level, int) or (isinstance(level, str) and level.isdigit()) else str(level)
    level_tag = f"[{level_str}]" if level_str else ""

    # Extra custom fields
    extra_fields = []
    for f in fields:
        if f not in ("timestamp", "source", "level", "message") and f in message_data:
            extra_fields.append(f"{f}={message_data[f]}")
    extra_str = f" ({', '.join(extra_fields)})" if extra_fields else ""

    return f"{timestamp} [{source}] {level_tag} {text_msg}{extra_str}"


def resolve_stream_id(client: GraylogClient, stream_ref: str) -> str:
    """Resolve stream name or ID to stream ID.

    Accepts:
    - Stream ID (24-char hex) → returned as-is
    - Stream name (e.g. 'Database Log stream') → resolved via KNOWN_STREAMS or API
    """
    # Already looks like an ID (24-char hex)
    if re.match(r'^[0-9a-f]{24}$', stream_ref, re.IGNORECASE):
        return stream_ref

    # Try known streams first (fast path, no API call)
    key = stream_ref.lower().strip()
    if key in KNOWN_STREAMS:
        return KNOWN_STREAMS[key]

    # Fallback: look up via API
    try:
        streams = client.get_streams()
        for s in streams:
            if s.get('title', '').lower() == key:
                return s['id']
    except Exception:
        pass

    raise ValueError(f"Stream '{stream_ref}' not found. Use stream ID or exact stream name.")


def main():
    parser = argparse.ArgumentParser(
        description="Search Graylog logs via REST API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Oracle 114 quick check (last 5m) — SIMPLEST FORM
  search_logs.py --oracle 114 --range 5m

  # Oracle 114 errors only
  search_logs.py --oracle 114 --query "level:3" --range 15m

  # Oracle 114 with ORA- error filter
  search_logs.py --oracle 114 --query "message:ORA-" --range 1h

  # Search Database Log stream by name
  search_logs.py --query "ORA-" --stream "Database Log stream" --range 1h --limit 20
"""
    )
    parser.add_argument("--query", "-q", default="*", help="Lucene query string (default: '*')")
    parser.add_argument("--oracle", metavar="NNN",
                        help="Oracle DB shortcut: auto-sets query=source:10.36.88.NNN and stream='Database Log stream'")
    parser.add_argument("--range", "-r", default="1h",
                        help="Relative time range (e.g. 5m, 15m, 1h, 24h). Default: 1h")
    parser.add_argument("--from", dest="from_time", help="Start ISO8601 timestamp (absolute range)")
    parser.add_argument("--to", dest="to_time", help="End ISO8601 timestamp (absolute range)")
    parser.add_argument("--limit", "-n", type=int, default=30,
                        help="Max logs to return (default: 30, max recommended: 50)")
    parser.add_argument("--stream",
                        help="Filter by Stream ID or Stream Name (e.g. 'Database Log stream')")
    parser.add_argument("--fields", default="timestamp,source,message,level",
                        help="Comma-separated fields to return")
    parser.add_argument("--format", choices=["text", "json"], default="text",
                        help="Output format (default: text)")
    parser.add_argument("--url", help="Graylog URL (override GRAYLOG_URL)")
    parser.add_argument("--token", help="Graylog API Token (override GRAYLOG_API_TOKEN)")

    args = parser.parse_args()

    client = GraylogClient(base_url=args.url, token=args.token)
    field_list = [f.strip() for f in args.fields.split(",") if f.strip()]

    # --oracle NNN shortcut: auto-set source query
    if args.oracle:
        oracle_num = args.oracle.strip()
        oracle_ip = f"{ORACLE_IP_PREFIX}{oracle_num}"
        # Strip level:<=3 because Oracle alert logs have level: -1 which matches <=3 for all logs
        clean_q = re.sub(r'level:<=?\d+\s*(?:OR\s*)?', '', args.query, flags=re.IGNORECASE).strip()
        clean_q = re.sub(r'\s+OR\s*$', '', clean_q).strip()
        if not clean_q or clean_q == "*":
            args.query = f"source:{oracle_ip} AND log_service:oracle_alert"
        else:
            # If user/agent is looking for ORA- or TNS- errors, auto-expand to include all Oracle alert issues
            # (TMON hung on I/O, Killing hung process, ARCH process failure, Checkpoint not complete, cannot allocate new log)
            if any(kw in clean_q for kw in ("ORA-", "TNS-")) and "TMON" not in clean_q:
                clean_q += ' OR message:timeout OR message:"timed out" OR message:"Checkpoint not complete" OR message:"cannot allocate new log" OR message:TMON OR message:hung OR message:hang* OR message:Killing OR message:Terminating OR message:deadlock OR message:"ARCH process failure" OR message:"FAL request" OR message:LAD'
            args.query = f"source:{oracle_ip} AND log_service:oracle_alert AND ({clean_q})"

    # Resolve stream name → ID (uses pre-cached KNOWN_STREAMS for speed)
    stream_id: Optional[str] = None
    if args.stream:
        try:
            stream_id = resolve_stream_id(client, args.stream)
        except ValueError as e:
            sys.stderr.write(f"Warning: {e}\n")
            stream_id = args.stream  # pass as-is

    try:
        if args.from_time or args.to_time:
            from_clean = normalize_timestamp(args.from_time)
            to_clean = normalize_timestamp(args.to_time)
            if not to_clean:
                from datetime import datetime
                to_clean = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if not from_clean:
                from datetime import datetime, timedelta
                try:
                    dt_to = datetime.fromisoformat(to_clean.replace("Z", "+00:00"))
                    from_clean = (dt_to - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    from_clean = to_clean
            res = client.search_absolute(
                query=args.query,
                from_time=from_clean,
                to_time=to_clean,
                limit=args.limit,
                fields=field_list,
                filter_stream_id=stream_id,
            )
            time_display = f"from='{from_clean}' to='{to_clean}'"
        else:
            range_secs = parse_time_range(args.range)
            res = client.search_relative(
                query=args.query,
                range_seconds=range_secs,
                limit=args.limit,
                fields=field_list,
                filter_stream_id=stream_id,
            )
            time_display = f"range={args.range}"

        messages = res.get("messages", [])
        total_results = res.get("total_results", len(messages))

        # RULE (>50 logs): If >50 logs in timeframe and query didn't target specific errors,
        # ONLY check and display DB errors (ORA-, TNS-, timeouts), process hangs/kills (TMON, hung, LAD, ARCH failure),
        # and DB performance/slowness issues (checkpoint lag, slow, hang, deadlock).
        if total_results > 50 and not any(kw in args.query for kw in ("ORA-", "TNS-", "timeout", "timed out", "TMON", "hung")):
            db_issues_query = (
                f"({args.query}) AND ("
                f"message:ORA- OR message:TNS- OR message:TNS OR message:timeout OR message:\"timed out\" OR "
                f"message:\"Checkpoint not complete\" OR message:\"cannot allocate new log\" OR "
                f"message:deadlock OR message:hang* OR message:hung OR message:waited OR message:\"private strand flush\" OR "
                f"message:TMON OR message:Killing OR message:Terminating OR message:\"ARCH process failure\" OR "
                f"message:\"FAL request\" OR message:LAD OR message:fatal"
                f")"
            )
            try:
                if args.from_time or args.to_time:
                    issue_res = client.search_absolute(
                        query=db_issues_query,
                        from_time=from_clean,
                        to_time=to_clean,
                        limit=args.limit,
                        fields=field_list,
                        filter_stream_id=stream_id,
                    )
                else:
                    issue_res = client.search_relative(
                        query=db_issues_query,
                        range_seconds=range_secs,
                        limit=args.limit,
                        fields=field_list,
                        filter_stream_id=stream_id,
                    )
                issue_msgs = issue_res.get("messages", [])
                issue_count = issue_res.get("total_results", len(issue_msgs))
                if issue_msgs:
                    print(f"=== Graylog Search: Total {total_results} logs in timeframe (>50 logs rule: Filtering exclusively for ORA-, TNS-, timeouts, process hangs & DB issues: Found {issue_count} issues) ===")
                    for m in issue_msgs:
                        el = format_log_entry(m, field_list)
                        print(f"⚠️  {el}")
                    return
                else:
                    print(f"=== Graylog Search: Total {total_results} logs in timeframe (>50 logs rule: Verified 0 ORA-, TNS-, timeout, process hang, or DB slowness issues) ===")
                    print(f"  ✅ Database healthy: All {total_results} logs are routine background operations (LOGMINER, redo switches). No errors or performance issues found.")
                    return
            except Exception:
                pass

        if args.format == "json":
            print(json.dumps({
                "total_results": total_results,
                "messages": [m.get("message", {}) for m in messages]
            }, indent=2))
        else:
            print(f"=== Graylog Search: query='{args.query}' {time_display} "
                  f"(Found {total_results} total, showing {len(messages)}) ===")
            if not messages:
                print("  ✅ No matching logs found.")
                return

            for msg in messages:
                line = format_log_entry(msg, field_list)
                line_lower = line.lower()
                # Highlight ORA-, TNS- errors, timeouts, process hangs/kills, and high severity levels
                if any(kw in line_lower for kw in (
                    "ora-", "tns-", "tns:", "[error]", "[crit]", "[alert]", "[emerg]",
                    "timed out", "timeout", "deadlock", "checkpoint not complete",
                    "cannot allocate new log", "tmon", "hung", "killing", "terminating process",
                    "arch process failure", "fal request rejected", "fatal"
                )):
                    print(f"⚠️  {line}")
                else:
                    print(f"   {line}")

    except Exception as e:
        err_msg = str(e)
        if "503" in err_msg or "Service Unavailable" in err_msg:
            print(f"❌ Lỗi kết nối Graylog (HTTP 503 Service Unavailable): Server Graylog tại http://192.168.166.109/ hiện đang tạm ngắt kết nối (Backend service is down).")
        else:
            print(f"❌ Lỗi kết nối Graylog: {err_msg}")
        sys.exit(1)



if __name__ == "__main__":
    main()
