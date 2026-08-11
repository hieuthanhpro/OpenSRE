#!/usr/bin/env python3
"""CLI script to list Graylog streams."""

import argparse
import json
import sys

from graylog_client import GraylogClient


def main():
    parser = argparse.ArgumentParser(description="List available Graylog streams.")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format (default: text)")
    parser.add_argument("--url", help="Graylog URL (override GRAYLOG_URL)")
    parser.add_argument("--token", help="Graylog API Token (override GRAYLOG_API_TOKEN)")

    args = parser.parse_args()
    client = GraylogClient(base_url=args.url, token=args.token)

    try:
        streams = client.get_streams()

        if args.format == "json":
            print(json.dumps(streams, indent=2))
        else:
            print(f"=== Graylog Streams ({len(streams)} streams found) ===")
            if not streams:
                print("No streams found or accessible.")
                return

            for s in streams:
                sid = s.get("id", "N/A")
                title = s.get("title", "Untitled")
                desc = s.get("description", "")
                disabled = s.get("disabled", False)
                status = "[DISABLED]" if disabled else "[ACTIVE]"
                print(f"• ID: {sid} | Title: {title} {status}")
                if desc:
                    print(f"  Description: {desc}")

    except Exception as e:
        sys.stderr.write(f"Error fetching Graylog streams: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
