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
        if args.query == "*":
            args.query = f"source:{oracle_ip}"
        else:
            args.query = f"source:{oracle_ip} AND ({args.query})"

    # Resolve stream name → ID (uses pre-cached KNOWN_STREAMS for speed)
    stream_id: Optional[str] = None
    if args.stream:
        try:
            stream_id = resolve_stream_id(client, args.stream)
        except ValueError as e:
            sys.stderr.write(f"Warning: {e}\n")
            stream_id = args.stream  # pass as-is

    try:
        if args.from_time and args.to_time:
            res = client.search_absolute(
                query=args.query,
                from_time=args.from_time,
                to_time=args.to_time,
                limit=args.limit,
                fields=field_list,
                filter_stream_id=stream_id,
            )
        else:
            range_secs = parse_time_range(args.range)
            res = client.search_relative(
                query=args.query,
                range_seconds=range_secs,
                limit=args.limit,
                fields=field_list,
                filter_stream_id=stream_id,
            )

        messages = res.get("messages", [])
        total_results = res.get("total_results", len(messages))

        if args.format == "json":
            print(json.dumps({
                "total_results": total_results,
                "messages": [m.get("message", {}) for m in messages]
            }, indent=2))
        else:
            print(f"=== Graylog Search: query='{args.query}' range={args.range} "
                  f"(Found {total_results} total, showing {len(messages)}) ===")
            if not messages:
                print("  ✅ No matching logs found.")
                return

            for msg in messages:
                line = format_log_entry(msg, field_list)
                # Highlight ORA- errors and high severity levels
                if any(kw in line for kw in ("ORA-", "[ERROR]", "[CRIT]", "[ALERT]", "[EMERG]")):
                    print(f"⚠️  {line}")
                else:
                    print(f"   {line}")

    except Exception as e:
        sys.stderr.write(f"Error executing Graylog search: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
