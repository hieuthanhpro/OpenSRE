---
type: Reference
title: PSP connector interaction reference
description: Per-connector reference of exact HTTP routes, gateway operations (Hessian, NAPAS, KBank REST), request and response field names, DB stored procedures, crypto steps, and normalized error statuses each PSP connector returns to MSP.
resource: repo://openwiki
tags: [psp-connector, onecomm, kbank, ewallet, api, gateway, hessian, error-model]
---

# PSP connector interaction reference

Companion: [`/openwiki/workflows/cross-service-flows.md`](/openwiki/workflows/cross-service-flows.md) for sequence diagrams.

## 1. Common connector contract

All four connectors are Vert.x services with the same middleware chain:

`BodyHandler -> ResponseTimeHandler -> TimeoutHandler(connectionTimeOut) -> RequestLoggingHandler -> ClientAuthorizationHandler -> route handler -> ResponseHandler` with `ExceptionHandler` as failureHandler.

Inbound auth: **OWS1-HMAC-SHA256**. Required headers:

| Header | Format |
|---|---|
| `Accept` | `application/json` |
| `Content-Type` | `application/json` |
| `X-OP-Date` | `yyyyMMdd'T'HHmmss'Z'` |
| `X-OP-Expires` | seconds until expiry |
| `X-OP-Authorization` | signature derived from `access_key.<clientId>` |

Client id is extracted from the signature credential string (regex `Credential=([^/|?]+)/` on onecomm/ewallet). Auth config: `service.name`, `service.region`, `service.authorization.type` (`ows1_request`), `service.authorization.algorithm` (`OWS1-HMAC-SHA256`).

Error envelope: `{name, message, details, information_link}`; JSON `code` carries `SystemError.reason`. Status mapping: `AuthorizationException` 401, `BadRequestException` 400, `ResourceConflictException` 409, `ResourceNotFoundException` 404, `HttpServiceException` upstream code, otherwise 500 `INTERNAL_SERVER_ERROR`.

Persistence: Oracle + HikariCP, always via stored procedures through `DBProcedureUtil.execute`. A procedure response code different from the expected HTTP status raises `OracleException`.

## 2. psp-connector-onecomm

### 2.1 HTTP routes (prefix constant `apiPrefix`, config `uri_prefix` = `/psp/api/v1`)

| Method | Path | Handler |
|---|---|---|
| POST/PUT | `/payments` , `/payments/:id` | `PurchaseHandler` |
| GET | `/payments/:id` | `PurchaseGetHandler` |
| PUT | `/applepay-payments/:id` | `ApplePayNapasPurchaseHandler` |
| POST | `/instruments` | `InstrumentRegistrationHandler` |
| PATCH | `/authorizations` | authorization update |
| POST | `/settlements` | `SettlementHandler` (validation only) |
| POST | `/merchant/:merchant_id/refunds/:merch_txn_ref` | `RefundHandler.paymentRefund` |
| POST | `/refund_napas` | `RefundHandler.paymentNPRefund` |
| POST | `/merchant/:merchant_id/refunds_manual/:merch_txn_ref` | `RefundHandler.paymentRefundManual` |
| POST | `/merchant/:merchant_id/refunds_auto/:merch_txn_ref` | `RefundHandler.paymentRefundAuto` |
| PATCH | `/merchant/:merchant_id/refunds/:merch_txn_ref` | `RefundHandler.updateRefund` |
| POST | `/refunds2` | `AppleRefundPostHandler` |
| GET/POST/PATCH | `/users`, `/users/:id` | user routes |

### 2.2 OnecommGateway (Hessian)

Transport: Vert.x `HttpClient`, header `0x63 0x02 0x00 0x6d 0x00 0x07 "execute"` + length + payload. URL `onecomm_service_url` default `http://localhost/onecomm-payservice/execute`, timeout `onecomm_service_timeout` = `60000`.

Operations: `verifyCard`, `verifyMerchant`, `updateAuth`, `confirm`, `searchTxn`, `selectBank`, `refund`, `refundExtend`, `refundNP`, `refundApple`. Hessian command names: `VERIFY_MERCHANT`, `BANK_VERIFY_CARD`, `SELECT_BANK`, per-bank `VCB_VERIFY_CARD`, `TPB_VERIFY_CARD`, `*_NAPAS_VERIFY_CARD`.

Signing: `Util.createGatewayHash` collects `vpc_` and `user_` fields (pattern `^(vpc_|user_).*$`), sorts by key, joins `key=value&...`, `Mac.getInstance("HMACSHA256")` with merchant `hash_code` hex key -> `vpc_SecureHash`.

