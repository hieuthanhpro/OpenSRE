---
type: Architecture
title: System topology and cross-service interaction map
description: Diagram-first view of the OnePay microservice estate - which service owns which responsibility, how a payment request traverses WSP, MSP, TVSP, PSP connectors, OneSM and SCSP, and which databases and external gateways each hop touches.
resource: repo://openwiki
tags: [architecture, topology, interactions, msp, wsp, tvsp, onesm, scsp, psp-connector]
---

# System topology and cross-service interaction map

Companion pages:

- [`/openwiki/workflows/cross-service-flows.md`](/openwiki/workflows/cross-service-flows.md) - step-by-step sequence diagrams for each canonical flow.
- [`/openwiki/architecture/state-machines.md`](/openwiki/architecture/state-machines.md) - invoice, payment, token, instrument and refund state machines.

## 1. Services and owned responsibility

| Service | Stack | Owns | Downstream calls |
|---|---|---|---|
| WSP (`wsp`) | Vert.x HTTP gateway, prefix `/paygate/api/v1` (VPC `/paygate/api/vpc/v1`) | Request normalization, merchant validation (`validation.yaml`), bank/instrument profiles, rendering NAPAS/3DS pages, redirect handling. **No own database.** | MSP, PSP-ONECREDIT (`/applepay-sessions`, `/applepay-tokens`), OneSM (`OneSMHttpClient.encryptToBase64String`), TSP Vault |
| MSP (`msp`) | Vert.x, prefix `/msp/api/v1` | Invoice, payment, refund, void, QR, fraud orchestration, connector strategy loading (`Main.mspConnectors`) | TVSP, OneSM, SCSP (Apple Pay merchant key/cert via `ScspApplePayKeyStore`), FSP / FSP-Go, `ma-service`, `smssp`, `onebill`, all PSP connectors |
| TVSP (`tvsp`) | Vert.x, `RoutePool` root `/tspvault/api/v1` (config also lists `service.base_path=/tvsp/api/v2`) | Instrument and token lifecycle, iCVV generation, token/instrument state, Oracle `PKG_INSTRUMENT` / `PKG_TOKEN2` | OneSM (`encryptAES`, `encryptHMAC`, `decrypt`) |
| OneSM (`onesm`) | Java 11 / Netty, only `POST /encryptions` and `POST /decryptions` | Local JCEKS keystore (`/keystore.jceks`), HMAC request auth (`X-Authorization` + `X-Date`), AES/CBC/PKCS5, RSA/ECB/PKCS1, Guava key cache | nothing; standalone |
| SCSP (`scsp`) | Go / Gin, prefix `/scsp/api/v1` | Key/subkey store on Postgres `scsp.tb_kv_store` + `scsp.tb_user_policy`, Argon2id Basic auth, per-path policies, Ristretto cache | Vault transit (`EncryptionPort`) |
| PSP connectors | Vert.x, per-connector prefix (`/psp/api/v1`, `/psp-connector-onecomm-apple/api/v1`, ...) | Protocol adapters, per-connector Oracle payment/auth/refund state via stored procedures | Onecomm Hessian gateway, NAPAS, KBank REST (AES-GCM + RSA), VCB TSP `/instruments` |
| FSP / FSP-Go | external | Fraud scoring | called by MSP and `psp-connector-onecomm` |

## 2. Logical topology

```mermaid
flowchart TB
    subgraph Client
        M[Merchant / Mobile App / Web checkout]
    end

    subgraph Edge
        WSP[WSP - Vert.x gateway]
    end

    subgraph Orchestration
        MSP[MSP - invoice / payment / refund / QR / fraud]
    end

    subgraph Security
        TVSP[TVSP Vault - instruments and tokens]
        ONESM[OneSM - crypto and keys]
        SCSP[SCSP - key store]
    end

    subgraph PSP
        OC[psp-connector-onecomm]
        OCA[psp-connector-onecomm-apple]
        KB[psp-connector-kbank]
        EW[psp-connector-ewallet]
    end

    subgraph External
        ONECOMM[Onecomm gateway - Hessian]
        NAPAS[NAPAS]
        KBANK[KBank REST API]
        VCBTSP[VCB TSP ewallet]
        FSP[FSP / FSP-Go fraud]
    end

    M -->|OWS1 / VPC / HTTP signature| WSP
    WSP --> MSP
    WSP -.->|applepay-sessions, applepay-tokens| OCA
    WSP -->|PAN encryption| ONESM
    WSP -->|token based auth result| TVSP

    MSP -->|Invoices.createTspPayment, Payments.paymentWithToken| TVSP
    MSP -->|encrypt instrument| ONESM
    MSP -->|ScspApplePayKeyStore - GET /key/msp/merchants/.../applepay/...| SCSP
    MSP -->|checkFraud / requestUpdateFraud| FSP
    MSP -->|connector.createPayment / createRefund / createVoid / verifyOTP| OC
    MSP --> OCA
    MSP --> KB
    MSP --> EW

    TVSP --> ONESM

    OC -->|Hessian execute| ONECOMM
    OC -->|domestic auth token| NAPAS
    OC -->|POST /domestic/check-fraud| FSP
    OCA -->|Hessian execute| ONECOMM
    KB --> KBANK
    EW --> VCBTSP
```

