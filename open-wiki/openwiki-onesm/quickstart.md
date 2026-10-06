---
type: "Guide"
title: "Quickstart"
description: "Entry point for navigating the onesm repository and its wiki: a compact map of the Maven/Java 11 Netty HTTP crypto service, its layered components, and links to the architecture, concept, workflow, operations, and testing pages."
tags: [quickstart, navigation, onepay, onesm, http, crypto, java]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-24T11:53:15.318Z
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-3d1f45a24ded30320241b951
    resource: repo://src/main/java/com/onepay/onesm/Crypto.java
  - id: openwiki-source-24b1ecaae5616981fe611863
    resource: repo://src/main/java/com/onepay/onesm/http/HttpServer.java
  - id: openwiki-source-80dcd0d134e9c6d0207eda7f
    resource: repo://src/main/java/com/onepay/onesm/http/HttpServerHandler.java
  - id: openwiki-source-b7a68e3af21b80ae4902c593
    resource: repo://src/main/java/com/onepay/onesm/jmx/ConsoleMXBeanImpl.java
  - id: openwiki-source-e771b75feaa52f1ca0d53ce1
    resource: repo://src/main/java/com/onepay/onesm/Main.java
  - id: openwiki-source-d4ea2d826a2e2073bce045ae
    resource: repo://src/main/java/com/onepay/onesm/SecureKS.java
  - id: openwiki-source-175ae5a411fa6816c78b4609
    resource: repo://src/test/java/Decrypt.java
  - id: openwiki-source-f6e1873df815d079934a1f9f
    resource: repo://src/test/java/EncryptOnecommCards.java
generated: { by: "openwiki/0.5.2", at: "2026-09-24T11:53:15.318Z" }
---

# Quickstart

`onesm` (`com.onepay:onesm:1.20230312`) is a Java 11 HTTP cryptographic service
built on Netty. It exposes a small, HMAC-authenticated HTTP API that encrypts and
decrypts payloads using keys held in an encrypted JCEKS keystore. This page is a
navigation map: read it first to understand where the code lives and which wiki
page covers which concern.

## What this repo contains

The repository is a single Maven module. The production code all lives under
`src/main/java/com/onepay/onesm/` and is organized into four layers:

| Layer | Package | Responsibility |
|-------|---------|----------------|
| **Crypto** | `com.onepay.onesm.Crypto` | Stateless JCE primitives: AES/CBC/PKCS5, RSA/ECB/PKCS1, HMAC-SHA256, SHA-256, hex helpers |
| **SecureKS** | `com.onepay.onesm.SecureKS` | JCEKS keystore facade plus Guava `LoadingCache`s for keys and certificates |
| **HttpServer** | `com.onepay.onesm.http` | Netty HTTP transport: `HttpServer`, `HttpServerInitializer`, `HttpServerHandler` |
| **JMX** | `com.onepay.onesm.jmx` | `ConsoleMXBean` (deferred startup) and `GuavaCacheMXBean` (cache statistics) |

The entry point is `com.onepay.onesm.Main`, which decides startup mode from the
`app.master_key` and `app.port` system properties.

The build compiles for Java 11 and copies dependencies into `target/lib`, so the
service runs from `classes` plus a flat `lib` of jars. Tests are skipped in the
build (`<skipTests>true</skipTests>`); the `src/test/java` tree is a set of
standalone `main()` operator utilities, not a JUnit suite.

## Navigating the wiki by concern

### Architecture

Start with the [System Overview](/openwiki/architecture/overview.md) for the
whole picture: the four component boundaries (Crypto, SecureKS, HttpServer,
JMX), the build and runtime shape, and the end-to-end request path from a
client request through the Netty handler to the keystore and crypto primitives
and back as a signed response. It also lists the key invariants and failure
semantics (authentication is mandatory, algorithms are dispatched by key type,
decryption is AES-only).

### Concepts

Two concept pages explain the two foundational layers:

- [Crypto Operations](/openwiki/concepts/crypto-operations.md) documents the
  primitive library: AES/CBC/PKCS5 with the IV prepended to the ciphertext,
  RSA/ECB/PKCS1, HMAC-SHA256, SHA-256 base64 url-safe hashing, hex helpers, and
  the AES key-length validation rules (16/24/32 bytes) with their failure modes.
- [Key Management and SecureKS](/openwiki/concepts/key-management.md) covers the
  JCEKS keystore lifecycle, the master-key-protected load path, the Guava
  `LoadingCache`s (1000 entries, 5-minute idle expiry), the `client.*` and
  `http_client.*` aliases, and the JMX cache-statistics exposure.

### Workflows

The two workflow pages describe the HTTP behavior:

- [Encryption and Decryption Endpoints](/openwiki/workflows/encryption-decryption-endpoints.md)
  covers the `POST /encryptions` and `POST /decryptions` contract: accepted JSON
  body fields (`data`, `key`, `public_key`), key resolution, algorithm dispatch
  (HMACSHA256, AES, RSA), and the shared JSON error contract.
- [HTTP Request and Response Signing](/openwiki/workflows/http-request-auth.md)
  documents the HMAC-SHA256 authentication gate: the `Authorization`/
  `X-Authorization` header format, the request and response string-to-sign
  construction, the `X-Secure-Hash` response signing, and how per-client keys
  are resolved from `http_client.*` keystore aliases.

### Operations

- [Deployment and Startup](/openwiki/operations/deployment-and-startup.md)
  documents the two startup modes (master-key present via `app.master_key`, or
  deferred through the `ConsoleMXBean.setMasterKey` JMX call), the
  `app.master_key`/`app.port`/`app.log` system properties and JUL-to-Log4j2
  logging bridge, the systemd/jsvc/prunsrv packaging matrix, and the
  `sync_prod` build-and-deploy workflow.

### Testing

- [Token Migration and Utility Tools](/openwiki/testing/token-migration-tools.md)
  documents the `main()`-driven `src/test/java` utilities used for decryption
  verification, AES/HMAC key generation, and bulk card and token migration
  against Oracle databases, including the hardcoded master key and credentials
  carried in source and their operational risk.

## Suggested reading order

For a coding agent new to the repo:

1. Read the [System Overview](/openwiki/architecture/overview.md) to build the
   mental model of the four layers and the request flow.
2. Read the two concept pages to understand the primitives and key handling.
3. Read the two workflow pages to understand what the HTTP surface does and how
   it authenticates requests.
4. Consult the operations and testing pages only when you need to start/deploy
   the service or run the utility scripts.

## Boundaries and gotchas

- **Authentication is mandatory.** Every request must carry a valid signed
  `Authorization` header; failures yield `401` before any crypto route runs.
- **Algorithm is chosen by key, not by request.** The resolved key's algorithm
  dispatches to HMAC, AES, or RSA. Decryption is AES-only.
- **HTTP content is not aggregated.** The Netty pipeline has no
  `HttpObjectAggregator`; `HttpServerHandler` accumulates `HttpContent` chunks
  itself until `LastHttpContent`.
- **`src/test` is not a test suite.** Tests are disabled in the build; those
  files embed secret material and are operator scripts, not repeatable checks.
