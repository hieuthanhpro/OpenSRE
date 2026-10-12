---
name: openwiki
description: "Access, search, query, and visualize OpenWiki system architecture documentation, microservices, and database schemas. Capabilities: (1) Answer end-to-end flow questions (APIs called, DB tables/packages updated, partner interactions), (2) Search API endpoints (query_api.py), (3) Search Oracle DB schemas, tables, and stored procedures (query_db.py), (4) Trace cross-service flows and extract Mermaid diagrams (query_flow.py), (5) Generate sequence, flowchart, and state diagrams (generate_diagram.py), (6) Deep-read documents (get_wiki_doc.py). Use when user asks about microservice architecture, payment/auth/refund flows, APIs called, DB tables modified, partner connections, component design, or requests diagrams."
allowed-tools: Bash(python *)
---

# OpenWiki Knowledge Base & Architecture Documentation

## Overview

OpenWiki contains authoritative architectural documentation, sequence flows, integration contracts, database schemas, and operational guidelines for the payment platform:

### Documented Microservices (`open-wiki/service/`):
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

### Documented Databases (`open-wiki/database/`):
| Database | Directory | Description |
|---|---|---|
| Oracle 112 | `db-prod-112` | MSP Payment Core (`TB_PAYMENT`, `TB_INVOICE`), PAYMENT2, ONECREDIT, LDP, QUICKLINK |
| Oracle 114 | `db-prod-114` | ONEPORTAL, ONEFIN, ONEFRAUD, CDR, Merchant Portal |
| Oracle 118 | `db-prod-118` | Dispute, OneReport, OneMon monitoring schemas |
| Oracle 124 | `db-prod-124` | PayCollect, OneBill billing schemas |

---

## Standard Response Structure for Architecture & Flow Questions

When the user asks architecture or flow questions (e.g. *"Khi khách thanh toán Apple Pay thì gọi API nào, lưu vào DB những bảng gì, và gọi tiếp sang đối tác ra sao"*), **ALWAYS structure your answer into these 5 clear sections**:

1. **Tổng quan luồng (Overview & E2E Summary)**:
   - Tóm tắt luồng đi từ Client/Merchant qua các microservice (WSP → MSP → PSP Connectors).
2. **Chi tiết các API được gọi (APIs & Endpoints)**:
   - Bảng liệt kê: HTTP Method, Endpoint URI, Service xử lý, Mô tả chức năng và Payload chính.
3. **Tác động Cơ sở dữ liệu (Database Tables & Stored Procedures)**:
   - Các bảng bị tác động (e.g., `TB_INVOICE`, `TB_PAYMENT`, `TB_AUTHORIZATION`, `TB_INSTRUMENT`).
   - Các Stored Packages/Procedures được thực thi (e.g., `PKG_PAYMENT.payment_insert`, `PKG_AUTHORIZATION.auth_insert`).
   - Database/Schema tương ứng (e.g., Oracle 112 - MSP / PSP_CONNECTOR).
4. **Tương tác Đối tác & Cổng thanh toán (Downstream Partners & Gateways)**:
   - Các bên thứ ba được gọi (Apple Pay Server, PSP-ONECREDIT, PSP-ONECOMM / NAPAS, Ngân hàng phát hành/thanh toán).
