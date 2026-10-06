---
type: strategy pattern
title: Connectors (Strategy Pattern)
description: Explains the connector strategy pattern used throughout the MSP system, listing the abstract base types and the concrete implementations per provider, plus the reflection-based initialization in Main.java.
tags: [strategy pattern, connectors, msp, payment processing]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:48:15.044Z
sources:
  - id: openwiki-source-c1d3ad7d358550973ffa9bb7
    resource: repo://src/main/java/vn/onepay/msp/Config.java
  - id: openwiki-source-089e88ed4ee07cbf5c5ab475
    resource: repo://src/main/java/vn/onepay/msp/connectors/BillRspConnector.java
  - id: openwiki-source-28b7518eb089399002edfd33
    resource: repo://src/main/java/vn/onepay/msp/connectors/ClientConnector.java
  - id: openwiki-source-05aed847153e026a0c8f5edb
    resource: repo://src/main/java/vn/onepay/msp/connectors/CSPConnector.java
  - id: openwiki-source-022f6b19beb8d6a934846bae
    resource: repo://src/main/java/vn/onepay/msp/connectors/MerchantConnector.java
  - id: openwiki-source-2f7c58118401dd4ae7bab7ed
    resource: repo://src/main/java/vn/onepay/msp/connectors/MSPConnector.java
  - id: openwiki-source-da1743c8ff223fc12d243228
    resource: repo://src/main/java/vn/onepay/msp/connectors/PSPConnector.java
  - id: openwiki-source-e5c36d83bef2a94b76981db9
    resource: repo://src/main/java/vn/onepay/msp/connectors/RSPConnector.java
  - id: openwiki-source-1ed56494d564c5e41904f19f
    resource: repo://src/main/java/vn/onepay/msp/connectors/VoidConnector.java
  - id: openwiki-source-65bd1403a19f4e81726ae943
    resource: repo://src/main/java/vn/onepay/msp/Main.java
generated: { by: "openwiki/0.5.2", at: "2026-09-23T03:48:15.044Z" }
---

The MSP (Merchant Service Provider) system implements the Strategy Pattern to decouple payment processing logic from specific provider integrations. This architecture allows the system to support various third-party payment providers (PSPs), banks, and internal services through a pluggable and extensible architecture.

## Core Concept

The system defines a set of abstract connector classes (strategies) that outline the operations required for different stages of a transaction lifecycle. Concrete implementations of these classes encapsulate the specific logic for interacting with a particular provider.

This approach ensures that the core payment processing logic remains consistent, while integration details are isolated to new connector classes. New providers can be supported by simply adding new connector implementations without modifying the core engine.

## Abstract Connectors

The system defines several abstract connector classes in `src/main/java/vn/onepay/msp/connectors/`, each representing a specific role or operation type:

### MSPConnector
The primary interface for Merchant Service Providers. It handles the core creation and management of invoices and payments.
*   `createInvoice`: Initializes a new transaction.
*   `getInvoice`: Retrieves invoice details.
*   `createPayment`: Processes a payment for an existing invoice.
*   `updatePayment`: Updates the state of a payment (e.g., settlement, capture).

### RSPConnector (Refund Service Provider)
Handles refund operations.
*   `createRefund`: Initiates a refund.
*   `createRefund2`: Initiates a refund with additional PSP request parameters (optional override).
*   `enquiryRefund`: Checks the status of a refund.

### CSPConnector (Capture Service Provider)
Manages capture operations, typically used in delayed capture scenarios.
*   `createCapture`: Captures funds.
*   `enquiryCapture`: Checks capture status.
*   `retryCapture`: Retries a failed capture.

### PSPConnector (Payment Service Provider)
Deals with approval and OTP verification flows.
*   `approveOrder`: Approves an order.
*   `voidOrder`: Voids an order at the PSP level.
*   `verifyOTP`: Verifies a one-time password.

### VoidConnector
Handles void transactions.
*   `createVoid`: Initiates a void.
*   `enquiryVoid`: Checks void status.

### BillRspConnector
Handles refund operations specifically for billing integrations.
*   `createRefund`: Initiates a bill refund.

### MerchantConnector
Provides merchant-specific logic.
*   `checkInvoice`: Checks or validates invoice details against merchant-specific rules.

### ClientConnector
A base for client-specific logic.
*   `refund`: Provides a default no-op implementation for refunds unless overridden by a concrete client connector.

## Concrete Implementations

Concrete connectors are organized into subdirectories based on the provider type or category:

