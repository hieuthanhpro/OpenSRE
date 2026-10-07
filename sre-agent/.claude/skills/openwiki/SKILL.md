---
name: openwiki
description: "Access, search, query, and visualize OpenWiki system architecture documentation. Capabilities: (1) Search by keyword or tags, (2) Trace service interaction flows (e.g., WSP→MSP payment), (3) Generate and find Mermaid diagrams (sequence, flowchart, state), (4) Explain business workflows (payment, refund, tokenization, Apple Pay, 3DS), (5) Deep-read documents with structure analysis. Use when user asks about microservice architecture, payment/auth/refund flows, component design, system topology, service dependencies, or requests a diagram."
allowed-tools: Bash(python *)
---

# OpenWiki Knowledge Base & Architecture Documentation

## Overview

OpenWiki contains authoritative architectural documentation, sequence flows, integration contracts, and operational guidelines for all microservices in the OnePay payment platform:

| Service | Directory | Description |
|---|---|---|
| WSP | `openwiki-wsp` | Merchant-facing API gateway, request normalization, routing |
| MSP | `openwiki-msp` | Invoice, payment, refund, void, QR, fraud orchestration |
| OneSM | `openwiki-onesm` | Centralized key management, AES/RSA/HMAC crypto |
| TVSP | `openwiki-tvsp` | Payment instrument storage, tokenization, token lifecycle |
| SCSP | `openwiki-scsp` | Key/subkey store on Postgres, Argon2id auth, per-path policies |
| PSP Connector: Onecomm | `openwiki-psp-connector-onecomm` | Standard card and NAPAS flows via Onecomm gateway |
| PSP Connector: Apple | `openwiki-psp-connector-onecomm-apple` | Apple Pay PSP connector |
| PSP Connector: KBank | `openwiki-psp-connector-kbank` | KBank BNPL/account-payment integration |
| PSP Connector: EWallet | `openwiki-psp-connector-ewallet` | E-wallet connector |
| Cross-Service | `openwiki` | System overview, topology, cross-service flows, state machines |

Each service has categories: `architecture/`, `concepts/`, `workflows/`, `integrations/`, `operations/`, `testing/`, `reference/`.

---

## Available Scripts

All scripts are located in `.claude/skills/openwiki/scripts/`.

### 1. `search_wiki.py` — Keyword Search

Search across all services for architecture guides, business workflows, and concepts.

```bash
python .claude/skills/openwiki/scripts/search_wiki.py --query "SEARCH_QUERY" [--service SERVICE] [--type TYPE] [--limit N]

# Examples:
python .claude/skills/openwiki/scripts/search_wiki.py --query "purchase payment flow"
python .claude/skills/openwiki/scripts/search_wiki.py --query "token encryption" --service openwiki-onesm
python .claude/skills/openwiki/scripts/search_wiki.py --query "card brand" --type concept
```

### 2. `search_by_tag.py` — Tag-Based Discovery (NEW)

Find documents by tags or discover all available tags. Critical for understanding the wiki taxonomy.

```bash
# Search by tags (any match)
python .claude/skills/openwiki/scripts/search_by_tag.py --tags "payment,refund"

# Search by tags (all must match)
python .claude/skills/openwiki/scripts/search_by_tag.py --tags "architecture,msp" --match-all

# Search within a specific service
python .claude/skills/openwiki/scripts/search_by_tag.py --tags "flow" --service openwiki-wsp

# List all available tags with document counts
python .claude/skills/openwiki/scripts/search_by_tag.py --list-tags

# List tags for a specific service
python .claude/skills/openwiki/scripts/search_by_tag.py --list-tags --service openwiki-msp
```

### 3. `query_flow.py` — Flow Tracing & Diagram Discovery (NEW)

The most powerful tool for answering "how does X work?" and "what happens when A calls B?".

