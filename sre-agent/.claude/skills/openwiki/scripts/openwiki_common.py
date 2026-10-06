#!/usr/bin/env python3
"""Common utilities for OpenWiki skill scripts.

Provides fast, dependency-free parsing, indexing, and querying for the 
OpenWiki knowledge base.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


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
    for line in fm_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip()

            # Array format [item1, item2]
            if val.startswith("[") and val.endswith("]"):
                items = [item.strip().strip("'\"") for item in val[1:-1].split(",") if item.strip()]
                meta[key] = items
            # Quoted string
            elif (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                meta[key] = val[1:-1]
            else:
                meta[key] = val

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


def index_documents(wiki_root: Path, service_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Scan and index all markdown documents across services."""
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

            docs.append({
                "service": svc_name,
                "path": rel_to_svc,
                "full_path": str(md_file.resolve()),
                "title": title,
                "description": desc,
                "tags": tags if isinstance(tags, list) else [tags],
                "type": doc_type,
                "char_count": len(content),
            })

    return docs


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
