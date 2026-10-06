---
type: concept
title: Security and signatures
description: Explains the inbound OWS1 HMAC-SHA256 request verification and the outbound signed requests the connector sends to the downstream ewallet service.
tags: [security, hmac, signature, authorization, ows1]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-30T08:38:20.900Z
sources:
  - id: openwiki-source-f47e6740e7c41b7d2b46ee26
    resource: repo://src/main/java/vn/onepay/psp/common/util/AppParams.java
  - id: openwiki-source-7f42ba2e366473162ee60c5b
    resource: repo://src/main/java/vn/onepay/psp/common/util/HttpClientUtil.java
  - id: openwiki-source-9b05bbab2ad030014da4d2f7
    resource: repo://src/main/java/vn/onepay/psp/server/handler/common/ClientAuthorizationHandler.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
generated: { by: "openwiki/0.5.2", at: "2026-09-30T08:38:20.900Z" }
---

# Security and signatures

The PSP connector uses the **OWS1** (OnePAY Web Service v1) signature scheme for both inbound and outbound HTTP requests. This provides request integrity, authenticity, and replay protection using HMAC-SHA256.

## Inbound Request Verification

When the connector receives a request from an upstream client, it validates the request headers and signature in `ClientAuthorizationHandler`.

```mermaid
sequenceDiagram
    participant Client
    participant Handler as ClientAuthorizationHandler
    participant AuthLib as Authorization Lib

    Client->>Handler: HTTP Request
    Handler->>Handler: Check Accept/Content-Type headers
    Handler->>Handler: Extract X-OP-Date, X-OP-Expires, X-OP-Authorization
    Handler->>AuthLib: Parse Authorization Header
    AuthLib-->>Handler: Metadata (Algorithm, Client ID, Signed Headers)
    Handler->>Handler: Check Expiry and Region/Service metadata
    Handler->>Handler: Reconstruct Signed Headers Map
    Handler->>AuthLib: Compute Signature (Client Key + Payload)
    AuthLib-->>Handler: Calculated Signature
    Handler->>Handler: Compare Signatures
    alt Signatures Match
        Handler->>Client: Route to next handler
    else Mismatch
        Handler->>Client: 401/403 Authorization Exception
    end
```

### Validation Steps

1.  **Header Presence**: Checks for `Accept`, `Content-Type`, `X-OP-Date`, `X-OP-Expires`, and `X-OP-Authorization`.
2.  **Authorization Parsing**: The `Authorization` class (from the `vn.onepay:ows` library) parses the `X-OP-Authorization` header.
3.  **Metadata Verification**: Verifies `Algorithm` (must be `OWS1-HMAC-SHA256`), `Region` (must be `onepay`), and `Service` (must be `psp-connector-vietcombank`).
4.  **Expiry Check**: Ensures the request timestamp plus the `X-OP-Expires` duration has not passed.
5.  **Signature Re-computation**: Rebuilds the signature using the shared `access_key` stored in `app.properties` (keyed by Client ID) and compares it with the provided signature.

## Outbound Request Signing

When calling the downstream ewallet service (e.g., VietComBank TSP), the connector signs the outgoing request in `HttpClientUtil`.

### Signing Process

1.  **Timestamps**: Generates a fresh `X-OP-Date` (UTC timestamp) and sets `X-OP-Expires`.
2.  **Header Construction**: Gathers query parameters, signed headers, and the request body.
3.  **Signature Generation**:
    *   The `Authorization` object is instantiated with:
        *   `serviceAuthId` and `serviceAuthKey` (from configuration).
        *   HTTP method and request URI.
        *   Signed headers and request body bytes.
    *   It computes the HMAC-SHA256 signature.
4.  **Header Injection**: Adds `X-OP-Date`, `X-OP-Expires`, and the `Authorization` header containing the signature.

### Configuration

Key credentials are stored in `app.properties`:

*   `access_key.<ClientID>`: Keys for inbound verification.
*   `ewallet.service.authorization.id`: The connector's identity when calling downstream.
*   `ewallet.service.authorization.key`: The shared secret for outbound signing.

```mermaid
flowchart TD
    Start[Outbound Request] --> GenHeaders[Generate X-OP-Date and X-OP-Expires]
    GenHeaders --> BuildAuth[Build Authorization Object]
    BuildAuth --> CalcSig[Calculate Signature]
    CalcSig --> SetHeaders[Set Headers on HttpClientRequest]
    SetHeaders --> Send[Send Request]
```
