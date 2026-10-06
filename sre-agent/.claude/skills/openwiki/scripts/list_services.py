#!/usr/bin/env python3
"""List all documented services and their structure in OpenWiki.

Usage:
    python list_services.py [--json]

Examples:
    python list_services.py
    python list_services.py --json
"""

import argparse
import json
import sys
from pathlib import Path

# Add script directory to sys.path so openwiki_common can be imported directly
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import find_wiki_root, get_service_directories, parse_frontmatter


def main():
    parser = argparse.ArgumentParser(description="List services documented in OpenWiki")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    services_data = []
    service_dirs = get_service_directories(wiki_root)

    for svc_dir in service_dirs:
        svc_name = svc_dir.name
        docs = list(svc_dir.rglob("*.md"))
        categories = set()
        for doc in docs:
            rel = doc.relative_to(svc_dir)
            if len(rel.parts) > 1:
                categories.add(rel.parts[0])

        # Try to read index.md or quickstart.md for overview
        overview = ""
        index_file = svc_dir / "index.md"
        if not index_file.is_file():
            index_file = svc_dir / "quickstart.md"

        if index_file.is_file():
            try:
                meta, body = parse_frontmatter(index_file.read_text(encoding="utf-8", errors="ignore"))
                overview = meta.get("description", "")
                if not overview:
                    for line in body.splitlines():
                        line = line.strip()
                        if line and not line.startswith("#"):
                            overview = line[:200]
                            break
            except Exception:
                pass

        services_data.append({
            "service_id": svc_name,
            "display_name": svc_name.replace("openwiki-", ""),
            "document_count": len(docs),
            "categories": sorted(list(categories)),
            "overview": overview,
        })

    if args.json:
        print(json.dumps(services_data, indent=2, ensure_ascii=False))
        return

    print("\n📚 OpenWiki Documented Microservices:\n")
    print(f"{'Service ID':<35} {'Docs':<6} {'Categories':<35}")
    print("-" * 80)
    for s in services_data:
        cats = ", ".join(s["categories"][:4])
        print(f"{s['service_id']:<35} {s['document_count']:<6} {cats:<35}")
        if s["overview"]:
            print(f"   ↳ {s['overview'][:100]}...")
    print()


if __name__ == "__main__":
    main()
