#!/usr/bin/env python3
"""Search OpenWiki documents, architecture guides, workflows, and diagrams.

Usage:
    python search_wiki.py --query "SEARCH_QUERY" [--service SERVICE] [--type TYPE] [--limit N] [--json]

Examples:
    python search_wiki.py --query "payment purchase flow"
    python search_wiki.py --query "authentication jwt" --service openwiki-wsp
    python search_wiki.py --query "refund" --type workflow --limit 5
"""

import argparse
import json
import sys
from pathlib import Path

# Add script directory to sys.path so openwiki_common can be imported directly
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import find_wiki_root, search_wiki


def main():
    parser = argparse.ArgumentParser(description="Search OpenWiki documentation and architecture guides")
    parser.add_argument("--query", required=True, help="Search terms or keywords")
    parser.add_argument("--service", help="Filter by service name (e.g. openwiki-psp-connector-onecomm)")
    parser.add_argument("--type", help="Filter by doc type (e.g. workflow, architecture, concept, operations)")
    parser.add_argument("--limit", type=int, default=8, help="Max results to return (default: 8)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    results = search_wiki(
        query=args.query,
        wiki_root=wiki_root,
        service_filter=args.service,
        doc_type=args.type,
        limit=args.limit,
    )

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return

    if not results:
        print(f"No OpenWiki documents found matching query: '{args.query}'")
        if args.service:
            print(f"(Filtered by service: {args.service})")
        return

    print(f"\n🔍 Found {len(results)} relevant OpenWiki documents:\n")
    for idx, r in enumerate(results, 1):
        score_info = f" [relevance: {r.get('score', 0)}]" if "score" in r else ""
        print(f"{idx}. {r['title']} ({r['service']}/{r['path']}){score_info}")
        if r.get("description"):
            print(f"   Description: {r['description']}")
        if r.get("tags"):
            print(f"   Tags: {', '.join(r['tags'])}")
        print(f"   To read full doc: python get_wiki_doc.py --service {r['service']} --path {r['path']}")
        print()


if __name__ == "__main__":
    main()
