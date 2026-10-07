#!/usr/bin/env python3
"""Common utilities for OpenWiki skill scripts.

Provides fast, dependency-free parsing, indexing, and querying for the 
OpenWiki knowledge base. Extended with:
- Tag-based search and filtering
- Mermaid diagram extraction and analysis
- Cross-service flow tracing
- Sequence diagram generation from documented workflows
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set


def find_wiki_root() -> Path:
    """Locate the open-wiki root directory across different runtime environments."""
    # 1. Explicit env var
    env_dir = os.environ.get("OPENWIKI_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir).resolve()

    # 2. Container standard mount
    container_mount = Path("/app/open-wiki")
    if container_mount.is_dir():
        return container_mount.resolve()

    # 3. Relative to this script: sre-agent/.claude/skills/openwiki/scripts -> repo root -> open-wiki
    script_relative = Path(__file__).resolve().parents[4] / "open-wiki"
    if script_relative.is_dir():
        return script_relative.resolve()

    # 4. Host fallback
    host_fallback = Path("/home/hieudq/Documents/openSRE/OpenSRE/open-wiki")
    if host_fallback.is_dir():
        return host_fallback.resolve()

    # 5. Current working directory checks
    cwd = Path.cwd()
    if (cwd / "open-wiki").is_dir():
        return (cwd / "open-wiki").resolve()
    if (cwd.parent / "open-wiki").is_dir():
        return (cwd.parent / "open-wiki").resolve()

    raise FileNotFoundError("Could not locate open-wiki directory. Set OPENWIKI_DIR or verify mount.")


def parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """Parse YAML-like frontmatter without external pyyaml dependency."""
    meta: Dict[str, Any] = {}
    body = text

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not match:
        return meta, body

    fm_text, body = match.group(1), match.group(2)
    current_key = ""
    in_array = False

    for line in fm_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" in stripped:
            # Check if it's a list item first
            if in_array and stripped.startswith("- "):
                val = stripped[2:].strip().strip("'\"")
                if current_key in meta and isinstance(meta[current_key], list):
                    meta[current_key].append(val)
                continue

            key, val = stripped.split(":", 1)
            key = key.strip()
            val = val.strip()

            # Array format [item1, item2]
            if val.startswith("[") and val.endswith("]"):
                items = [item.strip().strip("'\"") for item in val[1:-1].split(",") if item.strip()]
                meta[key] = items
                in_array = False
            # Empty value (block array start)
            elif val == "":
                current_key = key
                meta[key] = []
                in_array = True
            # Quoted string
            elif (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                meta[key] = val[1:-1]
                in_array = False
            else:
                meta[key] = val
                in_array = False
        elif in_array and stripped.startswith("- "):
            val = stripped[2:].strip().strip("'\"")
            if current_key in meta and isinstance(meta[current_key], list):
                meta[current_key].append(val)

    return meta, body


def get_service_directories(wiki_root: Path) -> List[Path]:
    """Return all valid service directories inside open-wiki."""
    dirs = []
    for entry in wiki_root.iterdir():
        if entry.is_dir() and not entry.name.startswith(".") and entry.name != "node_modules":
            # Check if directory contains markdown files
            if any(entry.glob("*.md")) or any(entry.glob("*/*.md")):
                dirs.append(entry)
    dirs.sort(key=lambda p: p.name)
    return dirs


# ─────────────────────────────────────────────────────────────────────────────
# SERVICE NAME HELPERS
# ─────────────────────────────────────────────────────────────────────────────

SERVICE_SHORT_NAMES = {
    "openwiki-msp": "MSP",
    "openwiki-wsp": "WSP",
    "openwiki-onesm": "OneSM",
    "openwiki-tvsp": "TVSP",
    "openwiki-scsp": "SCSP",
    "openwiki-psp-connector-onecomm": "PSP-Onecomm",
    "openwiki-psp-connector-onecomm-apple": "PSP-Onecomm-Apple",
    "openwiki-psp-connector-kbank": "PSP-KBank",
    "openwiki-psp-connector-ewallet": "PSP-EWallet",
    "openwiki": "Cross-Service",
}


def service_display_name(raw_name: str) -> str:
    """Human-readable service name from directory name."""
    return SERVICE_SHORT_NAMES.get(raw_name, raw_name.replace("openwiki-", "").upper())


# ─────────────────────────────────────────────────────────────────────────────
# DOCUMENT INDEXING (enhanced)
# ─────────────────────────────────────────────────────────────────────────────

def index_documents(wiki_root: Path, service_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Scan and index all markdown documents across services.
    
    Enhanced: includes Mermaid count, headings, category, and full tag list.
    """
    services = get_service_directories(wiki_root)
    docs = []

    for svc_dir in services:
        svc_name = svc_dir.name
        if service_filter and service_filter.lower() not in svc_name.lower():
            continue

        for md_file in svc_dir.rglob("*.md"):
            # Skip hidden folders or instructions if unwanted
            if any(part.startswith(".") for part in md_file.parts):
                continue

            rel_to_svc = md_file.relative_to(svc_dir).as_posix()
            try:
                content = md_file.read_text(encoding="utf-8", errors="replace")
                meta, body = parse_frontmatter(content)
            except Exception:
                continue

            title = meta.get("title")
            if not title:
                # Fallback to first heading
                h1_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
                title = h1_match.group(1).strip() if h1_match else md_file.stem.replace("-", " ").title()

            desc = meta.get("description", "")
            tags = meta.get("tags", [])
            doc_type = meta.get("type", "general")

            # Count mermaid diagrams
            mermaid_count = len(re.findall(r"```mermaid", content))

            # Extract category from relative path
            parts = Path(rel_to_svc).parts
            category = parts[0] if len(parts) > 1 else "root"

            # Extract headings
            headings = []
            for h_match in re.finditer(r"^(#{1,4})\s+(.+)$", body, re.MULTILINE):
                headings.append({
                    "level": len(h_match.group(1)),
                    "text": h_match.group(2).strip(),
                })

            docs.append({
                "service": svc_name,
                "service_display": service_display_name(svc_name),
                "path": rel_to_svc,
                "full_path": str(md_file.resolve()),
                "title": title,
                "description": desc,
                "tags": tags if isinstance(tags, list) else [tags],
                "type": doc_type,
                "category": category,
                "char_count": len(content),
                "mermaid_count": mermaid_count,
                "headings": headings,
            })

    return docs


