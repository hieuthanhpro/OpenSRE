#!/usr/bin/env python3
"""Retrieve and display the content of a specific OpenWiki document.

Usage:
    python get_wiki_doc.py --service SERVICE --path PATH [--max-chars N]
    python get_wiki_doc.py --file ABSOLUTE_OR_REL_PATH [--max-chars N]

Examples:
    python get_wiki_doc.py --service openwiki-psp-connector-onecomm --path workflows/purchase.md
    python get_wiki_doc.py --service openwiki-wsp --path concepts/card-brands.md
"""

import argparse
import sys
from pathlib import Path

# Add script directory to sys.path so openwiki_common can be imported directly
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import find_wiki_root, parse_frontmatter


def main():
    parser = argparse.ArgumentParser(description="Fetch and read OpenWiki documentation")
    parser.add_argument("--service", help="Service directory name (e.g. openwiki-psp-connector-onecomm)")
    parser.add_argument("--path", help="Relative path within the service (e.g. workflows/purchase.md)")
    parser.add_argument("--file", help="Direct path to the markdown file")
    parser.add_argument("--max-chars", type=int, default=15000, help="Maximum characters to print (default: 15000)")

    args = parser.parse_args()

    target_file: Path | None = None

    if args.file:
        target_file = Path(args.file)
        if not target_file.is_file():
            # Try resolving relative to wiki root
            try:
                target_file = find_wiki_root() / args.file
            except Exception:
                pass
    elif args.service and args.path:
        try:
            wiki_root = find_wiki_root()
            target_file = wiki_root / args.service / args.path
        except Exception as e:
            print(f"Error finding wiki root: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print("Error: Specify either --service and --path, or --file", file=sys.stderr)
        sys.exit(1)

    if not target_file or not target_file.is_file():
        print(f"Document not found at: {target_file}", file=sys.stderr)
        sys.exit(1)

    try:
        content = target_file.read_text(encoding="utf-8", errors="replace")
        meta, body = parse_frontmatter(content)
    except Exception as e:
        print(f"Error reading document: {e}", file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print(f"📄 OpenWiki Document: {target_file.name}")
    if meta.get("title"):
        print(f"Title: {meta['title']}")
    if meta.get("type"):
        print(f"Type: {meta['type']}")
    if meta.get("description"):
        print(f"Description: {meta['description']}")
    if meta.get("tags"):
        tags = meta["tags"]
        print(f"Tags: {', '.join(tags) if isinstance(tags, list) else tags}")
    print("=" * 70)
    print()

    if len(body) > args.max_chars:
        print(body[:args.max_chars])
        print(f"\n... [Document truncated at {args.max_chars} chars. Use --max-chars to view more]")
    else:
        print(body)


if __name__ == "__main__":
    main()
