#!/usr/bin/env python3
"""Search OpenWiki documents by tags, discover available tags, and find related documents.

Usage:
    python search_by_tag.py --tags "payment,refund" [--service SERVICE] [--match-all] [--limit N]
    python search_by_tag.py --list-tags [--service SERVICE]

Examples:
    python search_by_tag.py --tags "payment,purchase"
    python search_by_tag.py --tags "refund" --service openwiki-psp-connector-onecomm
    python search_by_tag.py --tags "architecture,msp" --match-all
    python search_by_tag.py --list-tags
    python search_by_tag.py --list-tags --service openwiki-wsp
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import find_wiki_root, search_by_tags, list_all_tags


def main():
    parser = argparse.ArgumentParser(description="Search OpenWiki by tags or list available tags")
    parser.add_argument("--tags", help="Comma-separated list of tags to search for")
    parser.add_argument("--service", help="Filter by service name")
    parser.add_argument("--match-all", action="store_true", help="Require ALL tags to match (default: any tag)")
    parser.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")
    parser.add_argument("--list-tags", action="store_true", help="List all available tags with counts")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.list_tags:
        tag_counts = list_all_tags(wiki_root, service_filter=args.service)
        if args.json:
            print(json.dumps(tag_counts, indent=2, ensure_ascii=False))
        else:
            print(f"\n🏷️  Available tags in OpenWiki{f' ({args.service})' if args.service else ''}:\n")
            print(f"{'Tag':<30} {'Documents':<10}")
            print("-" * 42)
            for tag, count in tag_counts.items():
                print(f"{tag:<30} {count:<10}")
            print(f"\nTotal unique tags: {len(tag_counts)}")
        return

    if not args.tags:
        print("Error: Specify --tags or --list-tags", file=sys.stderr)
        sys.exit(1)

    tag_list = [t.strip() for t in args.tags.split(",") if t.strip()]
    results = search_by_tags(
        tags=tag_list,
        wiki_root=wiki_root,
        service_filter=args.service,
        match_all=args.match_all,
        limit=args.limit,
    )

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return

    if not results:
        mode = "ALL" if args.match_all else "ANY"
        print(f"No documents found matching {mode} of tags: {', '.join(tag_list)}")
        print("\nTip: Use --list-tags to see available tags")
        return

    mode = "ALL" if args.match_all else "ANY"
    print(f"\n🏷️  Found {len(results)} documents matching {mode} of tags: {', '.join(tag_list)}\n")

    for idx, doc in enumerate(results, 1):
        matched = doc.get("matched_tags", tag_list)
        print(f"{idx}. [{doc['service_display']}] {doc['title']}")
        print(f"   Path: {doc['service']}/{doc['path']}")
        print(f"   Tags: {', '.join(doc.get('tags', []))}")
        if matched:
            print(f"   Matched: {', '.join(matched)}")
        if doc.get("mermaid_count", 0) > 0:
            print(f"   📊 Contains {doc['mermaid_count']} diagram(s)")
        print(f"   → python get_wiki_doc.py --service {doc['service']} --path {doc['path']}")
        print()


if __name__ == "__main__":
    main()