# ─────────────────────────────────────────────────────────────────────────────
# SEARCH (enhanced with tag matching)
# ─────────────────────────────────────────────────────────────────────────────

def search_wiki(
    query: str,
    wiki_root: Path,
    service_filter: Optional[str] = None,
    doc_type: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Rank documents against search query using relevance scoring."""
    docs = index_documents(wiki_root, service_filter)
    query_terms = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 1]
    if not query_terms:
        return docs[:limit]

    scored_docs = []
    for doc in docs:
        if doc_type and doc.get("type", "").lower() != doc_type.lower():
            continue

        score = 0
        title_lower = doc["title"].lower()
        desc_lower = doc["description"].lower()
        svc_lower = doc["service"].lower()
        path_lower = doc["path"].lower()
        tags_str = " ".join(str(t).lower() for t in doc["tags"])

        for term in query_terms:
            # Exact term matching with weighting
            if term in title_lower:
                score += 15
                if re.search(rf"\b{re.escape(term)}\b", title_lower):
                    score += 10
            if term in tags_str:
                score += 12
            if term in desc_lower:
                score += 8
            if term in svc_lower:
                score += 10
            if term in path_lower:
                score += 5

        # Check full text match if score is low
        if score > 0:
            doc_copy = dict(doc)
            doc_copy["score"] = score
            scored_docs.append(doc_copy)

    # If no metadata matches, fallback to body grep for terms
    if not scored_docs and query_terms:
        for doc in docs:
            try:
                body = Path(doc["full_path"]).read_text(encoding="utf-8", errors="ignore").lower()
                body_score = sum(body.count(t) for t in query_terms)
                if body_score > 0:
                    doc_copy = dict(doc)
                    doc_copy["score"] = min(body_score, 20)
                    scored_docs.append(doc_copy)
            except Exception:
                continue

    scored_docs.sort(key=lambda d: d.get("score", 0), reverse=True)
    return scored_docs[:limit]


def search_by_tags(
    tags: List[str],
    wiki_root: Path,
    service_filter: Optional[str] = None,
    match_all: bool = False,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Find documents matching given tags.
    
    Args:
        tags: List of tag strings to match (case-insensitive)
        match_all: If True, document must contain ALL given tags; if False, ANY tag matches.
        limit: Max results
    """
    docs = index_documents(wiki_root, service_filter)
    query_tags = {t.lower().strip() for t in tags}
    results = []

    for doc in docs:
        doc_tags = {str(t).lower().strip() for t in doc.get("tags", [])}
        if match_all:
            if query_tags.issubset(doc_tags):
                results.append(doc)
        else:
            if query_tags & doc_tags:  # intersection
                doc_copy = dict(doc)
                doc_copy["matched_tags"] = sorted(list(query_tags & doc_tags))
                doc_copy["score"] = len(query_tags & doc_tags) * 10
                results.append(doc_copy)

    results.sort(key=lambda d: d.get("score", 0), reverse=True)
    return results[:limit]


def list_all_tags(wiki_root: Path, service_filter: Optional[str] = None) -> Dict[str, int]:
    """List all unique tags across the wiki with their occurrence count."""
    docs = index_documents(wiki_root, service_filter)
    tag_counts: Dict[str, int] = {}
    for doc in docs:
        for tag in doc.get("tags", []):
            tag_str = str(tag).lower().strip()
            tag_counts[tag_str] = tag_counts.get(tag_str, 0) + 1
    return dict(sorted(tag_counts.items(), key=lambda x: (-x[1], x[0])))


# ─────────────────────────────────────────────────────────────────────────────
# MERMAID DIAGRAM EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_mermaid_diagrams(content: str) -> List[Dict[str, Any]]:
    """Extract all Mermaid diagram blocks from markdown content."""
    diagrams = []
    pattern = re.compile(r"```mermaid\s*\n([\s\S]*?)```", re.MULTILINE)
    
    for idx, match in enumerate(pattern.finditer(content), 1):
        code = match.group(1).strip()
        
        # Determine diagram type
        diagram_type = "unknown"
        if code.startswith("sequenceDiagram"):
            diagram_type = "sequence"
        elif code.startswith("flowchart") or code.startswith("graph"):
            diagram_type = "flowchart"
        elif code.startswith("classDiagram"):
            diagram_type = "class"
        elif code.startswith("stateDiagram"):
            diagram_type = "state"
        elif code.startswith("erDiagram"):
            diagram_type = "er"
        elif code.startswith("gantt"):
            diagram_type = "gantt"
        
        # Extract participants for sequence diagrams
        participants = []
        if diagram_type == "sequence":
            for p_match in re.finditer(r"participant\s+(\S+)(?:\s+as\s+(.+))?", code):
                participants.append({
                    "id": p_match.group(1),
                    "alias": p_match.group(2).strip() if p_match.group(2) else p_match.group(1),
                })
        
        # Extract nodes for flowcharts
        nodes = []
        if diagram_type == "flowchart":
            for n_match in re.finditer(r"(\w+)\[([^\]]+)\]", code):
                nodes.append({
                    "id": n_match.group(1),
                    "label": n_match.group(2).strip(),
                })
        
        # Try to find a title from the nearest heading above the match
        title = f"Diagram #{idx}"
        preceding_text = content[:match.start()]
        heading_matches = list(re.finditer(r"^#{1,4}\s+(.+)$", preceding_text, re.MULTILINE))
        if heading_matches:
            title = heading_matches[-1].group(1).strip()
        
        diagrams.append({
            "index": idx,
            "type": diagram_type,
            "title": title,
            "code": code,
            "participants": participants,
            "nodes": nodes,
            "char_count": len(code),
        })
    
    return diagrams


def find_diagrams_by_topic(
    query: str,
    wiki_root: Path,
    service_filter: Optional[str] = None,
    diagram_type: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Search for Mermaid diagrams across all wiki documents by topic.
    
    Returns diagrams with their source document context.
    """
    docs = index_documents(wiki_root, service_filter)
    query_terms = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 1]
    results = []
    
    for doc in docs:
        if doc["mermaid_count"] == 0:
            continue
        
        try:
            content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        
        diagrams = extract_mermaid_diagrams(content)
        
        for diag in diagrams:
            if diagram_type and diag["type"] != diagram_type:
                continue
            
            score = 0
            diag_text = (diag["code"] + " " + diag["title"]).lower()
            doc_title = doc["title"].lower()
            tags_str = " ".join(str(t).lower() for t in doc.get("tags", []))
            
            for term in query_terms:
                if term in diag_text:
                    score += 10
                if term in doc_title:
                    score += 8
                if term in tags_str:
                    score += 6
                # Check participant/node names
                for p in diag.get("participants", []):
                    if term in p["alias"].lower() or term in p["id"].lower():
                        score += 12
                for n in diag.get("nodes", []):
                    if term in n["label"].lower() or term in n["id"].lower():
                        score += 12
            
            if score > 0:
                results.append({
                    "diagram": diag,
                    "source_doc": {
                        "service": doc["service"],
                        "service_display": doc["service_display"],
                        "path": doc["path"],
                        "title": doc["title"],
                        "tags": doc["tags"],
                    },
                    "score": score,
                })
    
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


# ─────────────────────────────────────────────────────────────────────────────
# FLOW ANALYSIS — Extract and explain service interaction flows
# ─────────────────────────────────────────────────────────────────────────────

def extract_flow_steps(content: str) -> List[Dict[str, Any]]:
    """Extract step-by-step flow descriptions from document content.
    
    Looks for numbered steps, sequence diagram messages, and structured flow descriptions.
    """
    flows = []
    
    # 1. Extract from sequence diagrams (arrows like A->>B: message)
    seq_pattern = re.compile(
        r"(\w+)\s*(->>|-->>|->|-->)\s*(\w+)\s*:\s*(.+)", re.MULTILINE
    )
    for match in seq_pattern.finditer(content):
        flows.append({
            "from": match.group(1),
            "to": match.group(3),
            "message": match.group(4).strip(),
            "type": "async" if ">>" in match.group(2) else "sync",
            "is_response": "--" in match.group(2),
        })
    
    return flows


def trace_service_flow(
    from_service: str,
    to_service: str,
    wiki_root: Path,
    flow_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Trace documented interaction flows between two services.
    
    Args:
        from_service: Source service keyword (e.g., "wsp", "msp")
        to_service: Target service keyword (e.g., "msp", "psp")
        flow_type: Optional flow type filter (e.g., "payment", "refund", "tokenization")
    
    Returns:
        Dict with matched flows, diagrams, and explanatory context.
    """
    from_lower = from_service.lower()
    to_lower = to_service.lower()
    flow_kw = flow_type.lower() if flow_type else None
    
    docs = index_documents(wiki_root)
    results = {
        "from_service": from_service,
        "to_service": to_service,
        "flow_type": flow_type,
        "matching_docs": [],
        "relevant_diagrams": [],
        "flow_steps": [],
    }
    
    for doc in docs:
        content = None
        try:
            content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        
        content_lower = content.lower()
        tags_lower = [str(t).lower() for t in doc.get("tags", [])]
        
        # Check if both services are mentioned
        from_mentioned = from_lower in content_lower or from_lower in " ".join(tags_lower)
        to_mentioned = to_lower in content_lower or to_lower in " ".join(tags_lower)
        
        if not (from_mentioned and to_mentioned):
            continue
        
        # Additional filter for flow type
        if flow_kw and flow_kw not in content_lower and flow_kw not in " ".join(tags_lower):
            continue
        
        results["matching_docs"].append({
            "service": doc["service"],
            "service_display": doc["service_display"],
            "path": doc["path"],
            "title": doc["title"],
            "tags": doc["tags"],
            "type": doc["type"],
        })
        
        # Extract diagrams from this doc
        diagrams = extract_mermaid_diagrams(content)
        for diag in diagrams:
            diag_lower = diag["code"].lower()
            if from_lower in diag_lower and to_lower in diag_lower:
                if flow_kw is None or flow_kw in diag_lower or flow_kw in diag["title"].lower():
                    results["relevant_diagrams"].append({
                        "title": diag["title"],
                        "type": diag["type"],
                        "code": diag["code"],
                        "source": f"{doc['service']}/{doc['path']}",
                    })
        
        # Extract step-by-step flows
        steps = extract_flow_steps(content)
        relevant_steps = []
        for step in steps:
            step_from = step["from"].lower()
            step_to = step["to"].lower()
            if (from_lower in step_from or from_lower in step_to) and \
               (to_lower in step_from or to_lower in step_to):
                relevant_steps.append(step)
        
        if relevant_steps:
            results["flow_steps"].extend(relevant_steps)
    
    return results


# ─────────────────────────────────────────────────────────────────────────────
# DIAGRAM GENERATION (Sequence, Flowchart, State Machine)
# ─────────────────────────────────────────────────────────────────────────────

def generate_sequence_diagram(
    flow_steps: List[Dict[str, Any]],
    title: Optional[str] = None,
    include_notes: bool = True,
) -> str:
    """Generate a valid Mermaid sequence diagram from extracted flow steps.
    
    Args:
        flow_steps: List of flow step dicts with from/to/message/type/is_response
        title: Optional diagram title
        include_notes: Whether to include explanatory notes
    
    Returns:
        Valid Mermaid sequence diagram code
    """
    if not flow_steps:
        return ""
    
    # Collect unique participants
    participants_order = []
    seen = set()
    for step in flow_steps:
        for actor in [step["from"], step["to"]]:
            if actor not in seen:
                participants_order.append(actor)
                seen.add(actor)
    
    lines = ["sequenceDiagram"]
    if title:
        lines.append(f"    title {title}")
    lines.append("    autonumber")
    
    # Add participants
    for p in participants_order:
        display = SERVICE_SHORT_NAMES.get(f"openwiki-{p.lower()}", p)
        if display != p:
            lines.append(f"    participant {p} as {display}")
        else:
            lines.append(f"    participant {p}")
    
    lines.append("")
    
    # Add messages
    for step in flow_steps:
        arrow = "-->>" if step.get("is_response") else "->>"
        msg = step["message"].replace(";", "#59;")
        msg = re.sub(r"[{}]", "", msg)
        lines.append(f"    {step['from']}{arrow}{step['to']}: {msg}")
    
    return "\n".join(lines)


def generate_flowchart(
    flow_steps: List[Dict[str, Any]],
    orientation: str = "TD",
    title: Optional[str] = None,
) -> str:
    """Generate a Mermaid flowchart from interaction flow steps.
    
    Args:
        flow_steps: List of flow step dicts with from/to/message/type/is_response
        orientation: "TD" (top-down) or "LR" (left-to-right)
        title: Optional title
    
    Returns:
        Valid Mermaid flowchart code
    """
    if not flow_steps:
        return ""
    
    lines = [f"flowchart {orientation}"]
    if title:
        lines.append(f"    %% Title: {title}")
    
    # Collect unique nodes with clean IDs and friendly labels
    actors = set()
    for step in flow_steps:
        actors.add(step["from"])
        actors.add(step["to"])
    
    node_id_map = {}
    for actor in sorted(actors):
        clean_id = re.sub(r"[^a-zA-Z0-9_]", "_", actor)
        display = SERVICE_SHORT_NAMES.get(f"openwiki-{actor.lower()}", actor)
        node_id_map[actor] = clean_id
        if display != clean_id:
            lines.append(f'    {clean_id}["{display}"]')
        else:
            lines.append(f'    {clean_id}["{actor}"]')
    
    lines.append("")
    
    seen_edges = set()
    for step in flow_steps:
        u = node_id_map.get(step["from"], step["from"])
        v = node_id_map.get(step["to"], step["to"])
        msg = step["message"].replace('"', "'").replace(";", "#59;")
        if len(msg) > 60:
            msg = msg[:57] + "..."
        
        arrow = "-.->|" if step.get("is_response") else "-->|"
        edge_key = (u, v, msg)
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            lines.append(f"    {u} {arrow}{msg}| {v}")
    
    return "\n".join(lines)


def extract_state_transitions(content: str) -> List[Dict[str, Any]]:
    """Extract state machine transitions from document content.
    
    Matches patterns like:
    - stateA --> stateB: event/action
    - [*] --> created
    """
    transitions = []
    pattern = re.compile(
        r"([*]|\w+)\s*-->\s*([*]|\w+)(?:\s*:\s*([^\n]+))?", re.MULTILINE
    )
    for match in pattern.finditer(content):
        transitions.append({
            "from_state": match.group(1),
            "to_state": match.group(2),
            "description": (match.group(3) or "").strip(),
        })
    return transitions


def generate_state_diagram(
    transitions: List[Dict[str, Any]],
    title: Optional[str] = None,
) -> str:
    """Generate a Mermaid stateDiagram-v2 from transitions."""
    if not transitions:
        return ""
    
    lines = ["stateDiagram-v2"]
    if title:
        lines.append(f"    %% Title: {title}")
    
    seen = set()
    for tr in transitions:
        f = tr["from_state"]
        t = tr["to_state"]
        desc = tr.get("description", "")
        key = (f, t, desc)
        if key in seen:
            continue
        seen.add(key)
        if desc:
            clean_desc = desc.replace(";", "#59;")
            lines.append(f"    {f} --> {t}: {clean_desc}")
        else:
            lines.append(f"    {f} --> {t}")
    return "\n".join(lines)


def build_flow_diagram_from_docs(
    query: str,
    wiki_root: Path,
    diagram_type: str = "sequence",
    service_filter: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a Mermaid diagram from wiki documentation matching a query.
    
    Searches relevant docs, extracts flow steps or states, and composes a diagram.
    Supports diagram types: sequence, flowchart, state, any.
    
    Args:
        query: Natural language query (e.g., "refund flow WSP to MSP")
        wiki_root: Path to open-wiki directory
        diagram_type: "sequence", "flowchart", "state", or "any"
        service_filter: Optional service to focus on
    
    Returns:
        Dict with generated diagram code, existing diagrams, source documents, and metadata.
    """
    results = search_wiki(query, wiki_root, service_filter=service_filter, limit=5)
    
    all_steps = []
    all_states = []
    source_docs = []
    existing_diagrams = []
    query_terms = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 2]
    
    for doc in results:
        try:
            content = Path(doc["full_path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        
        source_docs.append({
            "service": doc["service"],
            "path": doc["path"],
            "title": doc["title"],
        })
        
        # Check for existing diagrams
        diagrams = extract_mermaid_diagrams(content)
        for diag in diagrams:
            dtype = diag["type"]
            type_match = (
                diagram_type in ("any", "all")
                or (diagram_type == "sequence" and dtype == "sequence")
                or (diagram_type == "flowchart" and dtype in ("flowchart", "graph"))
                or (diagram_type == "state" and dtype == "state")
            )
            if not type_match:
                continue
            
            # Check content relevance
            diag_str = (diag["code"] + " " + diag["title"]).lower()
            if any(term in diag_str for term in query_terms):
                existing_diagrams.append(diag)
        
        # Extract flow steps & state transitions
        steps = extract_flow_steps(content)
        # Filter steps relevant to query terms if possible
        rel_steps = [
            s for s in steps
            if any(term in s["from"].lower() or term in s["to"].lower() or term in s["message"].lower() for term in query_terms)
        ]
        all_steps.extend(rel_steps if rel_steps else steps)
        
        if diagram_type == "state":
            all_states.extend(extract_state_transitions(content))
    
    result = {
        "query": query,
        "diagram_type": diagram_type,
        "source_documents": source_docs,
        "existing_diagrams": existing_diagrams,
        "generated_diagram": None,
        "flow_steps_count": len(all_steps),
    }
    
    if existing_diagrams:
        result["recommendation"] = f"Found {len(existing_diagrams)} existing {diagram_type} diagram(s) in documentation. Authoritative reference."
    
    title_guess = query.replace('"', '').replace("'", "")[:60]
    
    if diagram_type == "sequence" and all_steps:
        diag_code = generate_sequence_diagram(all_steps, title=title_guess)
        if diag_code:
            result["generated_diagram"] = diag_code
    elif diagram_type == "flowchart" and all_steps:
        diag_code = generate_flowchart(all_steps, orientation="TD", title=title_guess)
        if diag_code:
            result["generated_diagram"] = diag_code
    elif diagram_type == "state" and all_states:
        diag_code = generate_state_diagram(all_states, title=title_guess)
        if diag_code:
            result["generated_diagram"] = diag_code
    
    return result


# ─────────────────────────────────────────────────────────────────────────────
# CONTENT ANALYSIS — Deep reading and summarization helpers
# ─────────────────────────────────────────────────────────────────────────────

def read_doc_content(
    wiki_root: Path,
    service: str,
    doc_path: str,
    max_chars: int = 20000,
) -> Dict[str, Any]:
    """Read full document content with structured metadata and diagram extraction.
    
    Returns a rich dict with frontmatter, body, diagrams, headings, and flow steps.
    """
    full_path = wiki_root / service / doc_path
    if not full_path.is_file():
        return {"error": f"Document not found: {service}/{doc_path}"}
    
    content = full_path.read_text(encoding="utf-8", errors="replace")
    meta, body = parse_frontmatter(content)
    diagrams = extract_mermaid_diagrams(content)
    flow_steps = extract_flow_steps(content)
    
    # Extract headings
    headings = []
    for h_match in re.finditer(r"^(#{1,4})\s+(.+)$", body, re.MULTILINE):
        headings.append({
            "level": len(h_match.group(1)),
            "text": h_match.group(2).strip(),
        })
    
    # Truncate body if needed
    truncated = False
    display_body = body
    if len(body) > max_chars:
        display_body = body[:max_chars]
        truncated = True
    
    return {
        "service": service,
        "path": doc_path,
        "title": meta.get("title", headings[0]["text"] if headings else doc_path),
        "description": meta.get("description", ""),
        "type": meta.get("type", "general"),
        "tags": meta.get("tags", []),
        "headings": headings,
        "diagrams": diagrams,
        "flow_steps": flow_steps,
        "content": display_body,
        "truncated": truncated,
        "total_chars": len(body),
        "diagram_count": len(diagrams),
        "flow_step_count": len(flow_steps),
    }


def get_wiki_summary(wiki_root: Path) -> Dict[str, Any]:
    """Get a comprehensive summary of the entire wiki for context loading."""
    docs = index_documents(wiki_root)
    
    services = {}
    total_diagrams = 0
    all_tags = set()
    all_categories = set()
    
    for doc in docs:
        svc = doc["service"]
        if svc not in services:
            services[svc] = {
                "display_name": doc["service_display"],
                "doc_count": 0,
                "diagram_count": 0,
                "categories": set(),
                "tags": set(),
                "key_docs": [],
            }
        
        services[svc]["doc_count"] += 1
        services[svc]["diagram_count"] += doc.get("mermaid_count", 0)
        services[svc]["categories"].add(doc.get("category", "root"))
        for tag in doc.get("tags", []):
            services[svc]["tags"].add(str(tag).lower())
            all_tags.add(str(tag).lower())
        all_categories.add(doc.get("category", "root"))
        total_diagrams += doc.get("mermaid_count", 0)
        
        # Include important docs
        if doc.get("category") in ("workflows", "architecture") or doc.get("mermaid_count", 0) > 0:
            services[svc]["key_docs"].append({
                "path": doc["path"],
                "title": doc["title"],
                "type": doc["type"],
                "mermaid_count": doc.get("mermaid_count", 0),
            })
    
    # Convert sets to lists for JSON serialization
    for svc in services.values():
        svc["categories"] = sorted(list(svc["categories"]))
        svc["tags"] = sorted(list(svc["tags"]))
    
    return {
        "total_documents": len(docs),
        "total_services": len(services),
        "total_diagrams": total_diagrams,
        "all_tags": sorted(list(all_tags)),
        "all_categories": sorted(list(all_categories)),
        "services": services,
    }
