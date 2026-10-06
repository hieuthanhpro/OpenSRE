---
type: architecture
title: Routing and Request Handling
description: Defines the Vert.x Router setup, URI prefixes, middleware chain, and route map for WSP request handling.
tags: [routing, middleware, API, vertx, server]
sources:
  - id: openwiki-source-c46b6abd36e5594da925dd69
    resource: repo://src/main/java/vn/onepay/wsp/Config.java
  - id: openwiki-source-9b2d1464656ae8fb78747ef9
    resource: repo://src/main/java/vn/onepay/wsp/Server.java
generated: { by: "openwiki/0.5.2", at: "2026-09-22T08:16:48.713Z" }
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T08:58:44.659Z
---

# Routing and Request Handling

The `Server` Verticle (`src/main/java/vn/onepay/wsp/Server.java`) is the entry point for the HTTP server. It configures the Vert.x `Router` to handle incoming requests, establishing the middleware chain and mapping URLs to service handlers.

## URI Prefix Configuration

The application supports multiple API styles and client generations, distinguished by configurable URI prefixes defined in `src/main/java/vn/onepay/wsp/Config.java` and `src/main/resources/config.json`.

| Variable | Configuration Key | Default | Description |
| :--- | :--- | :--- | :--- |
| `prefix` | `server.uri_prefix` | `/paygate/api/v1` | Primary JSON API (RESTful). |
| `prefixVpc` | `server.uri_prefix_vpc` | `/paygate/api/vpc/v1` | Form-encoded VPC-style API. |
| `vpcPrefix` | `server.vpcpay` | `/vpcpay` | Legacy VPC merchant verification. |
| `migrationTsp` | `server.migration_uri_prefix` | `/tsp/api/v2` | TSP migration endpoints. |

*Note: `prefixVpc` handles `application/x-www-form-urlencoded` data, while `prefix` primarily handles `application/json`.*

## Middleware Chain

Global middleware is registered in `Server.start()` using `router.route()`, ensuring every request passes through these handlers in order:

1.  **BodyHandler**: `BodyHandler.create()` enables request body buffering, allowing the server to read headers and body multiple times if necessary.
2.  **Request Logging**: `Util::logRequest` logs the method, URI, and headers/body (masking sensitive data).
3.  **Failure Handling**: `Util::failureResponse` acts as the global exception handler, converting `ErrorException` instances or unexpected throws into standard JSON error responses.
4.  **Metrics**: `Util::metricsMiddleware(appMetrics)` collects operational metrics:
    *   Active connection counts.
    *   Response times (latency).
    *   Total request counts.
    *   Error rates (HTTP status >= 400).

## Route Map

The application routes are extensive, organized by functional domain.

### Invoices

Handles invoice creation, retrieval, and lifecycle management.

*   **Create**: `POST {prefix}/invoices` (JSON), `POST /invoices` (Form), `POST {prefix}/iframe/invoices`.
*   **Retrieve**: `GET {prefix}/invoices`, `GET {prefix}/invoices/:id`.
*   **Update**: `PATCH {prefix}/invoices/:id` (Close).
*   **Delete**: `DELETE {prefix}/invoices/:id` (Cancel).
*   **VPC 2D**: `POST {prefix}/vpc/international/silent/invoices` (Form, FPT TV), `POST /paygate/api/vpc/v1/merchants/:merchant_id/purchases/:merchTxnRef`.

### Payments

Processes payments against invoices, including standard and tokenized flows.

*   **Create Payment**: `POST {prefix}/invoices/:id/payments`.
*   **Token Payment**: `POST {prefix}/invoice/:id/payment`.
*   **Update**: `PATCH {prefix}/payments/:id`.
*   **Cancel**: `DELETE {prefix}/payments/:id`.

### Authorizations

Handles 3D Secure or OTP-based authorization workflows.

*   **Update**: `POST {prefix}/authorizations/:authorization_id` (Form), `GET {prefix}/authorizations/:authorization_id`.
*   **TSP Compatible**: `POST {prefix}/payment/authorizations/:authorization_id`.
*   **JSON Update**: `PATCH {prefix}/authorizations/:id`, `POST {prefix}/authorizations/:id`.

### QR Payments

Supports various QR code payment standards.

