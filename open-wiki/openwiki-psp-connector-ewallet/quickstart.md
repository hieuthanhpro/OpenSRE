---
type: navigation
title: Quickstart
description: Entry-point navigation for the psp-connector-ewallet wiki. Maps the system so a coding agent can jump to the right page fast.
tags: [navigation, quickstart, onboarding, psp-connector-ewallet]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-30T08:38:20.900Z
sources:
  - id: openwiki-source-e741b26e48d7317009502310
    resource: repo://catalog-info.yaml
  - id: openwiki-source-49116f2c31819931a7a0f662
    resource: repo://src/main/java/vn/onepay/psp/server/vertical/PspVertical.java
generated: { by: "openwiki/0.5.2", at: "2026-09-30T08:38:20.900Z" }
---

# Quickstart

This page is the entry point for the `psp-connector-ewallet` wiki. It provides a compact task-routing map so you can quickly find the right documentation page for your needs.

## System Overview

`psp-connector-ewallet` is a Java service that acts as a secure gateway between clients and an external e-wallet provider (specifically VietComBank TSP). It receives signed requests, validates them, and forwards them to the e-wallet service after transformation and signing.

## Wiki Map

Use the map below to navigate directly to the most relevant page for your task.

### Architecture & Design
- **[Architecture overview](/openwiki/architecture/overview.md)**
  - Service shape, startup flow, runtime topology, package boundaries, and extension points.
- **[Package map](/openwiki/architecture/package-map.md)**
  - Detailed mapping of Java packages to responsibilities.

### Workflows
- **[Instrument registration workflow](/openwiki/workflows/instrument-registration.md)**
  - End-to-end trace of the only active business flow: client request → upstream ewallet call → final response mapping.
- **[Request pipeline](/openwiki/workflows/request-pipeline.md)**
  - The shared Vert.x router chain that every inbound request passes through (logging, auth, routing, failure handling).

### Integrations & Security
- **[Ewallet downstream integration](/openwiki/integrations/ewallet-service.md)**
  - Details on the external TSP service, request shape, signing, and failure assumptions.
- **[Security and signatures](/openwiki/concepts/security-and-signatures.md)**
  - Explanation of inbound OWS1 HMAC-SHA256 verification and outbound signed requests.

### Operations & Reference
- **[Configuration and startup](/openwiki/operations/configuration.md)**
  - Documentation of `app.properties`, database pools, server settings, and external service config.
- **[Error model](/openwiki/operations/error-model.md)**
  - How exceptions, `SystemError` constants, and HTTP status codes map together.
- **[API reference](/openwiki/reference/api-reference.md)**
  - The current HTTP API surface (routes, methods, request bodies).

## Technology Stack

- **Language**: Java 8
- **Framework**: Vert.x 3.5.4
- **Database**: Oracle (HikariCP for connection pooling)
- **Security**: OWS1 HMAC-SHA256 (OnePAY Signature Library)
- **Serialization**: Jackson
- **Logging**: Log4j2

## Key Entry Points

- **Main class**: `vn.onepay.psp.Main` - Process entrypoint and composition root.
- **Verticle**: `vn.onepay.psp.server.vertical.PspVertical` - HTTP server lifecycle.
- **Business Logic**: `vn.onepay.psp.server.handler.instrument.InstrumentPostHandler` - The core handler for instrument registration.
