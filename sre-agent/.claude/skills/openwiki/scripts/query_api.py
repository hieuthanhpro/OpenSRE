#!/usr/bin/env python3
"""Query API endpoints across all services in OpenWiki.

Usage:
    python query_api.py --query "SEARCH" [--service SERVICE] [--method METHOD] [--json]
    python query_api.py --service openwiki-wsp [--limit N]

Examples:
    python query_api.py --query "applepay"
    python query_api.py --query "payment" --method POST
    python query_api.py --service wsp
    python query_api.py --query "token" --service tvsp
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import (
    find_wiki_root,
    index_documents,
    extract_api_endpoints,
    match_service_filter,
)


def main():
    parser = argparse.ArgumentParser(description="Query API endpoints documented in OpenWiki")
    parser.add_argument("--query", help="Keyword in endpoint path or description (e.g. applepay, refund, token)")
    parser.add_argument("--service", help="Filter by service (e.g. wsp, msp, psp-connector)")
    parser.add_argument("--method", choices=["GET", "POST", "PUT", "DELETE", "PATCH"], help="Filter by HTTP method")
    parser.add_argument("--limit", type=int, default=30, help="Max endpoints to display (default: 30)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    docs = index_documents(wiki_root, service_filter=args.service)
    endpoints = []
    seen = set()
    query_lower = args.query.lower() if args.query else None

    for doc in docs:
        doc_apis = doc.get("apis", [])
        if not doc_apis:
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
                doc_apis = extract_api_endpoints(content)
            except Exception:
                continue

        for api in doc_apis:
            m = api.get("method", "").upper()
            p = api.get("path", "")
            
            if args.method and m != args.method:
                continue

            if query_lower:
                match_text = f"{m} {p} {doc['title']} {doc['path']}".lower()
                if query_lower not in match_text:
                    continue

            key = (doc["service"], m, p)
            if key in seen:
                continue
            seen.add(key)

            entry = {
                "service": doc["service"],
                "service_display": doc["service_display"],
                "method": m,
                "path": p,
                "caller": api.get("caller", ""),
                "receiver": api.get("receiver", ""),
                "source_doc": f"{doc['service']}/{doc['path']}",
                "doc_title": doc["title"],
            }
            endpoints.append(entry)

    if args.json:
        print(json.dumps(endpoints[:args.limit], indent=2, ensure_ascii=False))
        return

    if not endpoints:
        msg = "No API endpoints found"
        if args.query:
            msg += f" matching query '{args.query}'"
        if args.service:
            msg += f" for service '{args.service}'"
        if args.method:
            msg += f" with method '{args.method}'"
        print(msg)
        return

    print(f"\n🌐 Found {len(endpoints)} API endpoints" + (f" (showing top {min(len(endpoints), args.limit)}):" if len(endpoints) > args.limit else ":") + "\n")
    print(f"{'Method':<8} {'Path / Endpoint':<45} {'Service':<20} {'Source Doc'}")
    print("-" * 105)

    for ep in endpoints[:args.limit]:
        caller_info = f" ({ep['caller']} → {ep['receiver']})" if ep['caller'] and ep['receiver'] else ""
        print(f"{ep['method']:<8} {(ep['path'] + caller_info):<45} {ep['service_display'][:19]:<20} {ep['doc_title'][:30]}")
        print(f"         ↳ doc: {ep['source_doc']}")

    print()


if __name__ == "__main__":
    main()