```bash
# Trace flows between two services
python .claude/skills/openwiki/scripts/query_flow.py --from wsp --to msp --type payment
python .claude/skills/openwiki/scripts/query_flow.py --from msp --to psp --type refund

# Search diagrams by topic
python .claude/skills/openwiki/scripts/query_flow.py --topic "refund flow"
python .claude/skills/openwiki/scripts/query_flow.py --topic "Apple Pay authorization"
python .claude/skills/openwiki/scripts/query_flow.py --topic "tokenization" --diagram-type sequence

# List all diagrams in a service
python .claude/skills/openwiki/scripts/query_flow.py --diagrams --service openwiki-psp-connector-onecomm

# Deep-read a document with structure analysis
python .claude/skills/openwiki/scripts/query_flow.py --explain --service openwiki --path workflows/cross-service-flows.md
```

### 4. `generate_diagram.py` — Multi-Diagram Generation & Overview (NEW)

Generate or find Mermaid diagrams from documented flows. Supports **Sequence**, **Flowchart**, and **State Diagram** (`stateDiagram-v2`), as well as wiki-wide topology views.

```bash
# Find/generate sequence diagrams
python .claude/skills/openwiki/scripts/generate_diagram.py --query "payment flow WSP to MSP" --type sequence

# Find/generate flowcharts (decision logic, process blocks)
python .claude/skills/openwiki/scripts/generate_diagram.py --query "refund flow" --type flowchart

# Find/generate state machine diagrams (CREATED -> PENDING -> APPROVED/FAILED)
python .claude/skills/openwiki/scripts/generate_diagram.py --query "refund states" --type state

# Force generating a new custom diagram from steps (ignore pre-existing diagrams)
python .claude/skills/openwiki/scripts/generate_diagram.py --query "refund flow" --type flowchart --generate-only

# Generate wiki overview with full system topology diagram
python .claude/skills/openwiki/scripts/generate_diagram.py --overview
python .claude/skills/openwiki/scripts/generate_diagram.py --overview --service openwiki-wsp
```

### 5. `get_wiki_doc.py` — Read Specific Document

Read the full markdown content of a document.

```bash
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service SERVICE --path PATH [--max-chars N]

# Examples:
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service openwiki-psp-connector-onecomm --path workflows/purchase.md
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service openwiki --path workflows/cross-service-flows.md
```

### 6. `list_services.py` — List Documented Services

```bash
python .claude/skills/openwiki/scripts/list_services.py
```

---

## 🚨 CRITICAL ROUTING RULE: Default Flow Drawing Uses OpenWiki (Do NOT Fetch Jaeger Traces Automatically)

- **DEFAULT BEHAVIOR for flow & diagram requests** (e.g., "draw flow...", "draw diagram...", "draw sequence diagram...", "draw flowchart...", "explain flow..."):
  👉 **ALWAYS USE OPENWIKI** (canonical architecture documents, API specifications, sequence diagrams, flowcharts, state machines).
  👉 **NEVER call Jaeger to fetch live runtime traces unless explicitly requested.**
- **ONLY FETCH LIVE JAEGER TRACES WHEN**:
  - The user **explicitly requests live traces**: *"according to real trace"*, *"lấy trace luồng thật"*, *"trace ID: ..."*, *"Jaeger trace"*, *"trace runtime"*, *"draw actual trace flow"*.
  - Only then route to the `observability-jaeger` skill (`get_trace.py`, `visualize_trace.py`).

---

## Query Routing Guide — Which Script & Diagram Type to Use

