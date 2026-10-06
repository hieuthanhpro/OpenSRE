---
type: architecture-concept
title: Provider SPI (Payment & Refund)
description: The PaymentServiceProvider and RefundServiceProvider abstract classes define the pluggable payment-provider SPI used by PSP-Connector to integrate with downstream payment gateways, with Onecomm as the primary implementation.
tags: [payment-provider, spi, onecomm, refund, architecture]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:50:02.660Z
sources:
  - id: openwiki-source-c759e3acaadc3127cdbde195
    resource: repo://src/main/java/vn/onepay/pspconnector/common/rulerefund/RefundRule.java
  - id: openwiki-source-10aaa2b53d7b80a058a47bed
    resource: repo://src/main/java/vn/onepay/pspconnector/Main.java
  - id: openwiki-source-497da8d64c5091eb415989b1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java
  - id: openwiki-source-1b68435afc8552960b5a37c6
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommPaymentServiceProvider.java
  - id: openwiki-source-b44ae043acd7a8a61e1ac0d0
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommRefundServiceProvider.java
  - id: openwiki-source-21fdb8d8a2800ccd3e706ed1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/PaymentServiceProvider.java
  - id: openwiki-source-f8980c71139f7265433def74
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/RefundServiceProvider.java
generated: { by: "openwiki/0.5.2", at: "2026-09-23T03:50:02.660Z" }
---

# Provider SPI (Payment & Refund)

PSP-Connector uses two abstract base classes — `PaymentServiceProvider` and `RefundServiceProvider` — as a lightweight **Service Provider Interface (SPI)** that decouples the HTTP handler layer from any specific payment gateway implementation. Each abstract class declares a set of overridable methods; every un-overridden method throws `METHOD_NOT_SUPPORTED`, so an implementer only needs to support the operations relevant to its gateway. At startup, `Main` instantiates the concrete Onecomm providers and injects them into every HTTP handler that needs them.

## SPI Contracts

### PaymentServiceProvider

`PaymentServiceProvider` (abstract) exposes the full lifecycle of payment-related operations:

| Method | Purpose |
|---|---|
| `getId()` | Returns the provider's logical identifier (e.g. the Onecomm PSP id from config). |
| `instrumentRegistration(rc, instrumentInfoMap)` | Registers or verifies a payment instrument (card). Supports lookup by previous transaction or by raw card details. |
| `paymentPurchase(rc, purchaseRequestMap)` | Initiates a purchase transaction. |
| `applePayNapasPaymentPurchase(rc, purchaseRequestMap)` | Initiates an Apple Pay purchase routed through NAPAS. |
| `authorizationCreate(rc, authorizationMap)` | Creates an authorization record. |
| `authorizationPatch(rc, authorizationMap)` | Updates an authorization (e.g. OTP confirmation for 3-D-Secure style flows). |
| `paymentRefund(rc, refundMap)` | Processes a refund for a previously approved purchase. |
| `applePaymentRefund(rc, refundMap)` | Processes an Apple Pay specific refund. |
| `query(rc)` | Queries transaction details by PSP reference id. |
| `userSearch`, `userRegistration`, `userUpdate`, `deleteInstrument` | User/instrument management stubs (not implemented by Onecomm). |

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/provider/PaymentServiceProvider.java`

### RefundServiceProvider

`RefundServiceProvider` (abstract) covers the expanded domestic/NAPAS refund surface:

| Method | Purpose |
|---|---|
| `paymentRefund(rc, refundMap)` | Standard refund: determines auto vs manual via `RefundRule`, then calls Onecomm gateway or records a manual result. |
| `paymentNPRefund(rc, refundMap)` | NAPAS-specific refund (CDR path) with bank-id validation. |
| `paymentRefundAuto(rc, refundMap)` | Explicit auto-refund path; validates bank config supports auto. |
| `paymentRefundManual(rc, refundMap)` | Records a manual refund directly as approved in both Onecomm and PSP-Connector databases. |
| `paymentRefund4B(rc, refundMap)` | BIDV (4B) acquisition flow: creates a pending (status 210) record for CDR file generation. |
| `updateRefund(rc, refundMap)` | Updates a pending refund to approved or failed, with extensive state-machine guards. |
| `queryCheckTypeRefund(rc, refundMap)` | Returns whether a refund should be processed as auto or manual for a given payment, without executing it. |

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/provider/RefundServiceProvider.java`

## Default Throw-Not-Supported Pattern

