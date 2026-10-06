---
type: concept
title: Bank Integrations and NAPAS
description: Bank-specific integrations, NAPAS domestic routing, and QR service behavior within the WSP platform.
tags: [bank, napas, qr, vietqr, vrb, deeplink, domestic-routing]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T08:58:44.659Z
sources:
  - id: openwiki-source-bb6fb14d19ef1f6902ee1f99
    resource: repo://src/main/java/vn/onepay/wsp/resources/authorization/NapasAuthorization.java
  - id: openwiki-source-15a98464c8a4b945f4d02654
    resource: repo://src/main/java/vn/onepay/wsp/resources/qr/QRService.java
  - id: openwiki-source-9b2d1464656ae8fb78747ef9
    resource: repo://src/main/java/vn/onepay/wsp/Server.java
  - id: openwiki-source-1f51b1a16f51ff628c351582
    resource: repo://src/main/resources/config.properties
generated: { by: "openwiki/0.5.2", at: "2026-09-22T08:58:44.659Z" }
---

# Bank Integrations and NAPAS

This page documents bank-specific integrations and NAPAS domestic routing within the WSP payment gateway. It covers QR service behavior, invoice creation and payment endpoints, VietQR, VRB QR, and deeplink flows.

## QR Service Behavior

The `QRService` class manages QR code operations, including creation, status lookup, and cancellation. It acts as a proxy to the MSP backend for QR-related transactions.

### Responsibilities

- **`create(RoutingContext rc)`**: Creates a QR code for a specific invoice. It forwards the request to the MSP endpoint `/invoices/{invoiceId}/qrs`.
- **`getQrs(RoutingContext rc)`**: Retrieves QR codes associated with an invoice and payment. It validates the request parameters (`invoice_id`, `payment_id`) and forwards the query to the MSP endpoint `/invoices/{invoiceId}/payments/{paymentId}/qrs`.
- **Cancellation**: Handles cancellation of VietQR and VRB QR payments by forwarding requests to the respective MSP endpoints.

### Error Handling

The service maps specific error messages (e.g., `GET_QR_INVOICE_NOT_FOUND`, `GET_QR_INVALID_REQUEST`) to numeric error codes for client responses.

## QR Invoice Creation and Payment Endpoints

QR-related routes are registered in `Server.java` and handled by `QRService`.

| Method | Path | Handler | Description |
| :--- | :--- | :--- | :--- |
| POST | `/paygate/api/v1/invoices/:id/qrs` | `QRService::create` | Create a QR code for an invoice |
| GET | `/paygate/api/v1/invoices/:invoice_id/payments/:payment_id/qrs` | `QRService::getQrs` | Retrieve QR codes for a payment |
| POST | `/paygate/api/v1/invoices/:id/payments_vietqr` | `QRService::createVietQr` | Create a VietQR payment |
| PATCH | `/paygate/api/v1/invoices/:invoice_id/payments_vietqr/:payment_id` | `QRService::cancelVietQrPayment` | Cancel a VietQR payment |
| DELETE | `/paygate/api/v1/invoices/:invoice_id/payments_vietqr/:payment_id` | `QRService::cancelVietQrPaymentAndInvoice` | Cancel VietQR payment and close invoice |
| GET | `/paygate/api/v1/guides/vietqr/:type` | `QRService::getVietQrImageGuide` | Retrieve VietQR image guide |

## VietQR, VRB QR, and Deeplink Flows

### VietQR

WSP supports VietQR payments, a domestic QR payment standard in Vietnam.

- **Creation**: `QRService::createVietQr` proxies requests to `/invoices/{invoiceId}/payments_vietqr`.
- **Cancellation**: `cancelVietQrPayment` and `cancelVietQrPaymentAndInvoice` handle payment and invoice closure.
- **Guides**: `getVietQrImageGuide` retrieves visual guides for VietQR usage.

### VRB QR

VRB QR payments are supported via similar proxy methods:

- **Creation**: `QRService::createVrbPaymentQr` proxies to `/invoices/{invoiceId}/payments_vrbqr`.
- **Cancellation**: `cancelVrbPaymentQr` and `cancelVrbPaymentAndInvoice` handle cancellation.

### Deeplinks

WSP provides endpoints to retrieve deeplink information for supported banking apps:

- **`getDeeplinkApps`**: Retrieves a list of apps supporting deeplinks via `/vietqrpay/deeplink-apps`.
- **`getDeeplink`**: Retrieves a specific deeplink for an invoice and issuer code via `/invoices/{invoiceId}/deeplink-apps/{issuerCode}`.

## NAPAS Domestic Routing

NAPAS (National Payment Services) is used for domestic ATM card transactions. WSP integrates with NAPAS for authorization and routing.

### NAPAS Authorization

The `NapasAuthorization` class handles NAPAS OTP authorization requests.

- **Input**: Accepts form data, extracts parameters, and renders the `napas_template.html` widget.
- **Template**: Uses placeholders like `${napas_merchant_id}`, `${napas_order_id}`, etc., to inject transaction details into the NAPAS widget.

### Configuration

Bank-specific configuration is stored in `config.properties` and `config.json`:

- **`config.properties`**: Defines card format regexes (`card-format.bank.{id}`), auth sites (`auth-site.bank.{id}`), and other bank-specific rules for validation and routing.
- **`config.json`**: Maps SWIFT codes to bank names and NAPAS routing details.

### Example Configuration

Properties in `config.properties`:

```properties
# VCB
card-format.bank.1=^(6868[0-9]{12}|970436[0-9]{13})$
auth-site.bank.1=ONEPAY

# Techcombank
card-format.bank.2=^(970407[0-9]{10})$
auth-site.bank.2=BANK
```

In `config.json`, SWIFT codes are mapped:

```json
"swift_codes": {
    "BFTVVNVX": "VCB 970436 1",
    "VTCBVNVX": "TECHCOMBANK 970407 2",
    "VRBAVNVXNP": "VRBANK-NAPAS 9704211 39"
}
```

## Tests

- **`QRServiceTest`**: Covers QR service logic, including creation, retrieval, and error mapping.
- **`NapasAuthorization`**: No dedicated tests; relies on integration testing.

## Related Pages

- [Authorization and 3D Secure](../concepts/authorization.md)
- [Invoice States and Lifecycle](../concepts/invoice-states.md)