| User Query Pattern (EN / VI) | Script to Use | Diagram Type |
|---|---|---|
| "Draw sequence diagram" / "Vẽ luồng tuần tự" | `generate_diagram.py --query ... --type sequence` | `sequenceDiagram` (OpenWiki) |
| "Draw flowchart / Decision flow" / "Vẽ sơ đồ khối / Rẽ nhánh" | `generate_diagram.py --query ... --type flowchart` | `flowchart TD / LR` (OpenWiki) |
| "Draw state machine / Lifecycle" / "Vẽ vòng đời trạng thái" | `generate_diagram.py --query ... --type state` | `stateDiagram-v2` (OpenWiki) |
| "Draw refund / payment flow WSP → MSP" | `query_flow.py --from wsp --to msp --type refund` | Sequence or Flowchart (OpenWiki) |
| "Explain flow" / "Giải thích luồng" | `query_flow.py --explain --service --path` | Text + Diagrams (OpenWiki) |
| "Draw flow FROM REAL TRACE / Trace ID: ..." | `observability-jaeger` (`get_trace.py`, `visualize_trace.py`) | Sequence / Flowchart (Real Jaeger Trace) |
| "Search docs by tag" / "Tìm tài liệu theo tag" | `search_by_tag.py --tags` | - |
| "List all available tags" / "Có những tag nào?" | `search_by_tag.py --list-tags` | - |
| "System overview / Topology" / "Tổng quan hệ thống" | `generate_diagram.py --overview` | `flowchart TB` (topology) |
| "List diagrams in service" / "Liệt kê các sơ đồ" | `query_flow.py --diagrams` | All Mermaid types |

---

## Supported Diagram Types for Chatbot Answers

When responding to users, the Agent should produce the appropriate Mermaid diagram type based on user intent:

1. **Sequence Diagram (`sequenceDiagram`)**: Best for API call order, request/response payloads, sync vs async messaging, status codes (e.g. 200, 300, 400).
2. **Flowchart (`flowchart TD / LR`)**: Best for decision branching (Auto vs Manual refund, Fraud check Pass vs Fail), business process flowcharts, service-to-service block diagrams.
3. **State Machine (`stateDiagram-v2`)**: Best for transaction/record state lifecycles (e.g., `CREATED` → `PENDING` → `APPROVED` / `FAILED` / `REJECTED`).
4. **Topology (`flowchart TB / LR` with subgraphs)**: Best for high-level architecture maps (Edge, Orchestration, Security, PSPs, Gateways).


## Investigation Best Practices with OpenWiki

### Step 1 — Understand the Documented Flow
When investigating an issue (e.g., "Payments failing in PSP Connector"), search OpenWiki first:
```bash
python .claude/skills/openwiki/scripts/query_flow.py --topic "purchase" --service openwiki-psp-connector-onecomm
```

### Step 2 — Retrieve Sequence & Mermaid Diagrams
Find the exact documented flow with participants and messages:
```bash
python .claude/skills/openwiki/scripts/query_flow.py --from msp --to psp --type payment
```

### Step 3 — Deep-read the Document
Get the full context with headings, tags, and all diagrams:
```bash
python .claude/skills/openwiki/scripts/query_flow.py --explain --service openwiki-psp-connector-onecomm --path workflows/purchase.md
```

### Step 4 — Cross-reference with Live Traces
Compare the documented workflow steps against spans from `observability-jaeger` or logs from `observability-graylog` to pinpoint exactly which dependency failed.

---

## Key Knowledge

### Canonical business flows documented in OpenWiki:
1. **Invoice creation** (with optional immediate token payment)
2. **Standard card purchase** (Onecomm NAPAS card)
3. **Apple Pay purchase** (Onecomm Apple Pay)
4. **3DS / NAPAS authorization redirect**
5. **KBank BNPL payment**
6. **QR code payment**
7. **Refund** (full and partial, connector-level)
8. **Void / cancellation**
9. **Tokenization** (instrument lifecycle, iCVV)
10. **OneSM cryptographic operations** (AES, RSA, HMAC)
11. **SCSP key create/read/update/delete**
12. **Authentication & authorization** (vpc signature, HTTP signature, HMAC)

### Important cross-service documents:
- `openwiki/system-overview.md` — Top-level service roles and E2E flow
- `openwiki/workflows/cross-service-flows.md` — ALL canonical sequence diagrams
- `openwiki/architecture/system-topology.md` — Service ownership and topology
- `openwiki/architecture/state-machines.md` — Invoice, payment, token state machines
- `openwiki/architecture/security-and-keys.md` — Security model across services
- `openwiki/reference/psp-connectors.md` — PSP connector comparison reference