Every method in both abstract classes has the same default body:

```java
throw new RuntimeException("METHOD_NOT_SUPPORTED");
```

This means the SPI is opt-in: any new gateway implementation only needs to override the methods it supports. If a handler calls an unsupported method, the exception propagates up to `ExceptionHandler`, which returns an appropriate error response.

## How the SPI Is Wired

During application bootstrap in `Main.main()`, concrete provider instances are created and assigned to the handler classes via static fields:

```
OnecommPaymentServiceProvider onePayPaymentServiceProvider = new OnecommPaymentServiceProvider()
        .setId(p.getProperty("onepay.psp.id"))
        .setVerifyCardMerchant(new MerchantDTO(...));
OnecommRefundServiceProvider onecommRefundServiceProvider = new OnecommRefundServiceProvider();

InstrumentRegistrationHandler.paymentServiceProvider = onePayPaymentServiceProvider;
PurchaseHandler.paymentServiceProvider       = onePayPaymentServiceProvider;
PurchaseGetHandler.paymentServiceProvider    = onePayPaymentServiceProvider;
ApplePayNapasPurchaseHandler.paymentServiceProvider = onePayPaymentServiceProvider;
AppleRefundPostHandler.paymentServiceProvider = onePayPaymentServiceProvider;
AuthorizationPatchHandler.paymentServiceProvider = onePayPaymentServiceProvider;
RefundPostHandler.paymentServiceProvider     = onePayPaymentServiceProvider;

RefundHandler.refundServiceProvider = onecommRefundServiceProvider;
```

HTTP handlers (e.g. `PurchaseHandler`, `RefundHandler`) receive a Vert.x `RoutingContext`, deserialize the request body into a `Map`, and delegate to the appropriate provider method. The handler layer is provider-agnostic — it never references Onecomm classes directly.

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/Main.java#L105-L131`

## Onecomm Payment Flow

`OnecommPaymentServiceProvider` is the sole production implementation. Its payment purchase flow works as follows:

1. **Instrument Registration** — Two paths: *by transaction* (looks up a previous approved payment via `OnecommGateway.searchTxn`) or *by card* (sends card details to `OnecommGateway.verifyCard` with a small 5,000 VND verify-charge against a dedicated `verifyCardMerchant`).

2. **Purchase** — Extracts request parameters, inserts an initial payment record via `PaymentService.insert`, builds a JSON request, and for domestic transactions runs a fraud check through the FSP-Go service before calling `OnecommGateway.verifyCard`.

3. **Apple Pay NAPAS Purchase** — Similar to purchase but includes Apple Pay specific fields (`payment_method`, `payment_data_decrypt`, `create_token`). Always runs fraud check (domestic). Calls `OnecommGateway.verifyCard` with the Apple Pay payload, then stores NAPAS-specific extension data (`paygate=applepay_napas`).

4. **Authorization Patch** — Handles 3-D-Secure / OTP style authentication callbacks. Calls `OnecommGateway.updateAuth`, then updates both authorization and payment state. Extracts settlement or rejection reason from the Onecomm response.

5. **Refund (on PaymentServiceProvider)** — Used by the legacy `RefundPostHandler` and Apple refund paths. Inserts a refund record, sends to Onecomm, and maps Onecomm response codes (200=failed, 300=pending, 400=approved) to PSP states.

6. **Query** — Looks up a payment by reference, then for NAPAS banks queries the NAPAS gateway via `NapasGateway.query()` to get real-time transaction status.

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommPaymentServiceProvider.java#L60-L869`

## Onecomm Refund Flow

`OnecommRefundServiceProvider` handles the more complex domestic refund surface:

### Auto vs Manual Decision

Before processing any standard refund, the system calls `RefundRule.isManual()` which evaluates bank-specific rules:

- **BIDV**: auto if within 180 days of payment; manual otherwise.
- **MBBank**: auto if the original payment has `mbbank_txn_info.bank_request_id` in its extension data; manual otherwise.
- **AnBinhBank**: auto only if refund is same-day as payment AND for the full amount.
- **BacABank / DongABank**: bank-specific one-time or settlement checks.
- **NAPAS banks**: auto within 300 days.
- **VNPTMoney / VietinBank**: auto within 90 days.

If the rule returns "not supported" (bank not configured), the refund throws `INVALID_REFUND`, allowing the MSP to update it to Failed.

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/common/rulerefund/RefundRule.java#L25-L129`

### Auto Refund Path

