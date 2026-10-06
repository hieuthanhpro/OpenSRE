---
type: Concept
title: Cross-service orchestration overview
description: Repository-level map of the OnePay payment services in this monorepo, showing how Merchant Service Provider, Website Service Provider, Token Service Providers, Security Manager, and PSP Connectors collaborate to process payments.
resource: repo://openwiki
tags: [architecture, orchestration, cross-service, msp, wsp, onesm, tvsp, psp-connector]
---

# Cross-service orchestration overview

This page summarizes how the services in this repository collaborate to process payments, refunds, tokenization, authorization, and security operations. It is a navigation hub: each subsection explains the responsibility boundary, the service that owns it, and the main evidence pages to consult next.

## Service roles

| Service | Short name | Core responsibility |
|---|---|---|
| Website Service Provider | WSP | Merchant-facing API gateway, request normalization, routing to downstream services. |
| Merchant Service Provider | MSP | Invoice, payment, refund, void, QR, fraud orchestration, and connector strategy routing. |
| OneSM | onesm | Centralized key management and authenticated cryptography services (AES, RSA, HMAC). |
| TSP Vault | tvsp | Payment instrument storage, tokenization, and token lifecycle management. |
| PSP Connector: Onecomm | psp-connector-onecomm | PSP bridge for standard card and Apple Pay NAPAS flows via the Onecomm gateway. |
| PSP Connector: Onecomm Apple | psp-connector-onecomm-apple | Specialist Apple Pay PSP connector with the same Onecomm integration pattern. |
| PSP Connector: KBank | psp-connector-kbank | PSP bridge for the KBank BNPL/account-payment integration. |

## End-to-end request flow

```mermaid
flowchart LR
    Client[Merchant / App] --> WSP[WSP]
    WSP --> MSP[MSP]
    MSP --> PSP[PSP Connector]
    MSP --> TSP[TSP Vault]
    WSP --> PSP2[PSP Connector]
    PSP --> External[External PSP / Bank / Wallet]
    PSP2 --> External
    TSP --> DB[(Oracle)]
    MSP --> DB[(Oracle)]
    PSP --> DB[(Oracle)]
    MSP -.-> OneSM[OneSM]
    TSP -.-> OneSM[OneSM]
```

Caption: Logical request path through the payment stack in this repository.

## Canonical flows across services

### 1. Invoice creation and optional token payment

```mermaid
sequenceDiagram
    participant Client
    participant WSP
    participant MSP
    participant TSP
    participant OneSM
    Client->>WSP: Create invoice
    WSP->>MSP: Forward invoice request
    MSP->>MSP: Validate merchant, signature, amount, currency
    MSP->>TSP: Validate or refresh token if supplied
    TSP-->>MSP: Token status
    OneSM-->>MSP: Crypto/key services when needed
    MSP-->>WSP: Invoice created
    WSP-->>Client: Invoice response
```

Key pages:
- MSP core workflows: `msp/openwiki/workflows/core-workflows.md`
- TSP tokenization: `tvsp/openwiki/workflows/tokenization.md`
- WSP architecture: `wsp/openwiki/architecture/overview.md`

### 2. Standard card purchase

```mermaid
sequenceDiagram
    participant Client
    participant WSP
    participant MSP
    participant PSP
    participant OneSM
    participant Oracle
    Client->>WSP: Submit payment / instrument
    WSP->>MSP: Create payment for invoice
    MSP->>MSP: Route by merchant/connector config
    MSP->>PSP: Forward purchase to PSP connector
    PSP->>PSP: Persist pending state
    Oracle-->>PSP: payment_insert
    PSP->>PSP: Verify merchant / verify card with gateway
    PSP-->>MSP: Gateway result or authorization_required
    OneSM-->>PSP: Crypto/key services when needed
    MSP->>MSP: Update invoice/payment state
    MSP-->>WSP: Payment result
    WSP-->>Client: Response
```

Key pages:
- MSP connector model: `msp/openwiki/concepts/connectors.md`
- Onecomm purchase flow: `psp-connector-onecomm/openwiki/workflows/purchase.md`
- Onecomm Apple purchase flow: `psp-connector-onecomm-apple/openwiki/workflows/purchase.md`

### 3. Apple Pay session and payment

```mermaid
sequenceDiagram
    participant Client
    participant WSP
    participant PSP
    participant MSP
    participant NAPAS
    Client->>WSP: Create Apple Pay session
    WSP->>PSP: Create PSP session
    PSP-->>WSP: Session result
    Client->>WSP: Submit Apple Pay payment token
    WSP->>PSP: Decrypt Apple Pay token
    PSP-->>WSP: Decrypted card / wallet data
    WSP->>MSP: Route payment by card type
    alt International card
        MSP->>PSP: ApplePay purchase via ONECREDIT path
    else Napas domestic path
        MSP->>PSP: ApplePay Napas purchase path
    end
    PSP-->>MSP: Gateway result
    MSP-->>WSP: Payment result
    WSP-->>Client: Response
```

Key pages:
- WSP Apple Pay integration: `wsp/openwiki/integrations/apple-payment.md`
- PSP Onecomm Apple purchase: `psp-connector-onecomm-apple/openwiki/workflows/purchase.md`

### 4. Tokenization and token-based payment

