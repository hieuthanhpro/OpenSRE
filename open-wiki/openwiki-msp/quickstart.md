---
type: guide
title: Quickstart
description: Entry point and task router for the MSP codebase. Briefly describes what the system is and points readers to the pages covering connectors, data model, core workflows, security, and configuration.
tags: [quickstart, onboarding, task-routing, msp, payment-system]
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-c1d3ad7d358550973ffa9bb7
    resource: repo://src/main/java/vn/onepay/msp/Config.java
  - id: openwiki-source-2f7c58118401dd4ae7bab7ed
    resource: repo://src/main/java/vn/onepay/msp/connectors/MSPConnector.java
  - id: openwiki-source-da1743c8ff223fc12d243228
    resource: repo://src/main/java/vn/onepay/msp/connectors/PSPConnector.java
  - id: openwiki-source-e5c36d83bef2a94b76981db9
    resource: repo://src/main/java/vn/onepay/msp/connectors/RSPConnector.java
  - id: openwiki-source-65bd1403a19f4e81726ae943
    resource: repo://src/main/java/vn/onepay/msp/Main.java
  - id: openwiki-source-4cd7e20f615762231df1304f
    resource: repo://src/main/java/vn/onepay/msp/Server.java
generated: { by: "openwiki/0.5.2", at: "2026-09-23T03:48:15.044Z" }
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:48:15.044Z
---

# Quickstart

Welcome to the MSP (Merchant Service Provider) codebase. This page serves as your entry point and task router. Before diving into specific areas, read this guide to understand the high-level architecture and know where to look for details on specific topics.

## System Overview

The MSP is a robust, Java-based payment orchestration platform built on Vert.x. It provides a comprehensive API for managing the full lifecycle of payment transactions, from invoice creation to settlement, refunds, and fraud detection.

The platform is designed for extensibility, using a **Strategy Pattern** (connectors) to integrate with various payment service providers (PSPs), banks, and internal services without modifying the core engine.

## Task Routing Map

Depending on your task, refer to the specific conceptual pages below:

### 1. Integrating a New Provider (Connectors)
If you are adding a new payment method, bank integration, or PSP:
*   **Go to**: [Connectors (Strategy Pattern)](/openwiki/concepts/connectors.md)
*   **What you'll learn**: The abstract connector classes (`MSPConnector`, `RSPConnector`, etc.), how to implement a concrete connector, and how the system discovers and loads them via reflection.

### 2. Understanding the Domain (Data Model)
If you need to understand the data structures, relationships, or state transitions of financial entities:
*   **Go to**: [Data Model & Schema](/openwiki/concepts/data-model.md)
*   **What you'll learn**: The structure of `Invoice`, `Payment`, `Instrument`, and `Merchant` objects, their relationships, and the lifecycle states they move through.

### 3. Processing Transactions (Core Workflows)
If you are implementing or debugging business logic for payments, refunds, or invoices:
*   **Go to**: [Core Workflows](/openwiki/workflows/core-workflows.md)
*   **What you'll learn**: The end-to-end flows for Invoice Creation, Payment Processing, Token-Based Payments, Refunds, and QR Code payments.

### 4. Securing and Trusting Transactions (Security & Fraud)
If you are working on authentication, authorization, or risk assessment:
*   **Go to**: [Security & Fraud](/openwiki/workflows/security-and-fraud.md)
*   **What you'll learn**: The OWS, VPC, and HTTP Signature authentication mechanisms, and how the system integrates with Fraud Service Providers (FSP) for real-time risk checks and post-transaction updates.

### 5. Configuring and Deploying (Operations)
If you are setting up the environment, changing runtime settings, or debugging deployment issues:
*   **Go to**: [Configuration & Operations](/openwiki/operations/configuration.md)
*   **What you'll learn**: The structure of `config.json`, database configuration, logging setup, credential management, and the CI/CD deployment pipeline.

## Architecture Snapshot

```mermaid


graph TD
    Client --> API[REST API / Vert.x]
    
    subgraph MSP Core
        API --> Invoices[Invoices Resource]
        API --> Payments[Payments Resource]
        API --> Refunds[Refunds Resource]
        
        Invoices --> Orchestrator[Workflow Orchestrator]
        Payments --> Orchestrator
        Refunds --> Orchestrator
        
        Orchestrator --> Security[Security & Fraud Check]
        Orchestrator --> ConnMgr[Connector Manager]
    end
    
    subgraph Connectors [Strategy Pattern]
        ConnMgr --> MSP_Connector[MSPConnector]
        ConnMgr --> RSP_Connector[RSPConnector]
        ConnMgr --> PSP_Connector[PSPConnector]
    end
    
    subgraph Upstream[Upstream Caller]
        WSP["WSP - Website Service Provider - Vert.x gateway"] --> API
    end

    subgraph Downstream[Downstream Services]
        MSP_Connector --> Banks["Acquirers and Banks"]
        RSP_Connector --> PSPs["Payment Service Providers"]
        PSP_Connector --> PspOnecomm["psp-connector-onecomm - Onecomm and NAPAS"]
        PSP_Connector --> PspKbank["psp-connector-kbank - KBank BNPL"]
        Orchestrator --> Tvsp["TSP Vault (tvsp) - token validation and token payment"]
        Orchestrator --> Onesm["OneSM - crypto and key services"]
        Security --> FSP["Fraud Service Provider (FSP)"]
    end
```

Caption: Client --> API[REST API / Vert.x]

*Architecture snapshot: WSP proxies merchant invoice, payment, refund, and QR requests into MSP, which drives connector strategies over downstream payment services, TSP Vault, OneSM, and fraud checks.*

## Next Steps

1.  **New Developers**: Start with [Data Model & Schema](/openwiki/concepts/data-model.md) to understand the core entities.
2.  **Backend Engineers**: Dive into [Core Workflows](/openwiki/workflows/core-workflows.md) to see how the code orchestrates transactions.
3.  **DevOps/SRE**: Review [Configuration & Operations](/openwiki/operations/configuration.md) for deployment and environment setup.