5. **Sơ đồ tuần tự (Mermaid Sequence Diagram)**:
   - Diagram Mermaid chuẩn trực quan hóa toàn bộ quá trình giao dịch.
   - ⚠️ **QUY TẮC CÚ PHÁP BẮT BUỘC ĐỂ TRÁNH LỖI RENDER TRÊN WEB UI**:
     1. **MỖI CÂU LỆNH PHẢI NẰM TRÊN MỘT DÒNG RIÊNG (TUYỆT ĐỐI KHÔNG GỘP DÒNG)**:
        - KHÔNG ĐƯỢC gộp 2 mũi tên trên cùng 1 dòng (ví dụ SAI: `FR-->>MSP: fee    MSP->>FSM: encrypt`). PHẢI XUỐNG DÒNG cho mỗi bước.
        - Các khối điều kiện `alt`, `else`, `opt`, `loop`, `par`, `critical`, `end` PHẢI nằm trên dòng riêng biệt. KHÔNG ĐƯỢC viết `alt Fraud        P-->>M: 400 FRAUD` trên cùng một dòng.
     2. **ĐỊNH DANH PARTICIPANT HỢP LỆ**:
        - Tên ID participant chỉ dùng chữ cái và số ngắn gọn (ví dụ: `C`, `WSP`, `MSP`, `PSP`, `GW`, `NAPAS`, `DBM`).
        - KHÔNG chứa dấu gạch chéo `/` hay dấu cách trong ID (ví dụ SAI: `participant Onecomm/NAPAS`. ĐÚNG: `participant GW as Onecomm/NAPAS`).
     3. **NỘI DUNG MESSAGE VÀ GHI CHÚ**:
        - Không dùng dấu ngoặc kép `"` trong message (dùng dấu nháy đơn `'` hoặc text thường).
        - Tuyệt đối KHÔNG đặt comment `%%` ở cuối dòng sau message `:`. Chỉ đặt `%%` trên dòng comment độc lập.
        - Khi xuống dòng trong Note, bắt buộc dùng `<br/>` (thẻ tự đóng có gạch chéo).

---

## Available Scripts

All scripts are located in `.claude/skills/openwiki/scripts/`.

### 1. `query_flow.py` — End-to-End System Flow & Architecture Tracing
The primary script for answering flow, API, DB, and partner questions.
```bash
# Query comprehensive flow by topic (returns APIs, DB tables, Partners, and Mermaid diagram)
python .claude/skills/openwiki/scripts/query_flow.py --topic "Apple Pay"
python .claude/skills/openwiki/scripts/query_flow.py --topic "refund flow"
python .claude/skills/openwiki/scripts/query_flow.py --topic "NAPAS card purchase"

# Trace flow between two specific services
python .claude/skills/openwiki/scripts/query_flow.py --from wsp --to msp --type payment
python .claude/skills/openwiki/scripts/query_flow.py --from msp --to psp --type refund

# Deep-read and explain a specific workflow document
python .claude/skills/openwiki/scripts/query_flow.py --explain --service openwiki-wsp --path integrations/apple-payment.md
python .claude/skills/openwiki/scripts/query_flow.py --explain --service openwiki --path workflows/cross-service-flows.md
```

### 2. `query_api.py` — API Endpoint Discovery
Find all API routes, endpoints, HTTP methods, and service handlers.
```bash
# Search endpoints by keyword
python .claude/skills/openwiki/scripts/query_api.py --query "applepay"
python .claude/skills/openwiki/scripts/query_api.py --query "invoice" --method POST

# List all endpoints in a service
python .claude/skills/openwiki/scripts/query_api.py --service openwiki-wsp
python .claude/skills/openwiki/scripts/query_api.py --service openwiki-msp
```

### 3. `query_db.py` — Database Schema, Table & Package Catalog
Search Oracle tables (`TB_*`), stored packages (`PKG_*`), and procedures across schemas.
```bash
# Search for specific tables
python .claude/skills/openwiki/scripts/query_db.py --table "TB_PAYMENT"
python .claude/skills/openwiki/scripts/query_db.py --table "applepay"

# Search for stored packages or procedures
python .claude/skills/openwiki/scripts/query_db.py --package "PKG_PAYMENT"
python .claude/skills/openwiki/scripts/query_db.py --package "PKG_AUTHORIZATION"

# Search database schemas by business topic
python .claude/skills/openwiki/scripts/query_db.py --query "Apple Pay" --database prod_112
python .claude/skills/openwiki/scripts/query_db.py --database prod_112
```

### 4. `search_wiki.py` — General Keyword Search
Search across all documentation files with relevance ranking.
```bash
python .claude/skills/openwiki/scripts/search_wiki.py --query "apple pay payment"
python .claude/skills/openwiki/scripts/search_wiki.py --query "token encryption" --service openwiki-onesm
python .claude/skills/openwiki/scripts/search_wiki.py --query "card brand" --type concept
```