### `notonus/`
Contains implementations for external providers where OnePAY is not the merchant of record or for specific bank integrations.
*   **BIDV**: `BIDVMsp` (MSP), `BIDVRsp` (RSP) - BIDV Bank integration.
*   **E-Shop**: `EShopMsp` (MSP) - E-Service Provider integration.
*   **ESP**: `ESPMsp` (MSP) - ESP integration.
*   **VCB**: `VCBMsp` (MSP) - Vietcombank integration.
*   **OneComm**: `OnecommMsp` (MSP) - Internal OneComm integration.
*   **Momo**: `MoMoRsp`, `MoMoRspV2` (RSP) - MoMo integration.
*   **MSB**: `MsbRsp` (RSP) - MSB integration.
*   **ShopeePay**: `ShopeepayRsp` (RSP) - ShopeePay integration.
*   **SmartPay**: `SmartPayRsp` (RSP) - SmartPay integration.
*   **UnionPay**: `UnionpayQrRsp` (RSP), `UnionpayQrVoid` (Void) - UnionPay QR integration.
*   **VIB**: `VIBRsp` (RSP) - VIB integration.
*   **Vietin**: `VIETINQRRsp` (RSP) - VietinBank QR integration.
*   **ZaloPay**: `ZalopayRsp` (RSP) - ZaloPay integration.

### `onus/`
Contains implementations where OnePAY acts as the Merchant of Record or handles the core processing.
*   **OnePAY**: `OnePAYMsp` (MSP) - The primary internal connector for OnePAY transactions.
*   **OnePAY RSP**: `OnePAYRsp` (RSP) - Internal refund processing.
*   **OnePAY WSP**: `WSPRsp` (RSP), `WSPCsp` (CSP), `WSPVoid` (Void) - WSP specific integrations.

### `merchants/`
Contains connector implementations for specific merchant needs.
*   **ChuDu**: `ChuDu` (MerchantConnector) - Specific logic for the ChuDu merchant.

### `onebill/`
Contains implementations for specific billing integrations.
*   **VCB**: `VcbRsp` (BillRspConnector) - VCB billing refund connector.
*   `Convert` - Utility class for data conversion.

## Initialization and Injection

The system uses a dynamic initialization process in `Main.java` using reflection:

1.  **Configuration Loading**: Connector definitions are loaded from the configuration file (`config.json`). Each connector type has a corresponding configuration array (e.g., `mspConnectors`, `rspConnectors`).
2.  **Reflection-Based Instantiation**: The system iterates over the configuration array. For each entry, it reads the fully qualified class name (`class`), retrieves the constructor, and instantiates the connector, passing the `id` and `properties`.
3.  **Registry**: Instantiated connectors are stored in static lists within `Main` (e.g., `Main.mspConnectors`, `Main.rspConnectors`, `Main.cspConnectors`, etc.).

```mermaid


sequenceDiagram
    participant Main
    participant Config
    participant Reflection as Java Reflection
    participant Registry as Static Lists

    Main->>Config: getMspConnectors()
    Config-->>Main: List of Connector Configs
    loop For each config
        Main->>Reflection: Class.forName(className)
        Reflection-->>Main: Class object
        Main->>Reflection: getConstructor(String, JsonObject)
        Reflection-->>Main: Constructor
        Main->>Reflection: constructor.newInstance(id, properties)
        Reflection-->>Main: Connector Instance
        Main->>Registry: Add to list (e.g., mspConnectors)
    end
```

Caption: Main->>Config: getMspConnectors

*Startup sequence: Main instantiates each configured connector class via reflection and registers it in the static connector lists.*

## Usage in Processing Flow

When a request arrives (e.g., create invoice), the system iterates through the registered connectors to find one that can handle the specific request type or merchant configuration.

```mermaid


sequenceDiagram
    participant Caller as Caller (WSP gateway or merchant client)
    participant Server as MSP Server
    participant Connector as Selected connector (for example BIDVMsp)
    participant External as External PSP or bank
    participant Tvsp as TSP Vault (tvsp)

    Caller->>Server: Request (Create Invoice)
    Server->>Server: Select appropriate MSPConnector
    Server->>Connector: createInvoice()
    Connector->>External: API Call (for example BIDV API)
    External-->>Connector: Response
    Connector-->>Server: InvoiceDTO
    Server-->>Caller: Transaction Result
    opt Token payment requested
        Server->>Tvsp: Validate token and pay with token
        Tvsp-->>Server: Payment result
        Server-->>Caller: Updated payment state
    end
```

Caption: Caller->>Server: Request Create Invoice

*Request flow: an upstream caller reaches MSP, which selects a connector strategy to talk to the provider, and delegates tokenized payments to TSP Vault.*

This architecture enables the MSP system to scale and adapt to new payment methods or provider requirements with minimal changes to the core codebase.
