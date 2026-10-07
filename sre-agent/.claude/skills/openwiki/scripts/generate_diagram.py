#!/usr/bin/env python3
"""Generate Mermaid diagrams from OpenWiki documentation context.

Capabilities:
1. Find and return existing diagrams from the wiki
2. Generate new sequence diagrams from documented flow steps
3. Build service topology diagrams based on document references
4. Compose custom diagrams from extracted interactions

Usage:
    python generate_diagram.py --query "QUERY" [--type sequence|flowchart] [--service SERVICE]
    python generate_diagram.py --overview [--service SERVICE]

Examples:
    python generate_diagram.py --query "payment flow WSP to MSP"
    python generate_diagram.py --query "refund from psp-connector-onecomm"
    python generate_diagram.py --query "tokenization" --type sequence
    python generate_diagram.py --overview
    python generate_diagram.py --overview --service openwiki-wsp
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
from openwiki_common import (
    find_wiki_root,
    build_flow_diagram_from_docs,
    find_diagrams_by_topic,
    get_wiki_summary,
    service_display_name,
    index_documents,
)


def cmd_generate(args, wiki_root):
    """Generate or find diagrams based on query."""
    diag_type = args.type or "sequence"
    result = build_flow_diagram_from_docs(
        query=args.query,
        wiki_root=wiki_root,
        diagram_type=diag_type,
        service_filter=args.service,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    print(f"\n🔍 Diagram search: '{args.query}' (type: {diag_type})\n")

    if result["source_documents"]:
        print(f"📄 Source documents ({len(result['source_documents'])}):")
        for doc in result["source_documents"]:
            print(f"  • [{doc['service']}] {doc['title']} — {doc['path']}")

    if result.get("recommendation") and not args.generate_only:
        print(f"\n💡 {result['recommendation']}")

    if result["existing_diagrams"] and not args.generate_only:
        print(f"\n📊 Found {len(result['existing_diagrams'])} existing diagram(s) from documentation:\n")
        for idx, diag in enumerate(result["existing_diagrams"], 1):
            print(f"── Diagram {idx}: {diag['title']} ({diag['type']}) ──")
            if diag.get("participants"):
                names = [p["alias"] for p in diag["participants"]]
                print(f"   Participants: {', '.join(names)}")
            print(f"\n```mermaid")
            print(diag["code"])
            print(f"```\n")

    if result["generated_diagram"]:
        print(f"\n🔧 Generated diagram from {result['flow_steps_count']} extracted steps:\n")
        print(f"```mermaid")
        print(result["generated_diagram"])
        print(f"```\n")

    if not result["existing_diagrams"] and not result["generated_diagram"]:
        print("\n⚠️  No diagrams found or generated. Try:")
        print("  • Broader query terms (e.g., 'payment', 'refund', 'token')")
        print("  • query_flow.py --topic for topic-based diagram search")
        print("  • query_flow.py --from wsp --to msp for flow tracing")


def cmd_overview(args, wiki_root):
    """Generate an overview topology diagram of the wiki."""
    summary = get_wiki_summary(wiki_root)

    if args.json:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
        return

    print("\n📚 OpenWiki Knowledge Base Overview\n")
    print(f"   Total documents: {summary['total_documents']}")
    print(f"   Total services:  {summary['total_services']}")
    print(f"   Total diagrams:  {summary['total_diagrams']}")
    print(f"   All tags: {', '.join(summary['all_tags'][:20])}")
    if len(summary['all_tags']) > 20:
        print(f"   ... and {len(summary['all_tags']) - 20} more tags")

    print(f"\n{'Service':<35} {'Docs':<6} {'Diagrams':<10} {'Categories':<35}")
    print("-" * 90)

    for svc_id, svc_info in summary["services"].items():
        cats = ", ".join(svc_info["categories"][:4])
        print(f"{svc_info['display_name'] + f' ({svc_id})':<35} {svc_info['doc_count']:<6} {svc_info['diagram_count']:<10} {cats:<35}")

    # Generate a Mermaid topology diagram
    print("\n\n📊 Auto-generated service topology:\n")
    print("```mermaid")
    print("flowchart TB")

    # Group services by type
    gateway = []
    core = []
    security = []
    connectors = []

    for svc_id in summary["services"]:
        display = service_display_name(svc_id)
        if "wsp" in svc_id.lower():
            gateway.append((svc_id, display))
        elif "msp" in svc_id.lower():
            core.append((svc_id, display))
        elif any(k in svc_id.lower() for k in ["onesm", "tvsp", "scsp"]):
            security.append((svc_id, display))
        elif "psp" in svc_id.lower():
            connectors.append((svc_id, display))

    if gateway:
        print("    subgraph Gateway")
        for sid, sname in gateway:
            node_id = sid.replace("-", "_")
            print(f"        {node_id}[\"{sname}\"]")
        print("    end")

    if core:
        print("    subgraph Orchestration")
        for sid, sname in core:
            node_id = sid.replace("-", "_")
            print(f"        {node_id}[\"{sname}\"]")
        print("    end")

    if security:
        print("    subgraph Security")
        for sid, sname in security:
            node_id = sid.replace("-", "_")
            print(f"        {node_id}[\"{sname}\"]")
        print("    end")

    if connectors:
        print("    subgraph PSP_Connectors[\"PSP Connectors\"]")
        for sid, sname in connectors:
            node_id = sid.replace("-", "_")
            print(f"        {node_id}[\"{sname}\"]")
        print("    end")

    # Add typical connections
    for sid_g, _ in gateway:
        g_id = sid_g.replace("-", "_")
        for sid_c, _ in core:
            c_id = sid_c.replace("-", "_")
            print(f"    {g_id} --> {c_id}")
    for sid_c, _ in core:
        c_id = sid_c.replace("-", "_")
        for sid_p, _ in connectors:
            p_id = sid_p.replace("-", "_")
            print(f"    {c_id} --> {p_id}")
        for sid_s, _ in security:
            s_id = sid_s.replace("-", "_")
            print(f"    {c_id} -.-> {s_id}")

    print("```\n")

    # List key documents with diagrams
    print("📋 Key documents with Mermaid diagrams:")
    for svc_id, svc_info in summary["services"].items():
        if svc_info["key_docs"]:
            for kd in svc_info["key_docs"][:3]:
                if kd["mermaid_count"] > 0:
                    print(f"  • [{svc_info['display_name']}] {kd['title']} — {kd['path']} ({kd['mermaid_count']} diagrams)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate Mermaid diagrams from OpenWiki documentation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--query", help="Search query to find or generate diagrams")
    mode.add_argument("--overview", action="store_true", help="Generate wiki overview and topology diagram")

    parser.add_argument("--type", choices=["sequence", "flowchart", "state", "any"], default="sequence",
                        help="Diagram type: sequence, flowchart, state, or any (default: sequence)")
    parser.add_argument("--generate-only", action="store_true",
                        help="Force generation of new diagram instead of returning existing wiki diagrams")
    parser.add_argument("--service", help="Filter by service name")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    try:
        wiki_root = find_wiki_root()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.query:
        cmd_generate(args, wiki_root)
    elif args.overview:
        cmd_overview(args, wiki_root)


if __name__ == "__main__":
    main()
