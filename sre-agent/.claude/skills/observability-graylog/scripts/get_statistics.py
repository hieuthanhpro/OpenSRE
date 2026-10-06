#!/usr/bin/env python3
"""CLI script to aggregate log statistics & field terms breakdown from Graylog."""

import argparse
import json
import re
import sys
from typing import Any, Dict

from graylog_client import GraylogClient
from search_logs import parse_time_range


def main():
    parser = argparse.ArgumentParser(description="Get log statistics & term breakdown from Graylog.")
    parser.add_argument("--field", "-f", default="source", help="Field to aggregate by (default: 'source', e.g. level, facility)")
    parser.add_argument("--query", "-q", default="*", help="Lucene query filter (default: '*')")
    parser.add_argument("--range", "-r", default="1h", help="Time range (e.g. 15m, 1h, 24h). Default: 1h")
    parser.add_argument("--stream", help="Filter by Stream ID")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format (default: text)")
    parser.add_argument("--url", help="Graylog URL (override GRAYLOG_URL)")
    parser.add_argument("--token", help="Graylog API Token (override GRAYLOG_API_TOKEN)")

    args = parser.parse_args()
    client = GraylogClient(base_url=args.url, token=args.token)

    try:
        range_secs = parse_time_range(args.range)
        res = client.get_field_terms(
            field=args.field,
            query=args.query,
            range_seconds=range_secs,
            filter_stream_id=args.stream,
        )

        terms = res.get("terms", {})
        total = res.get("total", sum(terms.values()) if isinstance(terms, dict) else 0)

        if args.format == "json":
            print(json.dumps({"field": args.field, "total": total, "terms": terms}, indent=2))
        else:
            print(f"=== Graylog Log Statistics for Field '{args.field}' (Time range: {args.range}, Total: {total}) ===")
            if not terms:
                print("No term breakdown returned.")
                return

            # Sort by count desc
            sorted_terms = sorted(terms.items(), key=lambda x: x[1], reverse=True)
            for term, count in sorted_terms:
                pct = (count / total * 100) if total > 0 else 0
                print(f"  - {term}: {count:,} ({pct:.1f}%)")

    except Exception as e:
        sys.stderr.write(f"Error fetching Graylog statistics: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
