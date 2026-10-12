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


# ─────────────────────────────────────────────────────────────────────────────
# SERVICE AND DATABASE DISCOVERY
# ─────────────────────────────────────────────────────────────────────────────

SERVICE_SHORT_NAMES = {
    "openwiki-msp": "MSP (Merchant Core)",
    "openwiki-wsp": "WSP (Gateway)",
    "openwiki-onesm": "OneSM (Crypto & Key Management)",
    "openwiki-tvsp": "TVSP (Token Vault)",
    "openwiki-scsp": "SCSP (Subkey Store)",
    "openwiki-psp-connector-onecomm": "PSP Connector: Onecomm / NAPAS",
    "openwiki-psp-connector-onecomm-apple": "PSP Connector: Apple Pay",
    "openwiki-psp-connector-kbank": "PSP Connector: KBank BNPL",
    "openwiki-psp-connector-ewallet": "PSP Connector: E-Wallet",
    "openwiki": "Cross-Service Architecture",
    "db-prod-112": "Database: Oracle 112 (MSP / Payment2 / OneCredit)",
    "db-prod-114": "Database: Oracle 114 (OnePortal / OneFin / OneCDR)",
    "db-prod-118": "Database: Oracle 118 (Dispute / OneReport / OneMon)",
    "db-prod-124": "Database: Oracle 124 (PayCollect / OneBill)",
}


def service_display_name(raw_name: str) -> str:
    """Human-readable service name from directory name."""
    return SERVICE_SHORT_NAMES.get(raw_name, raw_name.replace("openwiki-", "").replace("db-", "").upper())


def get_service_directories(wiki_root: Path) -> List[Dict[str, Any]]:
    """Return all valid service and database directories inside open-wiki.
    
    Returns list of dicts: {'path': Path, 'id': str, 'name': str, 'type': str}
    """
    services: List[Dict[str, Any]] = []

    # 1. Microservices in service/
    svc_dir = wiki_root / "service"
    if svc_dir.is_dir():
        for sub in sorted(svc_dir.iterdir()):
            if sub.is_dir() and not sub.name.startswith("."):
                services.append({
                    "path": sub,
                    "id": sub.name,
                    "name": service_display_name(sub.name),
                    "type": "microservice",
                })

    # 2. Database schemas in database/
    db_dir = wiki_root / "database"
    if db_dir.is_dir():
        for db in sorted(db_dir.iterdir()):
            if db.is_dir() and not db.name.startswith("."):
                ow = db / "openwiki"
                target = ow if ow.is_dir() else db
                db_id = f"db-{db.name.replace('_', '-')}"
                services.append({
                    "path": target,
                    "id": db_id,
                    "name": service_display_name(db_id),
                    "type": "database",
                })

    # 3. Direct children fallback (for flat wiki structures)
    for entry in sorted(wiki_root.iterdir()):
        if entry.is_dir() and entry.name not in ("service", "database", "node_modules") and not entry.name.startswith("."):
            if any(entry.glob("*.md")) or any(entry.glob("*/*.md")):
                services.append({
                    "path": entry,
                    "id": entry.name,
                    "name": service_display_name(entry.name),
                    "type": "microservice",
                })

    return services


def resolve_doc_path(wiki_root: Path, service: Optional[str] = None, doc_path: Optional[str] = None) -> Optional[Path]:
    """Resolve a document path across microservices and database directories.
    
    Supports:
    - Absolute or wiki_root-relative paths
    - Service + relative path (e.g., service='openwiki-msp', path='workflows/purchase.md')
    - Database + relative path (e.g., service='db-prod-112', path='schemas/msp-schema.md')
    - Direct filenames or paths with auto-discovery
    """
    if not doc_path and not service:
        return None

    if not doc_path and service:
        doc_path = service
        service = None

    # 1. If doc_path is absolute and exists
    p = Path(doc_path)
    if p.is_file():
        return p

    # 2. Relative directly to wiki_root
    cand = wiki_root / doc_path
    if cand.is_file():
        return cand

    # 3. If service is provided
    if service:
        # Direct wiki_root / service / doc_path
        cand = wiki_root / service / doc_path
        if cand.is_file():
            return cand
        # Under service/
        cand = wiki_root / "service" / service / doc_path
        if cand.is_file():
            return cand
        # Under database/
        if service.startswith("db-"):
            db_folder = service.replace("db-", "").replace("-", "_")
            c1 = wiki_root / "database" / db_folder / "openwiki" / doc_path
            if c1.is_file():
                return c1
            c2 = wiki_root / "database" / db_folder / doc_path
            if c2.is_file():
                return c2
        # Search all discovered service directories
        for s in get_service_directories(wiki_root):
            if match_service_filter(service, s["id"]):
                c = s["path"] / doc_path
                if c.is_file():
                    return c

    # 4. Search doc_path across all service directories
    for s in get_service_directories(wiki_root):
        c = s["path"] / doc_path
        if c.is_file():
            return c
        base = Path(doc_path).name
        matches = list(s["path"].rglob(base))
        if matches:
            return matches[0]

    return None