*   **Create QR**: `POST {prefix}/invoices/:id/qrs`.
*   **VietQR**: `POST {prefix}/invoices/:id/payments_vietqr` (Create), `PATCH`/`DELETE` (Cancel).
*   **VietQR Pay**: `POST {prefix}/invoices/:id/vietqrpay`.
*   **ZaloPay**: `PATCH {prefix}/invoices/:invoice_id/payments_zalopay/:payment_id`.

### Migration & Legacy

Routes for migrating from legacy systems (ONECOMM, ONECREDIT) and TSP integration.

*   **Migration**: `GET {prefix}/migration/:gateway`, `POST {prefix}/migration/payment`.
*   **TSP Proxy**: `GET/POST {migrationTsp}/...` (e.g., `/tsp/api/v2/users`, `/payments`, `/instruments`).
*   **Legacy VPC**: `GET /vpcpay/vpcpay.op`, `POST /vpcpay/vpcpost.op`.

### Partner Integrations

Integration routes for specific payment partners.

*   **KBank**: `PUT {prefix}/merchants/:merchant_id/kbank/verify-otp`.
*   **HomeCredit**: `POST {prefix}/homecredit/ipn`.
*   **Kredivo**: `POST {prefix}/kredivo/ipn/:payment_id`.
*   **Viettel QR**: `POST {prefix}/viettelqr/authorize`.
*   **Amigo**: `POST {prefix}/merchants/:merchant_id/amigo/info`.
*   **OH Credit**: `PUT {prefix}/merchants/:merchant_id/api/disbursement/loan`.

### Wallets

Routes for mobile wallet integrations.

*   **Apple Pay**: `POST {prefix}/merchants/:merchant_id/invoices/:invoice_id/applepay-sessions`, `POST .../applepay-payments`.
*   **Google Pay**: `POST {prefix}/merchants/:merchant_id/invoices/:invoice_id/googlepay-payments`.
*   **Samsung Pay**: `POST {prefix}/merchants/:merchant_id/invoices/:invoice_id/samsungpay-payments`.

### Big Merchant APIs

A distinct set of VPC-style routes for high-volume merchants, supporting granular operations like captures, refunds, and voids.

*   **Capture**: `PUT {prefix}/vpc/merchants/:merchant_id/authorizations/:orgMerchTxnRef/captures/:merchTxnRef`.
*   **Refund**: `PUT {prefix}/vpc/merchants/:merchant_id/purchases/:orgMerchTxnRef/refunds/:merchTxnRef`.
*   **Void**: `PUT {prefix}/vpc/merchants/:merchant_id/purchases/:orgMerchTxnRef/voids/:merchTxnRef`.
*   **Credentials**: `POST {prefix}/vpc/merchants/:merchant_id/credentials`.

### Miscellaneous

*   **Health Check**: `GET {prefix}/health-check` (Vert.x HealthCheckHandler).
*   **Validation**: `GET /invoices` (Validates request).
*   **BIN Lookup**: `GET {prefix}/checkbin/:bin_num`.
*   **Promotions**: `POST {prefix}/promotions/query`.

## Route Summary Table

| Method | Path Pattern | Handler | Content Type |
| :--- | :--- | :--- | :--- |
| `POST` | `/invoices` | `InvoiceService::create` | Form / JSON |
| `GET` | `/paygate/api/v1/invoices/:id` | `InvoiceService::getInvoice` | JSON |
| `POST` | `/paygate/api/v1/invoices/:id/payments` | `PaymentService::create` | JSON |
| `POST` | `/paygate/api/v1/invoices/:id/qrs` | `QRService::create` | JSON |
| `POST` | `/paygate/api/v1/invoices/:id/payments_vietqr` | `QRService::createVietQr` | JSON |
| `GET` | `/paygate/api/v1/health-check` | `HealthCheckHandler` | - |
| `POST` | `/paygate/api/v1/homecredit/ipn` | `HomeCreditService::ipn` | JSON |
| `POST` | `/paygate/api/v1/kredivo/ipn/:payment_id` | `KredivoService::ipn` | JSON |
| `PUT` | `/paygate/api/v1/merchants/:merchant_id/kbank/verify-otp` | `KBankService::verifyOtp` | JSON |
| `POST` | `/paygate/api/v1/merchants/:merchant_id/invoices/:invoice_id/applepay-payments` | `PaymentServiceApple::create` | JSON |
