---
type: concept
title: Instrument Management
description: Explains the concept of an Instrument (e.g., credit card), the registration flow, and bank-specific validation logic.
tags: [instrument, registration, card, payment-method]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:03:17.397Z
sources:
  - id: openwiki-source-10aaa2b53d7b80a058a47bed
    resource: repo://src/main/java/vn/onepay/pspconnector/Main.java
  - id: openwiki-source-497da8d64c5091eb415989b1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java
  - id: openwiki-source-1b68435afc8552960b5a37c6
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommPaymentServiceProvider.java
  - id: openwiki-source-af95b5e131f0f3d768e505e0
    resource: repo://src/main/java/vn/onepay/pspconnector/server/handler/instrument/InstrumentRegistrationHandler.java
  - id: openwiki-source-342250f810d369e837aacf96
    resource: repo://src/main/java/vn/onepay/pspconnector/server/vertical/PSPConnectorVertical.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

# Instrument Management

An **Instrument** in the PSP Connector system represents a payment method, most commonly a credit card or bank account, used to execute transactions.

## Instrument Registration

The registration process handles the capture and validation of instrument details before they can be used for purchases.

### Registration Flow

The entry point for instrument registration is the `InstrumentRegistrationHandler`, which processes HTTP requests (POST to `/instruments`). It delegates to the active `PaymentServiceProvider` implementation, such as `OnecommPaymentServiceProvider`.

1.  **Request Handling**: `InstrumentRegistrationHandler` validates the presence of `user_id` and the request body.
2.  **Provider Delegation**: Calls `instrumentRegistration` on the `PaymentServiceProvider`.
3.  **Two Registration Modes**:
    *   **By Transaction**: If the request contains a `transaction` object (referencing a previous successful transaction), the system looks up the transaction details via `OnecommGateway.searchTxn`.
    *   **By Card**: If no transaction is provided, the system validates the card details directly.

### Card Validation & Bank Logic

When registering a card directly (`instrumentRegistrationByCard`), the system performs specific logic for different instrument types:

*   **Oceanbank Cards (`oceanbank_card`)**:
    *   Sets `card_type` to "ATM".
    *   Sets `auth_method` to "SMS".
*   **VPBank Cards (`vpb_card`)**:
    *   Extracts the mobile number from `channel_user_id`.
    *   Normalizes the number by removing the leading "84" and replacing it with "0".

### Gateway Verification

The system interacts with the Onecomm Gateway (`OnecommGateway`) to verify the card details.
1.  **Bank Identification**: The system identifies the issuing bank based on the card number prefix (BIN).
2.  **Merchant Verification**: A low-value or token authorization request is sent to the bank via the gateway to verify the card's validity (`VERIFY_MERCHANT`).
3.  **State Management**: The instrument is marked with a state (e.g., `APPROVED` or `FAILED`) based on the gateway's response.

```mermaid


sequenceDiagram
    participant Client
    participant Handler as InstrumentRegistrationHandler
    participant Provider as OnecommPaymentServiceProvider
    participant Gateway as OnecommGateway

    Client->>Handler: POST /instruments
    Handler->>Provider: instrumentRegistration(info)
    
    alt By Transaction
        Provider->>Gateway: searchTxn()
        Gateway-->>Provider: Transaction Details
    else By Card
        Provider->>Provider: Validate & Format Card Info
        Provider->>Gateway: verifyCard()
        Gateway-->>Provider: Verification Result
    end
    
    Provider-->>Handler: Instrument State (Approved/Failed)
    Handler-->>Client: 201 Created / 400 Bad Request
```

Caption: Client->>Handler: POST /instruments

## Core Components

*   **`InstrumentRegistrationHandler`**: The HTTP handler that receives registration requests.
*   **`OnecommPaymentServiceProvider`**: The core provider implementation containing the business logic for instrument validation and registration.
*   **`OnecommGateway`**: Handles communication with the external payment network, including card verification and bank selection.

## Data Model

Key fields in an Instrument:
*   `type`: The instrument type (e.g., `oceanbank_card`, `vpb_card`, `card`, `account`).
*   `number`: The card or account number.
*   `name`: The cardholder's name.
*   `month`, `year`: Expiration date components.
*   `cvv`: The Card Verification Value.
*   `mobile_number`: The registered mobile number (critical for OTP/SMS auth flows).

## See Also

*   [Provider System](/openwiki/concepts/provider.md)
*   [Onecomm Gateway Integration](/openwiki/integrations/gateway.md)