def match_service_filter(filter_str: Optional[str], service_id: str) -> bool:
    """Check if service_id matches filter_str with aliases."""
    if not filter_str:
        return True
    f = filter_str.lower().strip()
    s = service_id.lower()
    if f in s:
        return True
    # Aliases
    aliases = {
        "apple": ["openwiki-psp-connector-onecomm-apple", "openwiki-wsp"],
        "applepay": ["openwiki-psp-connector-onecomm-apple", "openwiki-wsp"],
        "onecomm": ["openwiki-psp-connector-onecomm", "openwiki-psp-connector-onecomm-apple"],
        "napas": ["openwiki-psp-connector-onecomm"],
        "msp": ["openwiki-msp", "db-prod-112"],
        "wsp": ["openwiki-wsp"],
        "onesm": ["openwiki-onesm"],
        "tvsp": ["openwiki-tvsp"],
        "scsp": ["openwiki-scsp"],
        "kbank": ["openwiki-psp-connector-kbank"],
        "ewallet": ["openwiki-psp-connector-ewallet"],
        "112": ["db-prod-112", "openwiki-msp"],
        "114": ["db-prod-114"],
        "118": ["db-prod-118"],
        "124": ["db-prod-124"],
        "db": ["db-prod-112", "db-prod-114", "db-prod-118", "db-prod-124"],
        "database": ["db-prod-112", "db-prod-114", "db-prod-118", "db-prod-124"],
    }
    return service_id in aliases.get(f, [])


# ─────────────────────────────────────────────────────────────────────────────
# ENTITY EXTRACTION HELPERS (APIs, DB Tables, Procedures, Partners)
# ─────────────────────────────────────────────────────────────────────────────

def extract_api_endpoints(content: str) -> List[Dict[str, str]]:
    """Extract API endpoints, methods, and routes from content and sequence diagrams."""
    endpoints = []
    seen = set()

    # Pattern 1: HTTP method + path (e.g. POST /applepay-payments, PUT /invoices/{id})
    for m in re.finditer(r"\b(GET|POST|PUT|DELETE|PATCH)\s+([/a-zA-Z0-9_\-\{\}:]+)", content):
        method, path = m.group(1), m.group(2)
        if (path.startswith("/") or "/" in path or "applepay" in path or "invoice" in path or "payment" in path) and len(path) > 2:
            key = (method, path)
            if key not in seen:
                seen.add(key)
                endpoints.append({"method": method, "path": path, "source": "http_route"})

    # Pattern 2: Sequence diagram API calls (e.g. C->>W: POST applepay-payments)
    for m in re.finditer(r"(\w+)\s*->>\s*(\w+)\s*:\s*(GET|POST|PUT|DELETE|PATCH)\s+([/a-zA-Z0-9_\-\{\}:]+)", content):
        caller, receiver, method, path = m.group(1), m.group(2), m.group(3), m.group(4)
        key = (method, path)
        if key not in seen:
            seen.add(key)
            endpoints.append({
                "method": method,
                "path": path,
                "caller": caller,
                "receiver": receiver,
                "source": "sequence_diagram"
            })

    return endpoints


def extract_db_entities(content: str) -> Dict[str, List[str]]:
    """Extract Oracle tables (TB_*), packages (PKG_*), and schema references."""
    tables = set(re.findall(r"\b(TB_[A-Z0-9_]+)\b", content))
    packages = set(re.findall(r"\b(PKG_[A-Z0-9_]+(?:\.[A-Za-z0-9_]+)?)\b", content))
    schemas = set(re.findall(r"\b(MSP|ONECREDIT|PAYMENT2|PSP_CONNECTOR|ONECRYPTO|ONEFRAUD|ONEMON|ONEBILL|PAYCOLLECT)\.[A-Z0-9_]+\b", content))

    return {
        "tables": sorted(list(tables)),
        "packages": sorted(list(packages)),
        "schemas": sorted(list(schemas)),
    }


