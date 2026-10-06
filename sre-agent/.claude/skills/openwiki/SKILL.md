---
name: openwiki
description: Access, search, and inspect OpenWiki system architecture documentation, service dependency flows, API specifications, and business workflows. Use when the user asks about microservice architecture, component design, payment/auth workflows, trace flows, or system concepts documented in OpenWiki.
allowed-tools: Bash(python *)
---

# OpenWiki Knowledge Base & Architecture Documentation

## Overview

OpenWiki contains authoritative architectural documentation, sequence flows, integration contracts, and operational guidelines for all microservices in the platform (e.g. `openwiki-msp`, `openwiki-wsp`, `openwiki-onesm`, `openwiki-psp-connector-onecomm`, `openwiki-psp-connector-ewallet`, `openwiki-tvsp`, etc.).

During an investigation or when answering technical architecture queries:
- **Search OpenWiki** before guessing how services interact or which gateways are called.
- **Correlate with Telemetry**: Compare documented architecture/sequence flows against live Jaeger traces, Prometheus metrics, and logs to identify discrepancies or bottlenecks.

---

## Available Scripts

All scripts are located in `.claude/skills/openwiki/scripts/`.

### 1. `search_wiki.py` — Search Documentation
Search across all services for architecture guides, business workflows, and concepts matching keywords.

```bash
python .claude/skills/openwiki/scripts/search_wiki.py --query "SEARCH_QUERY" [--service SERVICE] [--type TYPE] [--limit N]

# Examples:
python .claude/skills/openwiki/scripts/search_wiki.py --query "purchase payment flow"
python .claude/skills/openwiki/scripts/search_wiki.py --query "token encryption decryption" --service openwiki-onesm
python .claude/skills/openwiki/scripts/search_wiki.py --query "card brand authorization" --type concept
```

### 2. `get_wiki_doc.py` — Read Specific Document
Read the full markdown content of a document discovered from search or referenced by path.

```bash
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service SERVICE --path RELATIVE_PATH [--max-chars N]

# Examples:
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service openwiki-psp-connector-onecomm --path workflows/purchase.md
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service openwiki-onesm --path workflows/encryption-decryption-endpoints.md
```

### 3. `list_services.py` — List Documented Services
List all microservices in the repository, their document count, and architecture categories.

```bash
python .claude/skills/openwiki/scripts/list_services.py
```

---

## Investigation Best Practices with OpenWiki

1. **Step 1 - Understand the Documented Flow**:
   When investigating an alert or issue (e.g., "Payments failing in PSP Connector"), run `search_wiki.py --query "purchase" --service openwiki-psp-connector-onecomm` to inspect the designed request validation, fraud check, and gateway delegation steps.

2. **Step 2 - Retrieve Sequence & Mermaid Diagrams**:
   Run `get_wiki_doc.py` on the matching workflow to inspect the exact Mermaid sequence diagram and endpoint routing.

3. **Step 3 - Cross-reference with Live Traces**:
   Compare the documented workflow steps with spans from `observability-jaeger` or logs from `observability-graylog` to pinpoint exactly which downstream dependency failed.