Core request fields: `vpc_SecureHash`, `vpc_TicketNo` (client IP), `vpc_Customer_Id`, `vpc_Dispute`, `vpc_Direct`, Access Code, Amount (scaled x100), Command, merchant txn ref, order info, return URL, locale `vn`, version `2`.

Response objects: payment id `pay;D;<merchantId>;<merchTxnRef>`, authorization id `aut;D;<merchantId>;<merchTxnRef>` with `links.approval` (href, method, content) and expire time; settlement payload `{reference, amount, currency, settlement_time, review_fraud?}` stored in `S_RESPONSE_DATA`.

### 2.3 NAPasGateway

Query `GET /merchant/{caic}/order/{id}/domestic/`, JWT token cache `ConcurrentHashMap<String, NapasToken>`, `napasLogin()` / `napasRefreshToken()`. Gateway code mapping: `BANK_ERROR`/`OTHER_ERROR` -> `SYSTEM_ERROR`; `CARD_LIMIT_EXCEEDED` -> `LIMITED_AMOUNT`; `INVALID_OTP`/`INVALID_CARDNAME` -> `INVALID_OTP`/`INVALID_CARD_NAME`; `EXPIRED_SESSION` -> `TXN_TIMEOUT`.

### 2.4 Fraud check

`Fraud.checkFraud("domestic", purchaseRequestMap, jRawData, clientId, pFraud)` -> `POST {fsp-go.service.url}/domestic/check-fraud` (default `http://localhost/fsp/api/v2`), timeout `60000`. Headers: `X-Op-Date`, `X-Op-Expires`, `Authorization` with client id `PSP-CONNECTOR-ONECOMM`, region `onepay`, service `fsp-go`. Payload: `paymentId`, `merchantId`, `merchantTransRef`, `amount`, `cardNo`, `cardNoHash`, `ipAddress`, `customerName`, `data.rawData`, `clientId`, `insType`. Decision: 200 with non-empty `fraud` -> `Future.failedFuture(TXN_FRAUD)`, client sees `400 FRAUD`.

### 2.5 Purchase and instrument verification steps

Purchase: validate body/`merchant_id`/`amount`/`currency`/`instrument` -> `OnecommPaymentServiceProvider.paymentPurchase` -> `PaymentService.insert()` -> domestic fraud check -> `OnecommGateway.verifyCard` -> 201/200. Instrument normalization notes: OceanBank forces `ATM` + SMS; VPBank adjustments.

Instrument verification (`POST /instruments`): either by transaction (`OnecommGateway.searchTxn`, state must be APPROVED) or by card - nominal **5000 VND** `verifyCard` against `verifyCardMerchant` credentials (`verify_card.merchant_id`, `verify_card.access_code`, `verify_card.hash_code`), dummy `return_url` `http://mpay.return.url`. Success -> instrument `APPROVED` (auth `created`/`pending`); failure -> `FAILED`. Response returns masked card number.

Settlement (`POST /settlements`): validates `MERCHANT_ID`, `TERMINAL_ID`, `BATCH_NO` only; real settlement data is written during authorization-result processing into `OnecommTxnSettlementDTO` (`transactionId`, `settlementDate`, `status`, `description`, `transactionDate`, `bankId`) and `payment_update`.

### 2.6 Refund variants

`RefundRule.isManual` thresholds: BIDV (19) auto <= 180 days; MBBank (8) requires `mbbank_txn_info.bank_request_id`; AnBinh (15) same-day full amount; BacABank (22)/DongABank (6) one-time/settlement checks; NAPAS banks auto <= 300 days; VNPT Money (80)/VietinBank (4) auto <= 90 days; default `refund.bank.<bankId>` = `auto`|`manual`; unconfigured bank -> `INVALID_REFUND`. BIDV 4B path `paymentRefund4B` creates pending status **210** for CDR file generation.

`updateRefund` guards: no terminal -> other transitions; cannot approve without Onecomm txn log; cannot fail an already-400 refund; pending-2 (300) transitions Onecomm log to 400 or 200.

### 2.7 DB and states

Datasources: `database.*` (primary) and `database.payment2.*` (`Payment2DB.GetTransactionByReferenceAndMerchantId`). Procedures/packages: `PKG_CLIENT`, `PKG_CLIENT_ACTIVITY`, `PKG_AUTHORIZATION` (`auth_insert`, `auth_get`, `auth_search`), `PKG_PAYMENT` (`payment_insert`, `payment_update`, `payment_get`), `PKG_MSG`, `PKG_ERROR` (`error_get`), `PKG_REFUND` (`refund_insert`, `refund_update`), `PKG_REFUND_EXTEND` (`refund_insert`, `refund_update`, `refund_select`, `txn_settlement_select`), function `get_onecomm_merchant`. `OnecommDB` operates on `TB_REFUND_CONFIRM` (documented as inferred).