def extract_partner_info(content: str) -> List[str]:
    """Extract partner mentions, PSPs, and gateways."""
    partners = []
    candidates = [
        "Apple Pay", "Apple", "NAPAS", "Onecomm", "ONECREDIT", "BIDV", "Vietcombank",
        "VCB", "VietinBank", "MSB", "KBank", "MoMo", "ZaloPay", "ShopeePay",
        "CyberSource", "Visa", "Mastercard", "JCB", "Amex", "UPOS", "OceanBank",
    ]
    for c in candidates:
        if re.search(rf"\b{re.escape(c)}\b", content, re.IGNORECASE):
            if c not in partners:
                partners.append(c)
    return partners


# Bilingual intent keyword mapping (Vietnamese to English architectural terms)
BILINGUAL_KEYWORD_MAP = {
    "thanh toan": ["payment", "purchase", "checkout", "tb_payment"],
    "mua hang": ["purchase", "payment"],
    "hoan tien": ["refund", "tb_refund"],
    "huy": ["void", "cancel", "tb_void"],
    "luu the": ["token", "tokenization", "vault", "tb_token"],
    "the": ["card", "instrument", "tb_instrument"],
    "tra gop": ["installment", "ita", "tb_installment"],
    "doi tac": ["partner", "psp", "gateway", "acquirer", "bank"],
    "ngan hang": ["bank", "acquirer", "napas", "bidv", "vcb"],
    "bang": ["table", "schema", "tb_"],
    "co so du lieu": ["database", "schema", "oracle"],
    "goi": ["call", "request", "post", "put"],
    "xac thuc": ["authentication", "signature", "hmac", "crypto"],
}


def expand_query_terms(query: str) -> List[str]:
    """Extract and expand query terms including Vietnamese keyword mappings."""
    import unicodedata
    def strip_accents(s: str) -> str:
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    terms = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 1]
    norm_query = strip_accents(query.lower())

    for vi_key, expansions in BILINGUAL_KEYWORD_MAP.items():
        if vi_key in norm_query:
            terms.extend(expansions)

    # De-duplicate while preserving order
    seen = set()
    result = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# DOCUMENT INDEXING (enhanced)
# ─────────────────────────────────────────────────────────────────────────────