## 3. Per-request hop chain

```mermaid
flowchart LR
    C[Client] -->|OWS1-HMAC-SHA256| W[WSP]
    W -->|normalize, validate merchant| M[MSP]
    M -->|invoice / payment / refund| P[PSP connector]
    P -->|Hessian / REST| G[Onecomm / NAPAS / KBank]
    P -->|PKG_PAYMENT.*| D1[(Connector Oracle)]
    M -->|DB.createInvoice / createPayment| D2[(MSP Oracle)]
    M -.->|encrypt instrument| O[OneSM]
    M -.->|"ScspApplePayKeyStore GET /key/msp/merchants/.../applepay/{hash}"| S[SCSP]
    M -.->|token ops| T[TVSP Vault]
    T -.->|encryptAES / encryptHMAC| O
    P -.->|checkFraud| F[FSP-Go]
```

Each connector owns its own Oracle schema reached only through stored procedures (`PKG_PAYMENT.payment_insert`, `PKG_AUTHORIZATION.auth_insert`, `PKG_REFUND.refund_insert`, ...). MSP owns invoice/payment state; TVSP owns instrument/token state. Databases are per-service, never shared.

## 4. Authentication across the edges

```mermaid
sequenceDiagram
    participant C as Client
    participant WSP
    participant MSP
    participant PSP as PSP connector
    participant ONESM
    C->>WSP: X-OP-Date / X-OP-Expires / X-OP-Authorization (OWS1-HMAC-SHA256) or vpc_SecureHash
    Note over WSP: checkOWSAuthorization / checkVpcAuthorization / checkHttpSignature
    WSP->>MSP: internal call with client credentials
    MSP->>PSP: OWS1 signature, headers required: X-OP-Date, X-OP-Expires, X-OP-Authorization
    PSP->>PSP: Recompute HMAC from access_key.<clientId>
    PSP->>ONESM: (only KBank-style keys are local - OneSM used by WSP, MSP, TVSP)
    ONESM-->>PSP: X-Secure-Hash signed response
```

Key-ownership summary: OneSM keys come from its own JCEKS keystore (`http_client.<clientId>`, aliases such as `onecredit.hmac`, `tspvault.aes`, `tspvault.hmac`, `aes256`). SCSP is a standalone KSM over Postgres with Basic auth and path policies; MSP is the documented consumer of SCSP keys (Apple Pay merchant key/cert lookup), while **no documented edge from OneSM to SCSP** exists.

## 5. Error envelope contract

| Layer | Shape | Example names |
|---|---|---|
| MSP / WSP | `response_code`, `response_desc`, `response_data` | `UNAUTHORIZED`, `VALIDATION_ERROR`, `EXPIRED_AUTHORIZATION`, `DECRYPT_TOKEN_ERROR`, `TRANSACTION_TIMEOUT`, `GET_QR_INVOICE_NOT_FOUND` |
| PSP connectors | `{name, message, details, information_link}` | `INVALID_REQUEST_BODY`, `INVALID_MERCHANT`, `INVALID_ACCESS_KEY`, `OPERATION_EXPIRED`, `PSP_CONNECTION_ERROR`, `INVALID_REFUND`, `METHOD_NOT_SUPPORTED` |
| OneSM | `{name, message, information_link, details}` | `UNAUTHORIZED_ACCESS`, `INVALID_KEY`, `ALGORITHM_NOT_SUPPORTED`, `UNSUPPORTED_ALGORITHM` |
| SCSP | `{"error": "..."}` | `Key not found`, `Key already exists`, `Version conflict`, `Forbidden: Insufficient permissions` |

Status mapping for connectors: `AuthorizationException` 401, `BadRequestException` 400, `ResourceConflictException` 409, `ResourceNotFoundException` 404, `HttpServiceException` upstream code, otherwise 500 `INTERNAL_SERVER_ERROR`.

## 6. Documented gaps

- No documented scheduler/cron settlement or batch job in any service (closest: `paymentRefund4B` pending record with status 210 for CDR file generation).
- No documented inbound bank webhook other than WSP IPN routes `POST {prefix}/homecredit/ipn` and `POST {prefix}/kredivo/ipn/:payment_id`.
- KBank void/capture flows and onecomm void routes exist as classes but their endpoint-level sequences are not documented.
- QR scan-and-pay callback endpoint is not documented; only the resulting invoice status update is described.
