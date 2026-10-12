#!/usr/bin/env python3
"""List all documented services and databases in OpenWiki.

Usage:
    python list_services.py [--type microservice|database] [--json]

Examples:
    python list_services.py
    python list_services.py --type microservice
    python list_services.py --type database
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
    parser = argparse.ArgumentParser(description="List services and databases documented in OpenWiki")
    parser.add_argument("--type", choices=["microservice", "database"], help="Filter by type")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    services_data = []
    service_items = get_service_directories(wiki_root)

    for item in service_items:
        svc_path = item["path"]
        svc_id = item["id"]
        svc_name = item["name"]
        svc_type = item["type"]

        if args.type and svc_type != args.type:
            continue

        docs = list(svc_path.rglob("*.md"))
        categories = set()
        for doc in docs:
            try:
                rel = doc.relative_to(svc_path)
                if len(rel.parts) > 1:
                    categories.add(rel.parts[0])
            except Exception:
                continue

        # Try to read index.md or quickstart.md or schema overview
        overview = ""
        index_file = svc_path / "index.md"
        if not index_file.is_file():
            index_file = svc_path / "quickstart.md"
        if not index_file.is_file():
            candidates = list(svc_path.glob("*.md"))
            if candidates:
                index_file = candidates[0]

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
            "service_id": svc_id,
            "display_name": svc_name,
            "type": svc_type,
            "document_count": len(docs),
            "categories": sorted(list(categories)),
            "overview": overview,
        })

    if args.json:
        print(json.dumps(services_data, indent=2, ensure_ascii=False))
        return

    # Split microservices and databases
    microservices = [s for s in services_data if s["type"] == "microservice"]
    databases = [s for s in services_data if s["type"] == "database"]

    if microservices:
        print("\n🚀 OpenWiki Documented Microservices:\n")
        print(f"{'Service ID':<35} {'Docs':<6} {'Categories':<35}")
        print("-" * 80)
        for s in microservices:
            cats = ", ".join(s["categories"][:4])
            print(f"{s['service_id']:<35} {s['document_count']:<6} {cats:<35}")
            if s["overview"]:
                print(f"   ↳ {s['overview'][:100]}...")
        print()

    if databases:
        print("\n🗄️  OpenWiki Documented Databases:\n")
        print(f"{'Database ID':<35} {'Docs':<6} {'Categories':<35}")
        print("-" * 80)
        for s in databases:
            cats = ", ".join(s["categories"][:4])
            print(f"{s['service_id']:<35} {s['document_count']:<6} {cats:<35}")
            if s["overview"]:
                print(f"   ↳ {s['overview'][:100]}...")
        print()


if __name__ == "__main__":
    main()