States: payments `PENDING`, `AUTHORIZATION_REQUIRED`, `APPROVED`, `FAILED`, `CANCELED`, `EXPIRED`, `CREATED`; refunds `PENDING`, `APPROVED`, `FAILED`; Onecomm txn log numeric statuses 200/300/400.

### 2.8 Error names returned toward MSP

`VALIDATION_ERROR`, `INVALID_REQUEST_BODY`, `INVALID_MERCHANT`, `INVALID_AMOUNT`, `INVALID_TERMINAL`, `PSP_CONNECTION_ERROR`, `INTERNAL_SERVER_ERROR`, `INVALID_REFUND`, `METHOD_NOT_SUPPORTED`, `FRAUD`, `TXN_FRAUD`, `DECLINED`, `INVALID_OTP`, `INVALID_CARD_NAME`, `LIMITED_AMOUNT`, `SYSTEM_ERROR`, `TXN_TIMEOUT`, `INVALID_ACCESS_KEY`, `OPERATION_EXPIRED`, `INVALID_SERVICE_SIGNATURE`. Onecomm business codes mapped via config `onecomm.status.<code>.code` / `.desc`; code `1` success, `2` fraud/hard failure.

## 3. psp-connector-onecomm-apple

### 3.1 Routes (prefix `/psp-connector-onecomm-apple/api/v1`)

| Method | Path | Handler |
|---|---|---|
| GET/POST | `/users` | `UserGetHandler` / `UserRegistrationHandler` |
| PATCH | `/users/:id` | `UserUpdateHandler` |
| DELETE | `/users/:user_id/tokens/:token_id` | `UserDeleteTokenHandler` |
| POST | `/instruments` | `InstrumentRegistrationHandler` |
| POST/PUT | `/payments`, `/payments/:id` | `PurchaseHandler` |
| PATCH | `/authorizations/:id` | `AuthorizationPatchHandler` |
| POST | `/settlements` | `SettlementHandler` |
| POST | `/refunds`, `/refunds2` | `RefundPostHandler`, `RefundPostHandler2` |

### 3.2 Purchase payload and steps

Purchase body fields: `amount`, `currency`, `merchant_id`, `merchant_txn_ref`, `terminal` (hard-coded `127.0.0.1`), `reference` (connector `paymentId`), `order.information`, `instrument`, `return_url` (default `http://mpay.return.url` unless valid `http(s)`), optional `customer` `{id,name,email,phone}`, optional `state` (e.g. `"canceled"`).

Steps: validate -> `PaymentService.insert` (`PKG_PAYMENT.payment_insert`) -> `DB.getOnecommMerchant` (Oracle function `get_onecomm_merchant`, fields `accessCode`, `hashCode`) -> `OnecommGateway.verifyCard` (`verifyMerchant` -> `*_VERIFY_CARD` or `SELECT_BANK`) -> inside `execBlocking`: `payment_update`; if `authorization_required` extract `aut;D;<merchantId>;<merchTxnRef>` + `links.approval` -> `AuthorizationService.insert` (`PKG_AUTHORIZATION.auth_insert`); attach `payment_data` from `DB.getOnecommTxnExt` (may include SHB challenge code, mobile number, bank version 2); response `RESPONSE_CODE=201`.

Gateway URL default `http://localhost/onecomm-payservice-apple/execute`. Status mapping: gateway `200` declined -> `FAILED`; `300`/`100` -> `PENDING`; `400` -> `APPROVED`; gateway status `2` -> `FAILED` with `FRAUD`.

## 4. psp-connector-kbank

### 4.1 Routes

| Method | Path | Handler |
|---|---|---|
| POST/PUT | `{apiPrefix}/payments`, `{apiPrefix}/payments/:id` | `PurchaseHandler` |
| POST | `{apiPrefix}/verify-otp` | `VerifyOTPHandler.handle` -> `verifyOtp` |
| POST | `{apiPrefix}/verify-otp2` | `VerifyOTPHandler.handle2` -> `verifyOtp2` |
| PATCH | `{apiPrefix}/authorizations/:id` | `VerifyOTPHandler.handle` |
| POST | `{apiPrefix}/refunds2` | `RefundPostHandler` (branch `command == "capture_refund"`) |

`RoutePool` also lists `/authorizations`, `/captures`, `/voids`; `KBankHandler` exists but is not wired into the router.

### 4.2 KBankGateway operations

