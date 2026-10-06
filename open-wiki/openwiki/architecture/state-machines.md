---
type: Architecture
title: State machines for invoices, payments, authorizations, tokens and refunds
description: State diagrams and transition tables for MSP invoice and payment states, WSP invoice constants, TVSP token and instrument ResourceStates, authorization final states, and refund/void outcomes, with the service that owns each transition.
resource: repo://openwiki
tags: [state-machine, invoice, payment, token, refund, authorization, msp, tvsp]
---

# State machines for invoices, payments, authorizations, tokens and refunds

Companion pages: [`/openwiki/architecture/system-topology.md`](/openwiki/architecture/system-topology.md), [`/openwiki/workflows/cross-service-flows.md`](/openwiki/workflows/cross-service-flows.md).

## 1. Invoice

```mermaid
stateDiagram-v2
    [*] --> pending: Create (WSP POST /invoices -> MSP Invoices.create)
    pending --> not_paid: Init (DB.createInvoice -> InvoiceDTO)
    not_paid --> paid: Pay (payment approved)
    not_paid --> unpaid: Pay attempt failed, retries left
    unpaid --> paid: Pay (retry)
    unpaid --> closed: Max Retries reached
    not_paid --> closed: Close (PATCH /invoices/:id)
    not_paid --> canceled: Cancel (DELETE /invoices/:id)
    not_paid --> expired: Expire
    paid --> [*]
    closed --> [*]
    canceled --> [*]
    expired --> [*]
```

| Constant (`IConstants`) | Value | Terminal |
|---|---|---|
| `PENDDING` | `pendding` | no (legacy spelling) |
| `PENDING` | `pending` | no |
| `NOT_PAID` | `not_paid` | no |
| `UNPAID` | `unpaid` | no |
| `PAID` | `paid` | yes |
| `CANCELED` | `canceled` | yes |
| `CLOSED` | `closed` | yes |
| `EXPIRED` | `expired` | yes |

MSP core-workflow pages also use lowercase `created`, `pending`, `paid`, `unpaid`, `cancelled`; the two spellings are not reconciled in the docs. Terminal states make WSP redirect to `merchant_return_url`; active states keep collecting payment.

## 2. Payment

```mermaid
stateDiagram-v2
    [*] --> created: POST /invoices/:id/payments (MSP Payments.create)
    created --> authorization_required: 3DS / OTP / bank redirect
    created --> approved: PSP success (state 400)
    created --> failed: PSP decline (status 200 declined / code 2 fraud)
    authorization_required --> approved: AuthorizationService.update / connector updateAuth
    authorization_required --> failed: Authorization rejected
    failed --> pending: retry / enquiry
    pending --> approved: Settlement or updatePayment result
    pending --> failed: Final failure
    approved --> [*]
    failed --> [*]
```

Connector-side payment states (`ResourceStates`, connectors): `CREATED`, `PENDING`, `AUTHORIZATION_REQUIRED`, `APPROVED`, `FAILED`, `CANCELED`, `EXPIRED`. Gateway numeric statuses are translated: `400` -> approved, `300`/`100` -> pending, bank decline -> failed, `2` -> fraud.

## 3. Authorization

```mermaid
stateDiagram-v2
    [*] --> created: 3DS / OTP challenge (authorization record + links.approval)
    created --> pending: Redirect to bank / NAPAS OTP
    pending --> approved: vpc_3DSstatus success / OTP match
    pending --> failed: vpc_TxnResponseCode reject / INVALID_OTP
    created --> expired: expire_time elapsed
    approved --> [*]
    failed --> [*]
    expired --> [*]
```

Final states checked by `AuthorizationService.update` before processing, to prevent double processing: `approved`, `failed`, `canceled`, `expired`.

## 4. Token (TVSP `ResourceStates`)

```mermaid
stateDiagram-v2
    [*] --> created: POST /tokens or auto-generate on instrument insert
    created --> approved: instrument approved (state sync)
    created --> expired: expiry computed at generation
    approved --> locked: PATCH /tokens/:id
    locked --> approved: PATCH /tokens/:id (unlock)
    approved --> expired: AppUtil.isExpired on read
    created --> deleted: DELETE /tokens/:id
    approved --> deleted: DELETE /tokens/:id
    locked --> deleted: DELETE /user/:id/tokens
```

Expiry is enforced lazily on read (`TokenService.get` -> `AppUtil.isExpired` -> state `EXPIRED`), not by a background job. Token number = `Prefix + Random Middle + Luhn Checksum + Suffix` for cards, or `970499`-style default prefix for accounts; expiry defaults to `token.expiration.month` = 48 months and is capped by the parent card expiry.

## 5. Instrument (TVSP `ResourceStates`)

```mermaid
stateDiagram-v2
    [*] --> created: POST /instruments (HMAC + AES via OneSM)
    created --> authorization_required: Instrument registration requiring OTP
    created --> approved: Approved instrument
    authorization_required --> approved: OTP / verification success
    approved --> locked: PATCH /instruments/:id
    locked --> approved: unlock
    approved --> expired: expiry
    expired --> locked: lock after expiry
    locked --> deleted: delete
    approved --> deleted: delete
    created --> deleted: delete
```

## 6. Refund and void

```mermaid
stateDiagram-v2
    [*] --> CREATED: Refunds.create -> DB.createRefund (payment must be APPROVED/PAID)
    CREATED --> PENDING: routed to RSPConnector.createRefund / createRefund2
    CREATED --> APPROVED: gateway response 400
    CREATED --> REJECTED: gateway failure / invalid amount
    PENDING --> APPROVED: updateRefund guard passes (Onecomm txn log 400)
    PENDING --> FAILED: gateway 200 with failure
    APPROVED --> [*]
    REJECTED --> [*]
```

Void states are not documented; MSP routes voids through `VoidConnector.createVoid` / `enquiryVoid` (`UnionpayQrVoid`, `WSPVoid`) and PSP-level `voidOrder`, and updates transaction and invoice state.

Refund amount rule: refund amount must not exceed the original payment minus previous refunds. `RefundRule.isManual(bankId, paymentTime, amount)` decides auto vs manual per bank (e.g. BIDV 19 auto up to 180 days, NAPAS banks up to 300 days, VNPT Money 80 / VietinBank 4 up to 90 days; unconfigured bank -> `INVALID_REFUND`).

## 7. Cross-service state propagation

```mermaid
sequenceDiagram
    participant WSP
    participant MSP
    participant PSP as PSP connector
    participant TVSP
    WSP->>MSP: create payment
    MSP->>PSP: connector.createPayment
    PSP->>PSP: payment_insert (PENDING)
    PSP-->>MSP: authorization_required + links.approval
    MSP-->>WSP: AUTHORIZATION_REQUIRED
    WSP-->>Client: redirect to 3DS / NAPAS OTP
    Client->>WSP: callback /authorizations/:authorization_id
    alt token instrument
        WSP->>TVSP: PATCH authorization result
        TVSP->>TVSP: token sequence bump, iCVV regeneration
    else international brand
        WSP->>PSP: updateAuth / confirm
    end
    PSP->>PSP: payment_update + authorization state
    PSP-->>MSP: approved/failed
    MSP-->>WSP: payment result
    WSP-->>Client: redirect merchant_return_url
```