```mermaid
sequenceDiagram
    participant Client
    participant WSP
    participant MSP
    participant TSP
    participant OneSM
    Client->>WSP: Register instrument / pay with token
    WSP->>TSP: Create or validate token
    TSP->>TSP: Generate token, manage state, expiry, and linkage
    OneSM-->>TSP: Key/crypto support for token protection
    TSP-->>WSP: Token result
    WSP->>MSP: Submit token-based payment
    MSP->>MSP: Generate dynamic CVV / validate token ownership
    MSP->>MSP: Route to connector/TSP payment path
    MSP-->>WSP: Payment result
    WSP-->>Client: Response
```

Key pages:
- TSP tokenization: `tvsp/openwiki/workflows/tokenization.md`
- TSP instrument management: `tvsp/openwiki/workflows/instrument-management.md`
- MSP token-based payment flow: `msp/openwiki/workflows/core-workflows.md`

### 5. KBank BNPL/account payment

```mermaid
sequenceDiagram
    participant Client
    participant WSP
    participant MSP
    participant KBank PSP
    participant KBank
    participant Oracle
    Client->>WSP: Start KBank purchase
    WSP->>MSP: Create payment request
    MSP->>KBank PSP: Route to KBank connector
    KBank PSP->>Oracle: Insert payment state
    KBank PSP->>KBank: addPaymentMethod / sendOtp / payment
    alt OTP required
        KBank PSP->>KBank: sendOTP
        KBank-->>KBank PSP: OTP required
        KBank PSP-->>MSP: authorization_required
    else Deep link required
        KBank PSP->>KBank: getDeepLink
        KBank-->>KBank PSP: deep link payload
        KBank PSP-->>MSP: redirect / challenge state
    else Success
        KBank-->>KBank PSP: Success
        KBank PSP->>MSP: Update settlement result
    end
    MSP-->>WSP: Final response
    WSP-->>Client: Response
```

Key pages:
- KBank gateway integration: `psp-connector-kbank/openwiki/integrations/kbank-gateway.md`
- KBank security model: `psp-connector-kbank/openwiki/concepts/security.md`
- MSP configuration and routing: `msp/openwiki/operations/configuration.md`

### 6. Security, keys, and cryptography boundary

```mermaid
sequenceDiagram
    participant Caller as Service caller
    participant OneSM
    participant SecureKS
    participant Crypto
    Caller->>OneSM: Authenticated crypto request
    OneSM->>OneSM: Check HMAC signature
    OneSM->>SecureKS: Resolve key/certificate alias
    SecureKS-->>OneSM: Cached key material
    OneSM->>Crypto: Dispatch by algorithm
    Crypto-->>OneSM: AES/RSA/HMAC result
    OneSM-->>Caller: Signed response
```

Key pages:
- OneSM quickstart: `onesm/openwiki/quickstart.md`
- Crypto operations: `onesm/openwiki/concepts/crypto-operations.md`
- Key management: `onesm/openwiki/concepts/key-management.md`
- OneSM encryption endpoints: `onesm/openwiki/workflows/encryption-decryption-endpoints.md`
- OneSM request auth: `onesm/openwiki/workflows/http-request-auth.md`

## Cross-service integration patterns

- **WSP is the external gateway** but owns no payment state of its own. It normalizes requests and delegates persistence and orchestration to MSP, TSP, and PSP connectors.
- **MSP owns transaction orchestration** and the connector strategy layer. New PSPs are added as connectors, not as changes to WSP or the core domain model.
- **PSP connectors are protocol adapters.** They translate MSP operations into gateway-specific protocols (Hessian/Onecomm, AES-GCM+RSA/KBank), manage local Oracle payment state, and return normalized PSP states back to MSP.
- **TSP Vault owns token lifecycle** separate from PSP-specific card flows. Tokens are created, approved, expired, locked, and deleted independently, while remaining linked to parent instruments.
- **OneSM is a shared crypto boundary.** Other services delegate encryption, decryption, hashing, and authenticated key resolution to OneSM instead of embedding raw key material directly.
- **Oracle databases are per-service**, not a single shared schema. PSP connectors persist connector-side payment/auth state; MSP persists invoice/payment/refund state; TSP persists instrument and token state.

## Navigation index by concern

| Concern | Start here |
|---|---|
| High-level architecture | `wsp/openwiki/architecture/overview.md` |
| Invoice and payment orchestration | `msp/openwiki/workflows/core-workflows.md` |
| PSP connector model | `msp/openwiki/concepts/connectors.md` |
| Onecomm gateway protocol | `psp-connector-onecomm/openwiki/integrations/onecomm-gateway.md` |
| Apple Pay flows | `wsp/openwiki/integrations/apple-payment.md` |
| KBank integration and OTP/deeplink | `psp-connector-kbank/openwiki/integrations/kbank-gateway.md` |
| Tokenization | `tvsp/openwiki/workflows/tokenization.md` |
| Instrument management | `tvsp/openwiki/workflows/instrument-management.md` |
| Cryptography and key management | `onesm/openwiki/concepts/key-management.md` |
| Security and authorization | `wsp/openwiki/concepts/authorization.md` |
| Deployment and configuration | `msp/openwiki/operations/configuration.md` |

## Open questions for future enrichment

- The repository also contains a `psp-connector-ewallet` service, but its current openwiki output is incomplete; document it once its generated wiki is refreshed.
- Some MSP and PSP integrations reference other internal systems such as ASP and Fraud Service Provider; those boundaries are documented outside this repository and should be linked when available.
- The exact shared infrastructure topology (load balancers, deployment segments, sync scripts) is partially captured in service-specific operations pages, but a single deployment topology page would make cross-service operations clearer.