def index_documents(wiki_root: Path, service_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Scan and index all markdown documents across services and databases."""
    services = get_service_directories(wiki_root)
    docs = []

    for svc in services:
        svc_dir = svc["path"]
        svc_id = svc["id"]
        svc_type = svc["type"]
        svc_display = svc["name"]

        if service_filter and not match_service_filter(service_filter, svc_id):
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

            # Extract entities
            apis = extract_api_endpoints(content)
            db_entities = extract_db_entities(content)
            partners = extract_partner_info(content)

            docs.append({
                "service": svc_id,
                "service_display": svc_display,
                "service_type": svc_type,
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
                "apis": apis,
                "db_tables": db_entities["tables"],
                "db_packages": db_entities["packages"],
                "partners": partners,
            })

    return docs


# ─────────────────────────────────────────────────────────────────────────────
# SEARCH (enhanced with tag matching and entity scoring)
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
    query_terms = expand_query_terms(query)
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
        apis_str = " ".join(f"{a['method']} {a['path']}".lower() for a in doc.get("apis", []))
        tables_str = " ".join(t.lower() for t in doc.get("db_tables", []))
        packages_str = " ".join(p.lower() for p in doc.get("db_packages", []))
        partners_str = " ".join(p.lower() for p in doc.get("partners", []))

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
            if term in apis_str:
                score += 18
            if term in tables_str or term in packages_str:
                score += 18
            if term in partners_str:
                score += 12

        # Check full text match if score is low or for body context
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
        "apis": [],
        "db_tables": [],
        "db_packages": [],
        "partners": [],
    }
    
    seen_apis = set()
    seen_tables = set()
    seen_packages = set()
    seen_partners = set()

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
        
        # Extract APIs from this doc
        doc_apis = doc.get("apis") or extract_api_endpoints(content)
        for api in doc_apis:
            key = (api.get("method"), api.get("path"))
            if key not in seen_apis:
                seen_apis.add(key)
                api_entry = dict(api)
                api_entry["service"] = doc["service"]
                api_entry["doc_title"] = doc["title"]
                results["apis"].append(api_entry)

        # Extract DB entities
        seen_tables.update(doc.get("db_tables", []))
        seen_packages.update(doc.get("db_packages", []))

        # Extract partners
        seen_partners.update(doc.get("partners", []))

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

    results["db_tables"] = sorted(list(seen_tables))
    results["db_packages"] = sorted(list(seen_packages))
    results["partners"] = sorted(list(seen_partners))
    return results


def query_system_flow(
    topic: str,
    wiki_root: Path,
    service_filter: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Comprehensive end-to-end flow extraction across services, APIs, databases, and partners.
    
    Extracts:
    - Relevant documents
    - APIs invoked (HTTP method, path, caller/receiver, doc source)
    - Database tables (TB_*) and packages (PKG_*)
    - External partners / acquirers (Apple, NAPAS, PSP, Banks)
    - Architecture & Sequence diagrams
    - Interaction flow steps
    """
    matched_docs = search_wiki(topic, wiki_root, service_filter=service_filter, limit=limit)
    
    aggregated_apis: List[Dict[str, Any]] = []
    seen_apis = set()
    aggregated_tables = set()
    aggregated_packages = set()
    aggregated_partners = set()
    aggregated_diagrams: List[Dict[str, Any]] = []
    aggregated_steps: List[Dict[str, Any]] = []
    
    topic_terms = expand_query_terms(topic)

    for doc in matched_docs:
        full_p = Path(doc["full_path"])
        try:
            content = full_p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        
        # 1. APIs
        doc_apis = doc.get("apis") or extract_api_endpoints(content)
        for api in doc_apis:
            key = (api.get("method"), api.get("path"))
            if key not in seen_apis:
                seen_apis.add(key)
                api_entry = dict(api)
                api_entry["service"] = doc["service"]
                api_entry["doc_title"] = doc["title"]
                api_entry["doc_path"] = f"{doc['service']}/{doc['path']}"
                aggregated_apis.append(api_entry)
        
        # 2. DB entities
        doc_tables = doc.get("db_tables") or []
        doc_packages = doc.get("db_packages") or []
        if not doc_tables and not doc_packages:
            db_ent = extract_db_entities(content)
            doc_tables = db_ent["tables"]
            doc_packages = db_ent["packages"]
        
        aggregated_tables.update(doc_tables)
        aggregated_packages.update(doc_packages)
        
        # 3. Partners
        doc_partners = doc.get("partners") or extract_partner_info(content)
        aggregated_partners.update(doc_partners)
        
        # 4. Diagrams
        diagrams = extract_mermaid_diagrams(content)
        for d in diagrams:
            diag_str = (d["code"] + " " + d["title"]).lower()
            if any(t in diag_str for t in topic_terms) or len(topic_terms) == 0:
                d_copy = dict(d)
                d_copy["source"] = f"{doc['service']}/{doc['path']}"
                d_copy["source_title"] = doc["title"]
                aggregated_diagrams.append(d_copy)
        
        # 5. Flow steps
        steps = extract_flow_steps(content)
        for step in steps:
            step_str = f"{step['from']} {step['to']} {step['message']}".lower()
            if any(t in step_str for t in topic_terms):
                aggregated_steps.append(step)

    # Generated sequence diagram if steps exist and no pre-existing diagram
    generated_diag = None
    if not aggregated_diagrams and aggregated_steps:
        generated_diag = generate_sequence_diagram(aggregated_steps, title=f"Flow: {topic}")

    return {
        "topic": topic,
        "matched_docs": matched_docs,
        "apis": aggregated_apis,
        "db_tables": sorted(list(aggregated_tables)),
        "db_packages": sorted(list(aggregated_packages)),
        "partners": sorted(list(aggregated_partners)),
        "diagrams": aggregated_diagrams,
        "flow_steps": aggregated_steps,
        "generated_diagram": generated_diag,
    }


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
    
    Returns a rich dict with frontmatter, body, diagrams, headings, flow steps, APIs, and DB entities.
    """
    full_path = resolve_doc_path(wiki_root, service, doc_path)
    if not full_path or not full_path.is_file():
        return {"error": f"Document not found: {service}/{doc_path}"}
    
    content = full_path.read_text(encoding="utf-8", errors="replace")
    meta, body = parse_frontmatter(content)
    diagrams = extract_mermaid_diagrams(content)
    flow_steps = extract_flow_steps(content)
    apis = extract_api_endpoints(content)
    db_ent = extract_db_entities(content)
    partners = extract_partner_info(content)
    
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
        "full_path": str(full_path.resolve()),
        "title": meta.get("title", headings[0]["text"] if headings else doc_path),
        "description": meta.get("description", ""),
        "type": meta.get("type", "general"),
        "tags": meta.get("tags", []),
        "headings": headings,
        "diagrams": diagrams,
        "flow_steps": flow_steps,
        "apis": apis,
        "db_tables": db_ent["tables"],
        "db_packages": db_ent["packages"],
        "partners": partners,
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