### 5. `generate_diagram.py` — Diagram Generation & Overview
Find or generate sequence, flowchart, or state diagrams.
```bash
# Generate sequence diagram
python .claude/skills/openwiki/scripts/generate_diagram.py --query "payment flow WSP to MSP" --type sequence

# Generate flowchart
python .claude/skills/openwiki/scripts/generate_diagram.py --query "refund flow" --type flowchart

# Generate state machine lifecycle
python .claude/skills/openwiki/scripts/generate_diagram.py --query "refund states" --type state

# Full system topology overview
python .claude/skills/openwiki/scripts/generate_diagram.py --overview
```

### 6. `get_wiki_doc.py` — Read Document Content
Read full markdown documentation (automatically resolves paths across services and databases).
```bash
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service openwiki-wsp --path integrations/apple-payment.md
python .claude/skills/openwiki/scripts/get_wiki_doc.py --service db-prod-112 --path schemas/msp-schema.md
```

### 7. `list_services.py` — List Services & Databases
```bash
python .claude/skills/openwiki/scripts/list_services.py
python .claude/skills/openwiki/scripts/list_services.py --type microservice
python .claude/skills/openwiki/scripts/list_services.py --type database
```

---

## 🚨 CRITICAL ROUTING RULE: Architecture & Flow Requests Use OpenWiki

- **DEFAULT BEHAVIOR for flow, architecture, API, and DB schema questions**:
  👉 **ALWAYS USE OPENWIKI** (canonical architecture documents, API specifications, DB schemas, sequence diagrams).
  👉 **NEVER call Jaeger to fetch live runtime traces unless the user explicitly requests live traces** (e.g. *"trace ID: ..."*, *"lấy trace thật"*, *"real trace"*).

---

## Key Knowledge & Canonical Flows in OpenWiki

1. **Apple Pay Purchase Flow**:
   - **WSP**: `POST applepay-sessions` (creates session with Apple via PSP), `POST applepay-payments` (receives payment token), `POST applepay-tokens` (decrypts token via PSP-ONECREDIT).
   - **Routing to MSP**:
     - International cards (Visa/Mastercard): `PUT applepay-payments/{paymentId}` (ONECREDIT).
     - Domestic cards: `PUT applepay-napas/payments/{paymentId}` (ONECOMM).
   - **Database (Oracle 112)**:
     - `MSP`: `TB_INVOICE`, `TB_PAYMENT`, `TB_INSTRUMENT`, `TB_AUTHORIZATION`, `TB_CAPTURE`.
     - `PSP_CONNECTOR`: `TB_APPLEPAY_MERCHANT_CONFIG`, `TB_PAYMENT`, `TB_TRANSACTION`.
     - Stored procedures: `PKG_PAYMENT.payment_insert`, `PKG_PAYMENT.payment_update`, `PKG_AUTHORIZATION.auth_insert`.
   - **Partners**: Apple Pay Server, PSP-ONECREDIT, PSP-ONECOMM / NAPAS, Banks/Acquirers.

2. **Invoice Creation Flow**:
   - `POST {prefix}/invoices` → WSP → MSP `POST /msp/api/v1/invoices` → OneSM encryption → `TB_INVOICE`.

3. **Standard Card Purchase Flow**:
   - `POST {prefix}/invoices/:id/payments` → WSP → MSP `Payments.create` → `TB_PAYMENT` → PSP Connector Onecomm (`PKG_PAYMENT.payment_insert`) → Onecomm Gateway / NAPAS.

4. **Refund Flow**:
   - MSP `POST /refunds` → PSP Connector Onecomm / E-Wallet / KBank → `TB_REFUND`, `TB_PAYMENT` (`PKG_REFUND`).

5. **Tokenization Flow**:
   - WSP → MSP → TVSP Token Vault (`TB_TOKEN`, `TB_INSTRUMENT`) encrypted with OneSM (`encryptToBase64String`).
