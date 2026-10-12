#!/usr/bin/env python3
"""Query database schemas, tables (TB_*), packages (PKG_*), and functions in OpenWiki.

Usage:
    python query_db.py --table "TB_PAYMENT"
    python query_db.py --query "Apple Pay" [--database prod_112]
    python query_db.py --package "PKG_PAYMENT"
    python query_db.py --database prod_112 [--limit N]

Examples:
    python query_db.py --table "TB_PAYMENT"
    python query_db.py --table "applepay"
    python query_db.py --query "refund" --database prod_112
    python query_db.py --package "PKG_PAYMENT"
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
    extract_db_entities,
    expand_query_terms,
    match_service_filter,
)


def search_table_definitions(wiki_root: Path, table_pattern: str, db_filter: str | None = None) -> list[dict]:
    """Search for table definitions in database markdown documents."""
    docs = index_documents(wiki_root, service_filter=db_filter)
    results = []
    seen = set()
    pat = table_pattern.lower()

    for doc in docs:
        # Check if table is in doc's db_tables
        tables = [t for t in doc.get("db_tables", []) if pat in t.lower()]
        if not tables and pat not in doc["title"].lower():
            # Check content if table matches
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
                if pat in content.lower():
                    tables = [t for t in re.findall(r"\b(TB_[A-Z0-9_]+)\b", content) if pat in t.lower()]
            except Exception:
                continue

        for tbl in tables:
            key = (doc["service"], tbl)
            if key in seen:
                continue
            seen.add(key)

            # Try to extract context or column description from document
            description = ""
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
                # Look for table mention in markdown tables or headings
                table_row_match = re.search(rf"`?{re.escape(tbl)}`?\s*\|\s*([^|\n]+)", content)
                if table_row_match:
                    description = table_row_match.group(1).strip()
                else:
                    heading_match = re.search(rf"#+\s+.*{re.escape(tbl)}.*(?:\n+([^\n#]+))?", content)
                    if heading_match and heading_match.group(1):
                        description = heading_match.group(1).strip()
            except Exception:
                pass

            results.append({
                "table": tbl,
                "service": doc["service"],
                "service_display": doc["service_display"],
                "service_type": doc.get("service_type", "database"),
                "source_doc": f"{doc['service']}/{doc['path']}",
                "doc_title": doc["title"],
                "description": description,
            })

    return results


def search_package_definitions(wiki_root: Path, pkg_pattern: str, db_filter: str | None = None) -> list[dict]:
    """Search for package or procedure definitions."""
    docs = index_documents(wiki_root, service_filter=db_filter)
    results = []
    seen = set()
    pat = pkg_pattern.lower()

    for doc in docs:
        pkgs = [p for p in doc.get("db_packages", []) if pat in p.lower()]
        if not pkgs:
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
                if pat in content.lower():
                    pkgs = [p for p in re.findall(r"\b(PKG_[A-Z0-9_]+(?:\.[A-Za-z0-9_]+)?)\b", content) if pat in p.lower()]
            except Exception:
                continue

        for p in pkgs:
            key = (doc["service"], p)
            if key in seen:
                continue
            seen.add(key)

            description = ""
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
                pkg_match = re.search(rf"`?{re.escape(p)}`?\s*\|\s*([^|\n]+)", content)
                if pkg_match:
                    description = pkg_match.group(1).strip()
            except Exception:
                pass

            results.append({
                "package": p,
                "service": doc["service"],
                "service_display": doc["service_display"],
                "source_doc": f"{doc['service']}/{doc['path']}",
                "doc_title": doc["title"],
                "description": description,
            })

    return results


def main():
    parser = argparse.ArgumentParser(description="Query database tables, packages, and schemas in OpenWiki")
    parser.add_argument("--table", help="Search table name (e.g. TB_PAYMENT, TB_INVOICE, applepay)")
    parser.add_argument("--package", help="Search package or procedure name (e.g. PKG_PAYMENT)")
    parser.add_argument("--database", help="Filter by database (e.g. prod_112, 112, prod_114)")
    parser.add_argument("--query", help="General keyword query across database schemas and catalogs")
    parser.add_argument("--limit", type=int, default=25, help="Max results (default: 25)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    db_filter = args.database
    if db_filter and not db_filter.startswith("db-") and not db_filter.startswith("openwiki"):
        db_filter = f"db-{db_filter.replace('_', '-')}"

    output_data = {}

    if args.table:
        table_results = search_table_definitions(wiki_root, args.table, db_filter)
        output_data["tables"] = table_results[:args.limit]

    if args.package:
        pkg_results = search_package_definitions(wiki_root, args.package, db_filter)
        output_data["packages"] = pkg_results[:args.limit]

    if args.query:
        # Search db documents with expanded query
        db_docs = [d for d in index_documents(wiki_root, service_filter=db_filter) if d.get("service_type") == "database"]
        terms = expand_query_terms(args.query)
        scored = []
        for d in db_docs:
            score = 0
            t_str = (d["title"] + " " + d["description"] + " " + " ".join(d.get("db_tables", [])) + " " + " ".join(d.get("db_packages", []))).lower()
            for t in terms:
                if t in t_str:
                    score += 10
            if score > 0:
                scored.append({"doc": d, "score": score})
        scored.sort(key=lambda x: x["score"], reverse=True)
        output_data["matched_catalogs"] = [
            {
                "database": s["doc"]["service"],
                "path": s["doc"]["path"],
                "title": s["doc"]["title"],
                "description": s["doc"]["description"],
                "tables": s["doc"].get("db_tables", [])[:10],
                "packages": s["doc"].get("db_packages", [])[:10],
            }
            for s in scored[:args.limit]
        ]

    if not args.table and not args.package and not args.query:
        if args.database:
            # List summary of database
            db_docs = [d for d in index_documents(wiki_root, service_filter=db_filter) if d.get("service_type") == "database"]
            all_tables = set()
            all_pkgs = set()
            for d in db_docs:
                all_tables.update(d.get("db_tables", []))
                all_pkgs.update(d.get("db_packages", []))
            output_data["database_summary"] = {
                "database": db_filter,
                "document_count": len(db_docs),
                "total_tables_indexed": len(all_tables),
                "total_packages_indexed": len(all_pkgs),
                "sample_tables": sorted(list(all_tables))[:20],
                "sample_packages": sorted(list(all_pkgs))[:20],
            }
        else:
            print("Error: Specify --table, --package, --query, or --database", file=sys.stderr)
            sys.exit(1)

    if args.json:
        print(json.dumps(output_data, indent=2, ensure_ascii=False))
        return

    # Text formatting
    if "tables" in output_data:
        tbls = output_data["tables"]
        print(f"\n🗄️  Found {len(tbls)} matching tables for '{args.table}':\n")
        print(f"{'Table':<32} {'Database / Service':<25} {'Source & Description'}")
        print("-" * 95)
        for t in tbls:
            desc = f" — {t['description'][:45]}" if t['description'] else ""
            print(f"{t['table']:<32} {t['service_display'][:24]:<25} {t['doc_title'][:30]}{desc}")
            print(f"   ↳ file: {t['source_doc']}")
        print()

    if "packages" in output_data:
        pkgs = output_data["packages"]
        print(f"\n📦 Found {len(pkgs)} matching packages/procedures for '{args.package}':\n")
        print(f"{'Package / Procedure':<35} {'Database / Service':<25} {'Source'}")
        print("-" * 90)
        for p in pkgs:
            desc = f" — {p['description'][:40]}" if p['description'] else ""
            print(f"{p['package']:<35} {p['service_display'][:24]:<25} {p['doc_title'][:25]}{desc}")
            print(f"   ↳ file: {p['source_doc']}")
        print()

    if "matched_catalogs" in output_data:
        cats = output_data["matched_catalogs"]
        print(f"\n📑 Found {len(cats)} database schemas matching '{args.query}':\n")
        for c in cats:
            print(f"• [{c['database']}] {c['title']} ({c['path']})")
            if c["description"]:
                print(f"  Description: {c['description']}")
            if c["tables"]:
                print(f"  Tables: {', '.join(c['tables'])}")
            if c["packages"]:
                print(f"  Packages: {', '.join(c['packages'])}")
            print()

    if "database_summary" in output_data:
        s = output_data["database_summary"]
        print(f"\n🗄️  Database Summary for {s['database']}:")
        print(f"  Documents: {s['document_count']}")
        print(f"  Indexed tables: {s['total_tables_indexed']}")
        print(f"  Indexed packages: {s['total_packages_indexed']}")
        print(f"  Tables: {', '.join(s['sample_tables'])}")
        print(f"  Packages: {', '.join(s['sample_packages'])}")
        print()


if __name__ == "__main__":
    main()