1. Insert a `PENDING` refund record in `RefundDB`.
2. Build a `RefundRequest` with the Onecomm transaction id, merchant id, amount, and operator metadata.
3. Call `OnecommGateway.refundExtend()`.
4. Map Onecomm response codes: 200 → `FAILED`, 300 → `PENDING`, 400 → `APPROVED`.
5. Update the refund record and return the response.

### Manual Refund Path

1. Insert a refund transaction log in `OnecommDB` with status 400 (manual approved).
2. Insert an `APPROVED` refund record in `RefundDB` with `process_type=manual`.
3. Return the result immediately — no gateway call is made.

### NAPAS Refund (`paymentNPRefund`)

Validates that the bank id is in the NAPAS bank list, builds a `RefundNPRequest`, calls `OnecommGateway.refundNP()`, and maps the response similarly.

### Refund State Machine (`updateRefund`)

The `updateRefund` method allows an external MSP to transition a pending refund to approved or failed. It enforces strict state guards:
- Cannot update a refund that already reached a terminal state (approved/failed) to a different state.
- Cannot approve a refund that has no corresponding Onecomm transaction log.
- Cannot fail a refund that was already approved upstream (status 400 at Onecomm).
- For pending-2 (status 300) refunds, updating transitions the Onecomm log to 400 (approved) or 200 (failed).

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommRefundServiceProvider.java#L36-L650`

## Gateway Integration Layer

Both providers delegate HTTP communication to two gateway classes:

- **`OnecommGateway`** — Handles all Onecomm payment service calls (verify card, refund, Apple refund, auth update, search transaction). It builds request parameters, signs them with HMAC (`Util.createGatewayHash`), and makes HTTP calls via the shared Vert.x `HttpClient`. Located at `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java`.

- **`NapasGateway`** — Handles NAPAS-specific query calls for domestic transaction status lookups. Manages OAuth2 token caching per CAIC, with automatic token refresh. Located at `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/NapasGateway.java`.

## Data Layer

Provider methods use several data-access classes:

- **`PaymentService` / `RefundService` / `AuthorizationService`** — Service-layer CRUD operations backed by the `PSP_CONNECTOR` datasource.
- **`RefundDB`** — Extended refund operations via Oracle stored procedures (`PKG_REFUND_EXTEND`).
- **`OnecommDB`** — Onecomm-specific transaction log CRUD (refund logs, settlement queries).
- **`DB`** — Onecomm merchant config, transaction extension data, and refund extension data lookups.
- **`PspConnectorDB`** — Payment lookup by reference for the query endpoint.
- **`Payment2DB`** — Cross-database transaction lookups from the separate `PAYMENT2` datasource.

## Configuration

Provider behavior is driven by system properties loaded from `app.properties`:

- `onepay.psp.id` — The provider's PSP identifier.
- `verify_card.merchant_id`, `verify_card.access_code`, `verify_card.hash_code` — Merchant credentials for the card verification micro-transaction.
- `refund.bank.<bankId>` — Per-bank refund process type (`auto` or `manual`).
- `napas.bank` — Regex pattern listing NAPAS-eligible bank IDs.
- `onecomm_service_url` — Base URL for Onecomm payment service.
- `fsp-go.service.*` — Fraud service (FSP-Go) connection settings.

**Evidence:** `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/Config.java`

## Error Handling and State Mapping

Onecomm uses numeric status codes that the providers map to PSP-connector states:

| Onecomm Code | PSP Payment State | PSP Refund State |
|---|---|---|
| 200 | — | `FAILED` (bank declined) |
| 300 | `AUTHORIZATION_REQUIRED` | `PENDING` |
| 400 | `APPROVED` | `APPROVED` |

For payments, `AUTHORIZATION_REQUIRED` triggers creation of an authorization record with OTP/approval links. For refunds, the mapping is consistent across all refund paths (standard, NAPAS, Apple).

Gateway-specific error codes from NAPAS are classified into categories (invalid card, system error, limited amount, invalid OTP, bank declined, timeout) for logging and diagnostic purposes in `NapasGateway`.

## Extension Points

The SPI design makes it straightforward to add new gateway integrations:

1. Create a new class extending `PaymentServiceProvider` (and/or `RefundServiceProvider`).
2. Override only the methods the new gateway supports.
3. In `Main`, instantiate the new provider and assign it to the relevant handlers.

Currently only Onecomm is implemented. The abstract classes with their throw-not-supported defaults serve as the extension boundary.
