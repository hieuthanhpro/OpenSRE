---
type: reference
title: API Reference
description: REST endpoints, required headers, and request/response formats for the TSP Vault service.
tags: [api, rest, http, endpoints, reference]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:02:32.401Z
sources:
  - id: openwiki-source-1c92d7e8d56747a0e9e936a5
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/handler/common/ClientAuthorizationHandler.java
  - id: openwiki-source-58a23a6e532b87162a8b6628
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/handler/instrument/InstrumentPostHandler.java
  - id: openwiki-source-07053b01d1e268f7b3d098d8
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/vertical/TSPVaultVertical.java
  - id: openwiki-source-03addeb5ac5606f910358aa7
    resource: repo://src/main/java/vn/onepay/tsp/vault/util/AppParams.java
  - id: openwiki-source-9d8e6ddf5a40540607f58571
    resource: repo://src/main/java/vn/onepay/tsp/vault/util/RoutePool.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:02:32.401Z" }
---

# API Reference

This page documents the REST API exposed by the TSP Vault service. All endpoints are hosted under a configurable base path and require specific authentication headers for every request.

## Authentication Headers

Every API request **must** include the following HTTP headers. Requests missing any of these will be rejected with a `400 Bad Request`.

| Header | Description |
|---|---|
| `Content-Type` | Must be `application/json`. |
| `X-OP-Date` | The timestamp of the request (used for signature generation). |
| `X-OP-Expires` | The number of seconds until the request authorization expires. |
| `X-OP-Authorization` | The client's authorization signature string, which includes the client ID, service region, service name, algorithm, and the HMAC signature of the request. |

The `ClientAuthorizationHandler` parses these headers, verifies the request is not expired, validates the service region and name, and then recomputes the signature using the client's access key (retrieved from the `ApplicationCache`) to ensure the request is authentic and has not been tampered with.

## Base Path

The base path for all API endpoints is defined in the `RoutePool` class. The default root path is:

```
/tspvault/api/v1
```

## Instrument Endpoints

These endpoints manage payment instruments (e.g., cards, bank accounts).

| Method | Path | Description | Handler |
|---|---|---|---|
| `GET` | `/instruments` | List instruments (details vary). | `InstrumentGetHandler` |
| `GET` | `/instruments/:id` | Get a specific instrument by ID. | `InstrumentGetHandler` |
| `POST` | `/instruments` | Create a new instrument. | `InstrumentPostHandler` |
| `PATCH` | `/instruments/:id` | Update an existing instrument. | `InstrumentPatchHandler` |
| `DELETE` | `/instruments/:id` | Delete an instrument. | `InstrumentDeleteHandler` |
| `GET` | `/user/instruments` | List instruments for a user. | `InstrumentListHandler` |

### POST /instruments

Registers a new instrument. If the service is configured with `tokenReserved=true` or the instrument is immediately approved, a token may be automatically generated and returned with the instrument data.

**Request Body:**
```json
{
  "type": "CARD",
  "number": "4111111111111111",
  "month": 12,
  "year": 2025,
  "user_id": "user123",
  "device_id": "device456",
  "instance_id": "app_instance_789",
  "app_id": "my_app"
}
```

**Response (201 Created):**
```json
{
  "response_code": 201,
  "response_data": {
    "id": "instrument_id_001",
    "state": "APPROVED",
    "type": "CARD",
    "number_hash": "hash_value",
    "token": { ... }
  }
}
```

## Token Endpoints

These endpoints manage tokens, which are used to reference instruments without exposing sensitive data.

| Method | Path | Description | Handler |
|---|---|---|---|
| `GET` | `/tokens` | List tokens (details vary). | `TokenGetHandler` |
| `GET` | `/tokens/:id` | Get a specific token by ID. | `TokenGetHandler` |
| `POST` | `/tokens` | Generate a new token for an existing instrument. | `TokenPostHandler` |
| `PATCH` | `/tokens/:id` | Update a token (e.g., status, name). | `TokenPatchHandler` |
| `DELETE` | `/tokens/:id` | Delete a specific token. | `TokenDeleteHandler` |
| `PATCH` | `/tokens/:id/instruments` | Update instruments associated with a token. | `UpdateInstrumentHandler` |
| `DELETE` | `/user/:id/tokens` | Delete all tokens for a specific user. | `UserTokenDeleteHandler` |
| `GET` | `/user/:id/tokens` | List all tokens for a specific user. | `UserTokenListHandler` |

### POST /tokens

Generates a token for an existing instrument. This is typically used if a token was not generated automatically during instrument creation.

**Request Body:**
```json
{
  "instrument_id": "instrument_id_001",
  "user_id": "user123",
  "device_id": "device456",
  "instance_id": "app_instance_789",
  "app_id": "my_app"
}
```

**Response (201 Created):**
```json
{
  "response_code": 201,
  "response_data": {
    "id": "token_id_001",
    "instrument_id": "instrument_id_001",
    "state": "ACTIVE",
    "token": "token_value_string"
  }
}
```

## Common Response Structure

All API responses generally follow this structure:

```json
{
  "response_code": 200,
  "response_data": { ... },
  "response_desc": "Success"
}
```

### Error Response

Errors are returned with a `message` field explaining the issue and a `response_code` indicating the status.

```json
{
  "response_code": 400,
  "response_desc": "Bad Request",
  "message": "Invalid instrument number",
  "details": "The provided card number format is invalid.",
  "information_link": "https://api.example.com/errors/invalid-number"
}
```
