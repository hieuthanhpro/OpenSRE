#!/usr/bin/env python3
"""Query, trace, and explain service interaction flows from OpenWiki documentation.

Capabilities:
1. Trace flows between two services (e.g., WSP → MSP)
2. Find all diagrams related to a topic (e.g., "refund", "payment")
3. Extract and display Mermaid diagrams from specific documents
4. Generate sequence diagrams from documented flow steps

Usage:
    python query_flow.py --from WSP --to MSP [--type payment]
    python query_flow.py --topic "refund flow"
    python query_flow.py --diagrams --service openwiki-psp-connector-onecomm
    python query_flow.py --explain --service openwiki --path workflows/cross-service-flows.md

Examples:
    python query_flow.py --from wsp --to msp --type payment
    python query_flow.py --from msp --to psp --type refund
    python query_flow.py --topic "Apple Pay authorization"
    python query_flow.py --topic "tokenization" --diagram-type sequence
    python query_flow.py --diagrams --service openwiki-wsp
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import (
    find_wiki_root,
    trace_service_flow,
    query_system_flow,
    find_diagrams_by_topic,
    extract_mermaid_diagrams,
    read_doc_content,
    build_flow_diagram_from_docs,
    index_documents,
)


def cmd_trace_flow(args, wiki_root):
    """Trace interaction flow between two services."""
    result = trace_service_flow(
        from_service=args.from_svc,
        to_service=args.to_svc,
        wiki_root=wiki_root,
        flow_type=args.type,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    flow_desc = f" ({args.type})" if args.type else ""
    print(f"\n🔗 Flow trace: {args.from_svc} → {args.to_svc}{flow_desc}\n")

    if not result["matching_docs"]:
        print(f"  No documented flows found between {args.from_svc} and {args.to_svc}")
        print("  Try broader terms: wsp, msp, psp, tvsp, onesm, scsp")
        return

    print(f"📄 Found {len(result['matching_docs'])} related documents:")
    for doc in result["matching_docs"]:
        print(f"  • [{doc['service_display']}] {doc['title']} ({doc['service']}/{doc['path']})")

    if result.get("apis"):
        print(f"\n🌐 Documented APIs between services ({len(result['apis'])}):")
        for api in result["apis"][:15]:
            caller_info = f" ({api.get('caller')} → {api.get('receiver')})" if api.get('caller') else ""
            print(f"  • {api['method']} {api['path']}{caller_info} [{api['service']}]")

    if result.get("db_tables") or result.get("db_packages"):
        print(f"\n🗄️ Database Tables & Packages:")
        if result.get("db_tables"):
            print(f"  • Tables: {', '.join(result['db_tables'][:12])}")
        if result.get("db_packages"):
            print(f"  • Packages: {', '.join(result['db_packages'][:8])}")

    if result.get("partners"):
        print(f"\n🤝 Partners / Gateways: {', '.join(result['partners'])}")

    if result["relevant_diagrams"]:
        print(f"\n📊 Found {len(result['relevant_diagrams'])} relevant diagrams:\n")
        for idx, diag in enumerate(result["relevant_diagrams"], 1):
            print(f"── Diagram {idx}: {diag['title']} ({diag['type']}) ──")
            print(f"   Source: {diag['source']}")
            print(f"```mermaid")
            print(diag["code"])
            print(f"```")
            print()

    if result["flow_steps"]:
        print(f"\n📋 Extracted {len(result['flow_steps'])} interaction steps:")
        for idx, step in enumerate(result["flow_steps"][:25], 1):
            arrow = "←" if step["is_response"] else "→"
            step_type = "response" if step["is_response"] else "request"
            print(f"  {idx}. {step['from']} {arrow} {step['to']}: {step['message']} [{step_type}]")


def cmd_topic_search(args, wiki_root):
    """Comprehensive flow search by topic across services, APIs, databases, and partners."""
    result = query_system_flow(
        topic=args.topic,
        wiki_root=wiki_root,
        service_filter=args.service,
        limit=args.limit,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    if not result["matched_docs"] and not result["diagrams"]:
        print(f"No flows or documentation found for topic: '{args.topic}'")
        return

    print(f"\n🔄 System Flow & Architecture for Topic: '{args.topic}'\n")

    if result["matched_docs"]:
        print(f"📄 Matched Documentation ({len(result['matched_docs'])}):")
        for doc in result["matched_docs"][:6]:
            print(f"  • [{doc['service_display']}] {doc['title']} ({doc['service']}/{doc['path']})")
        print()

    if result["apis"]:
        print(f"🌐 APIs Invoked ({len(result['apis'])}):")
        for ep in result["apis"][:15]:
            caller_info = f" ({ep.get('caller')} → {ep.get('receiver')})" if ep.get('caller') else ""
            print(f"  • {ep['method']:<6} {ep['path']:<45}{caller_info} [{ep['service']}]")
        print()

    if result["db_tables"] or result["db_packages"]:
        print(f"🗄️ Database Tables & Stored Procedures:")
        if result["db_tables"]:
            print(f"  • Tables: {', '.join(result['db_tables'][:15])}")
        if result["db_packages"]:
            print(f"  • Packages: {', '.join(result['db_packages'][:10])}")
        print()

    if result["partners"]:
        print(f"🤝 External Partners / Acquirers:")
        print(f"  • {', '.join(result['partners'])}")
        print()

    if result["diagrams"]:
        print(f"📊 Mermaid Sequence / Architecture Diagrams ({len(result['diagrams'])}):\n")
        for idx, diag in enumerate(result["diagrams"][:3], 1):
            print(f"── Diagram {idx}: {diag['title']} ({diag['type']}) ──")
            print(f"   Source: {diag['source']}")
            print(f"```mermaid")
            print(diag["code"])
            print(f"```\n")

    elif result.get("generated_diagram"):
        print(f"📊 Generated Sequence Diagram:\n")
        print(f"```mermaid")
        print(result["generated_diagram"])
        print(f"```\n")

    if result["flow_steps"]:
        print(f"📋 Step-by-Step Flow Interactions ({len(result['flow_steps'])}):")
        for idx, step in enumerate(result["flow_steps"][:20], 1):
            arrow = "←" if step["is_response"] else "→"
            print(f"  {idx}. {step['from']} {arrow} {step['to']}: {step['message']}")
        print()


def cmd_list_diagrams(args, wiki_root):
    """List all diagrams in a service."""
    docs = index_documents(wiki_root, service_filter=args.service)
    total_diagrams = 0

    if args.json:
        all_diagrams = []
        for doc in docs:
            if doc["mermaid_count"] == 0:
                continue
            try:
                content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            diagrams = extract_mermaid_diagrams(content)
            for d in diagrams:
                all_diagrams.append({
                    "service": doc["service"],
                    "path": doc["path"],
                    "diagram": d,
                })
        print(json.dumps(all_diagrams, indent=2, ensure_ascii=False))
        return

    svc_label = f" in {args.service}" if args.service else ""
    print(f"\n📊 All Mermaid diagrams{svc_label}:\n")

    for doc in docs:
        if doc["mermaid_count"] == 0:
            continue

        try:
            content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        diagrams = extract_mermaid_diagrams(content)
        total_diagrams += len(diagrams)

        print(f"📄 {doc['title']} ({doc['service']}/{doc['path']})")
        for d in diagrams:
            p_info = ""
            if d.get("participants"):
                p_info = f" — {', '.join(p['alias'] for p in d['participants'][:5])}"
            print(f"   #{d['index']} [{d['type']}] {d['title']}{p_info}")
        print()

    print(f"Total: {total_diagrams} diagrams")


def cmd_explain_doc(args, wiki_root):
    """Read and explain a specific document with its flows and diagrams."""
    doc_data = read_doc_content(wiki_root, args.service, args.path, max_chars=args.max_chars)

    if args.json:
        print(json.dumps(doc_data, indent=2, ensure_ascii=False))
        return

    if "error" in doc_data:
        print(f"Error: {doc_data['error']}", file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print(f"📄 {doc_data['title']}")
    if doc_data["description"]:
        print(f"   {doc_data['description']}")
    print(f"   Type: {doc_data['type']} | Tags: {', '.join(doc_data['tags']) if doc_data['tags'] else 'none'}")
    print(f"   Diagrams: {doc_data['diagram_count']} | Flow steps: {doc_data['flow_step_count']}")
    print("=" * 70)

    # Show table of contents
    if doc_data["headings"]:
        print("\n📑 Table of Contents:")
        for h in doc_data["headings"]:
            indent = "  " * (h["level"] - 1)
            print(f"   {indent}{'#' * h['level']} {h['text']}")

    # Show diagrams summary
    if doc_data["diagrams"]:
        print(f"\n📊 Diagrams ({doc_data['diagram_count']}):")
        for d in doc_data["diagrams"]:
            p_info = ""
            if d.get("participants"):
                names = [p["alias"] for p in d["participants"][:6]]
                p_info = f" → {' ↔ '.join(names)}"
            print(f"   #{d['index']} [{d['type']}] {d['title']}{p_info}")

    # Show flow interaction steps
    if doc_data["flow_steps"]:
        print(f"\n📋 Documented interactions ({doc_data['flow_step_count']} steps):")
        for idx, step in enumerate(doc_data["flow_steps"][:30], 1):
            arrow = "←" if step["is_response"] else "→"
            print(f"   {idx}. {step['from']} {arrow} {step['to']}: {step['message']}")
        if doc_data["flow_step_count"] > 30:
            print(f"   ... and {doc_data['flow_step_count'] - 30} more steps")

    # Show content
    print("\n" + "─" * 70)
    print(doc_data["content"])
    if doc_data["truncated"]:
        print(f"\n... [Truncated at {args.max_chars} chars. Total: {doc_data['total_chars']}. Use --max-chars to see more]")


def main():
    parser = argparse.ArgumentParser(
        description="Query, trace, and explain service interaction flows from OpenWiki",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Mode selection
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--from", dest="from_svc", help="Source service for flow tracing (e.g., wsp, msp)")
    mode_group.add_argument("--topic", help="Search diagrams by topic (e.g., 'refund flow')")
    mode_group.add_argument("--diagrams", action="store_true", help="List all diagrams in a service")
    mode_group.add_argument("--explain", action="store_true", help="Deep-read a document with structure analysis")

    # Flow tracing args
    parser.add_argument("--to", dest="to_svc", help="Target service for flow tracing")
    parser.add_argument("--type", help="Flow type filter (payment, refund, tokenization, etc.)")

    # Common args
    parser.add_argument("--service", help="Filter by service name")
    parser.add_argument("--path", help="Document path (for --explain mode)")
    parser.add_argument("--diagram-type", choices=["sequence", "flowchart", "state", "class"], help="Filter diagram type")
    parser.add_argument("--limit", type=int, default=10, help="Max results (default: 10)")
    parser.add_argument("--max-chars", type=int, default=20000, help="Max content chars for --explain (default: 20000)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.from_svc:
        if not args.to_svc:
            print("Error: --to is required when using --from", file=sys.stderr)
            sys.exit(1)
        cmd_trace_flow(args, wiki_root)
    elif args.topic:
        cmd_topic_search(args, wiki_root)
    elif args.diagrams:
        cmd_list_diagrams(args, wiki_root)
    elif args.explain:
        if not args.service or not args.path:
            print("Error: --service and --path are required for --explain mode", file=sys.stderr)
            sys.exit(1)
        cmd_explain_doc(args, wiki_root)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
