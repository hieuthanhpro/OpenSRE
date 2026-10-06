---
type: reference-api
title: API reference
description: Lists the HTTP routes exposed by the PSP Connector E-Wallet service, including methods, request parameters, and expected responses.
tags: [api, reference, http, rest, ewallet]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-30T08:38:20.900Z
sources:
  - id: openwiki-source-9b05bbab2ad030014da4d2f7
    resource: repo://src/main/java/vn/onepay/psp/server/handler/common/ClientAuthorizationHandler.java
  - id: openwiki-source-5d49ab041d352705e185aeef
    resource: repo://src/main/java/vn/onepay/psp/server/handler/instrument/InstrumentPostHandler.java
  - id: openwiki-source-49116f2c31819931a7a0f662
    resource: repo://src/main/java/vn/onepay/psp/server/vertical/PspVertical.java
generated: { by: "openwiki/0.5.2", at: "2026-09-30T08:38:20.900Z" }
---

# API reference

The `psp-connector-ewallet` service exposes a single HTTP endpoint for registering e-wallet instruments. The API surface is defined by the `PspVertical` router configuration and implemented by `InstrumentPostHandler`.

## Base URL

The service is configured via `app.properties` and defaults to:

`http://<host>:<port>/psp-connector-ewallet/api/v1`

## Endpoints

### POST /instruments

Registers a new e-wallet payment instrument by proxying the request to the upstream e-wallet service.

- **Method**: `POST`
- **Path**: `{server.api.prefix}/instruments`
- **Content-Type**: `application/json`

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `user_id` | string | Yes | The unique identifier of the user |
| `mobile` | string | Yes | User's mobile number |
| `email` | string | Yes | User's email address |
| `first_name` | string | No | User's first name |
| `last_name` | string | No | User's last name |
| `address` | object | No | Address details |

**Example Request**

```json
{
  "user_id": "12345",
  "mobile": "+84912345678",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "address": {
    "city": "Hanoi"
  }
}
```

#### Headers

The request must include standard authorization headers processed by `ClientAuthorizationHandler`:

- `Accept: application/json`
- `Content-Type: application/json`
- `X-OP-Date`: Request timestamp
- `X-OP-Expires`: Request expiration
- `X-OP-Authorization`: OWS1-HMAC-SHA256 signature

#### Behavior

1. **Validation**: The handler validates that `user_id`, `mobile`, and `email` are present. Missing fields result in a 400 Bad Request error.
2. **Transformation**: The connector enriches the request with a `group_id` from configuration before forwarding.
3. **Forwarding**: The request is sent to the configured upstream e-wallet service (e.g., TSP) using the connector's outbound HTTP client.
4. **Response Mapping**: The upstream service's response is returned to the client. A 201 Created from upstream is mapped to a successful response body.

#### Responses

**Success (201 Created)**

Returned when the upstream e-wallet service successfully processes the registration.

```json
{
  "code": 201,
  "message": "Created",
  "data": { ... }
}
```

**Error Responses**

Errors follow the standard error envelope structure described in the [Error model](/openwiki/operations/error-model.md).

| Status | Condition |
|---|---|
| 400 Bad Request | Missing required fields (`user_id`, `mobile`, `email`) or invalid body |
| 401 Unauthorized | Invalid or missing signature |
| 500 Internal Server Error | Upstream service failure or internal processing error |

## Security

All requests are signed using the **OWS1-HMAC-SHA256** algorithm. The `ClientAuthorizationHandler` verifies the signature before the request reaches the business logic. See [Security and signatures](/openwiki/concepts/security-and-signatures.md) for details.