Host/path from `kbank.host` + `kbank.path`. Endpoints: `/generate-deeplink`, `/add-payment-method`, `/send-otp`, `/check-otp`, `/payment`, `/cancellation`.

Methods: `addPaymentMethod`, `addPaymentMethodRequest`, `sendOTP`, `verifyOtp`, `payment`, `getDeepLink`, `refund`. `add-payment-method` body maps `phoneNo`, `fullName`, `cardID`, `partnerUID` (from `merchTxnRef`). Response codes: `001` -> sendOTP; `000` from `/send-otp` -> `authorization_required` with `opt_required`, 5-minute expiry; `002` -> deep link (`deep_link.code="KB-02"`, fallback `Config.getDefaultURL()`); `000`/`018` on refund/cancel -> approved; `KBANK_RES_SIGNATURE_INVALID` / `errorsig` -> signature failure.

`KBankMSPClient.getInfoPaymentMsp` / `patchMspSettlement` sync settlement back to MSP. `Util.checkSignature(response, headersIV)` validates every KBank response before use.

### 4.3 Crypto

`KBankSecurity`: encryption `AES/GCM/NoPadding` with `GCMParameterSpec(128, iv)`, key file path `kbank.encryption_path` -> `ENCRYPTION_PATH`; outbound signature `AuthorizationV0.sha256Hash` then `RSA/ECB/PKCS1Padding` with static private key `kbank.onepay_private` -> `ONEPAY_PRIVATE`, Base64; response verification `decryptedPublicKey(signature)` with `kbank.kbank_public` -> `KBANK_PUBLIC`. No key rotation/reload without restart.

### 4.4 DB and errors

Services: `PaymentService`, `AuthorizationService`, `RefundService`, `CaptureService` (insert/query/update), `VoidService` (insert/query/update), `ConnectorMsgService`, `ErrorService`. Stored-procedure names for KBank-specific ops are not documented. Errors: `KBANK_MERCHANT_NOT_CONFIG`, `KBANK_RES_SIGNATURE_INVALID`, `kbank_status_error` mapped by `mapPingStatusCodeKbank`, business codes via `mapPingErrorCodeKBank` into the `KBANK_*` family.

## 5. psp-connector-ewallet

Single documented route: `POST {server.api.prefix}/instruments` -> `InstrumentPostHandler` (default prefix `/psp-connector-ewallet/api/v1`, port `12190`).

Downstream: `POST {ewallet.service.base.url}/instruments` (example `http://127.0.0.1:9443/tsp/api/v1`). Outbound body mapping: `id` <- `user_id`, `group_id` <- `ewallet.service.group` (`onepay`), passthrough `first_name`, `last_name`, `mobile`, `email`, `address`. Headers: `X-OP-Date` (`yyyyMMdd'T'HHmmss'Z'` UTC), `X-OP-Expires`, `X-OP-Authorization` (OWS1, `ewallet.service.authorization.id`/`key`, region `vcb`, service `tsp`). Success criterion: **HTTP 201 only**; anything else -> `HttpServiceException`.

Inbound required fields: `user_id`, `mobile`, `email`; errors `INVALID_REQUEST_BODY`, `VALIDATION_ERROR`, `INVALID_USER_ID`. No local persistence on this route; no purchase/refund/OTP endpoints are implemented in this service.

## 6. Config keys affecting routing

| Connector | Config keys |
|---|---|
| onecomm | `onecomm_service_url`, `onecomm_service_timeout`, `onepay.psp.id`, `verify_card.merchant_id`, `verify_card.access_code`, `verify_card.hash_code`, `refund.bank.<bankId>`, `napas.bank`, `onecomm.status.<code>.code`/`.desc`, `fsp-go.service.url`, `fsp-go.service.check_fraud_method` |
| onecomm-apple | `.../onecomm-payservice-apple/execute`, same `verify_card.*`, `onecomm.status.*` |
| kbank | `kbank.host`, `kbank.path`, `kbank.token`, `kbank.partner_id`, `kbank.code`, `kbank.language`, `kbank.encryption_path`, `kbank.onepay_private`, `kbank.kbank_public` |
| ewallet | `ewallet.service.base.url`, `ewallet.service.group`, `ewallet.service.name`, `ewallet.service.region`, `ewallet.service.authorization.id`/`key`, `ewallet.service.request.timeout` |

MSP-side connector arrays are loaded reflectively at startup: `msp_connectors`, `rsp_connectors`, `csp_connectors`, `void_connectors`, `bill_rsp_connectors`, `merchant_connectors`, `psp_connectors`, `query_pay_connectors` - each entry `{class, id, properties}` -> `getConstructor(String, JsonObject).newInstance(id, properties)`.
