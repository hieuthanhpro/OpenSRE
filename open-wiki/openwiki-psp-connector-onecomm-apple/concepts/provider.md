---
type: concept
title: Provider System
description: PSP provider abstraction and Onecomm implementation
tags: [provider, psp, payment service provider, onecomm]
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
  - id: openwiki-source-21fdb8d8a2800ccd3e706ed1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/PaymentServiceProvider.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

The **Provider System** defines how payment service providers (PSPs) are selected and configured within the PSP Connector. It uses an abstract base class to standardize payment operations and a concrete implementation for the Onecomm gateway.

## Abstract PaymentServiceProvider

`PaymentServiceProvider` (`src/main/java/vn/onepay/pspconnector/provider/PaymentServiceProvider.java`) is an abstract base class that defines the contract for all PSP implementations. It provides default implementations for common payment operations that throw `RuntimeException("METHOD_NOT_SUPPORTED")`, allowing subclasses to override only the methods they support.

### Core Operations
- **User Management**: `userSearch`, `userRegistration`, `userUpdate`
- **Instrument Management**: `instrumentRegistration`, `deleteInstrument`
- **Payment Processing**: `paymentPurchase`, `authorizationCreate`, `authorizationPatch`
- **Refund Processing**: `paymentRefund`, `paymentRefund2`

### Design Pattern
The base class uses a "throw by default" pattern where all methods throw `RuntimeException` unless overridden. This allows:
1. **Selective Implementation**: Subclasses only implement methods relevant to their PSP
2. **Clear Error Handling**: Unsupported operations fail fast with clear error messages
3. **Type Safety**: All operations receive standard `RoutingContext` and `Map` parameters

## Onecomm Implementation

`OnecommPaymentServiceProvider` (`src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommPaymentServiceProvider.java`) is the concrete implementation for the Onecomm payment gateway.

### Configuration
The provider is configured with:
- **Provider ID**: Unique identifier for the Onecomm instance
- **Verify Card Merchant**: `MerchantDTO` containing merchant credentials for card verification
  - `id`: Merchant identifier
  - `accessCode`: Gateway access code
  - `hashCode`: HMAC-SHA256 secret key for request signing

### Instrument Registration
Supports two registration methods:
1. **By Transaction**: Looks up instrument from a previous successful transaction via `OnecommGateway.searchTxn`
2. **By Card**: Verifies card details through `OnecommGateway.verifyCard` with a 5,000 VND verification transaction

### Payment Purchase Flow
1. **Validation**: Checks merchant ID, amount, currency, and instrument data
2. **Payment Insertion**: Creates payment record via `PaymentService.insert`
3. **Gateway Call**: Sends verification request through `OnecommGateway.verifyCard`
4. **State Handling**:
   - `AUTHORIZATION_REQUIRED`: Creates authorization record with approval link
   - `CANCELED`: Stores cancellation links
   - Updates payment state in database
5. **Extension Data**: Stores Onecomm-specific transaction data in `OnecommTxnExtDTO`

### Authorization Patch
Handles authorization updates for payment flows:
1. **Type Validation**: Only processes `PAYMENT` type authorizations
2. **Gateway Update**: Calls `OnecommGateway.updateAuth` with input/result data
3. **Payment State Update**: Updates parent payment based on authorization result
4. **Settlement Handling**: Extracts settlement or reason data from PSP response

### Refund Processing
Two refund implementations:
1. **Standard Refund** (`paymentRefund`): Basic refund with status mapping (200=failed, 300=pending, 400=approved)
2. **Enhanced Refund** (`paymentRefund2`): Adds support for:
   - Dispute handling (`vpc_Dispute`)
   - Direct refunds (`vpc_Direct`)
   - Manual command codes (`MANNUAL`)
   - Extended merchant transaction references

## Provider Selection and Configuration

### Application Startup
In `Main.java`:
1. **Instantiation**: Creates `OnecommPaymentServiceProvider` with configuration properties
2. **Dependency Injection**: Sets the provider on all handler classes:
   - `InstrumentRegistrationHandler.paymentServiceProvider`
   - `PurchaseHandler.paymentServiceProvider`
   - `AuthorizationPatchHandler.paymentServiceProvider`
   - `RefundPostHandler.paymentServiceProvider`
   - `RefundPostHandler2.paymentServiceProvider`

### Handler Pattern
Each handler follows the same pattern:
1. **Static Provider Reference**: Holds a static reference to the configured provider
2. **Request Validation**: Validates request body and required parameters
3. **Delegation**: Calls the appropriate provider method
4. **Error Handling**: Catches and propagates exceptions

### Configuration Properties
The provider is configured via `app.properties`:
- `onepay.psp.id`: Provider identifier
- `verify_card.merchant_id`: Merchant ID for card verification
- `verify_card.access_code`: Gateway access code
- `verify_card.hash_code`: HMAC-SHA256 secret key

## Onecomm Gateway Integration

`OnecommGateway` (`src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java`) handles low-level communication with the Onecomm service:

### Service Communication
- **Protocol**: Hessian binary serialization over HTTP/HTTPS
- **Timeout**: Configurable via `onecomm_service_timeout` (default 60s)
- **Serialization**: Custom `encodeHessian`/`decodeHessian` methods

### Key Operations
1. **Card Verification**: `verifyCard` → `verifyMerchant` → `selectBank` flow
2. **Authorization Update**: `updateAuth` with state management
3. **Refund Processing**: `refund` and `refund2` with status code mapping
4. **Transaction Search**: `searchTxn` for instrument lookup

### Request Signing
All gateway requests are signed using HMAC-SHA256:
1. Collect fields matching `^(vpc_|user_).*$` pattern
2. Sort fields alphabetically
3. Concatenate as `key=value` pairs with `&` separator
4. Sign with merchant's hash code
5. Append as `vpc_SecureHash` parameter

## Related Components

- **MerchantDTO**: Holds merchant credentials for gateway authentication
- **OnecommTxnExtDTO**: Stores Onecomm-specific transaction extension data
- **OnecommTxnRefundExtDTO**: Stores refund-specific extension data
- **Config**: Provides gateway URL and timeout configuration
- **DB**: Handles database operations for transaction storage

## Failure Handling

### Error Codes
The system maps Onecomm response codes to standard states:
- **200**: Bank declined (`FAILED`)
- **300/100**: Processing pending (`PENDING`)
- **400**: Approved (`APPROVED`)
- **Other**: Internal server error

### Exception Types
- `BadRequestException`: Invalid request parameters
- `ResourceNotFoundException`: Payment/authorization not found
- `SystemException`: Gateway communication failures

### Transaction Safety
- All operations use `execBlocking` for non-blocking execution
- Database operations are wrapped in connection pool management
- Gateway timeouts prevent indefinite blocking
