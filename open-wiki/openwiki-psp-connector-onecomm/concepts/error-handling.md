---
type: concept
title: Error Handling & Exceptions
description: Explains the global exception handling pattern, structured error model, and JSON response shape used by the PSP Connector API.
tags: [error-handling, exceptions, api, json, rest]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:50:02.660Z
sources:
  - id: openwiki-source-9b63cf54ee6a3f77d15ed800
    resource: repo://src/main/java/vn/onepay/pspconnector/common/error/SystemError.java
  - id: openwiki-source-d091df7b1ee14c1ee07f86fc
    resource: repo://src/main/java/vn/onepay/pspconnector/common/exception/AuthorizationException.java
  - id: openwiki-source-22eb424f48626adb89178e08
    resource: repo://src/main/java/vn/onepay/pspconnector/common/exception/BadRequestException.java
  - id: openwiki-source-54137d7921d74c7c6d3d01a8
    resource: repo://src/main/java/vn/onepay/pspconnector/common/exception/SystemException.java
  - id: openwiki-source-3041776cc8f61671b7b1a6c8
    resource: repo://src/main/java/vn/onepay/pspconnector/server/handler/common/ExceptionHandler.java
  - id: openwiki-source-342250f810d369e837aacf96
    resource: repo://src/main/java/vn/onepay/pspconnector/server/vertical/PSPConnectorVertical.java
generated: { by: "openwiki/0.5.2", at: "2026-09-23T03:50:02.660Z" }
---

# Error Handling & Exceptions

The PSP Connector uses a centralized exception handling model to ensure consistent error responses across all API endpoints. It relies on a structured error model (`SystemError`), a base exception class (`SystemException`), specialized exception subclasses, and a global failure handler (`ExceptionHandler`) registered with the Vert.x router.

## Components

1.  **`SystemError`**: A immutable value object representing a specific error condition. It contains:
    *   `code`: HTTP status code (e.g., 400, 401, 500).
    *   `reason`: A machine-readable error code string (e.g., "INVALID_REQUEST_BODY").
    *   `name`: A short error name.
    *   `message`: A human-readable description.
    *   `details`: Additional details (often empty).
    *   `informationLink`: A URL pointing to documentation.
2.  **`SystemException`**: A `RuntimeException` subclass that wraps a `SystemError`.
3.  **Specialized Exceptions**: Subclasses of `SystemException` for semantic clarity (e.g., `BadRequestException`, `AuthorizationException`, `PSPConnectionException`).
4.  **`ExceptionHandler`**: A static failure handler registered on the Vert.x `Router`. It catches all unhandled exceptions (including `SystemException` and its subclasses) and converts them into JSON responses.

## Error Response Structure

When an error occurs, the `ExceptionHandler` constructs a JSON response with the following structure:

```json
{
  "name": "error_name",
  "message": "Human-readable message",
  "details": "Additional details",
  "information_link": "http://developer.onepay.vn/errors/...",
  "code": "MACHINE_READABLE_CODE"
}
```

The `code` field in the JSON response corresponds to the `reason` field in the `SystemError` object (e.g., "INVALID_REQUEST_BODY"), while the HTTP status code is set via `setStatusCode`.

## Workflow

1.  A request handler (e.g., `PurchaseHandler`) validates input or calls external services.
2.  If a validation error or service failure occurs, the handler throws a `SystemException` (or a subclass like `BadRequestException`) initialized with a predefined `SystemError` constant.
3.  Vert.x propagates the exception up the handler chain until it reaches the `failureHandler`.
4.  `ExceptionHandler.handle(RoutingContext rc)` is invoked.
5.  It extracts the `SystemError` from the exception (or defaults to `INTERNAL_SERVER_ERROR` for non-system exceptions).
6.  It builds the JSON response body and sends it back to the client with the appropriate HTTP status code.

## Predefined Errors

`SystemError.java` defines a comprehensive set of static constants for common error scenarios, such as:
*   `VALIDATION_ERROR` (400)
*   `INVALID_REQUEST_BODY` (400)
*   `INVALID_MERCHANT` (400)
*   `PSP_CONNECTION_ERROR` (500)
*   `INTERNAL_SERVER_ERROR` (500)

Handlers typically import these constants (e.g., `import static vn.onepay.pspconnector.common.error.SystemError.*`) for consistent error reporting.

## Examples

**Throwing a validation error:**

```java
if (rc.getBodyAsString().isEmpty()) {
    throw new BadRequestException(INVALID_REQUEST_BODY);
}
```

**Throwing an authorization error:**

```java
if (!requestSignature.equals(serverSignature)) {
    throw new AuthorizationException(INVALID_SERVICE_SIGNATURE);
}
```

**Catching unknown exceptions:**

The `ExceptionHandler` treats any exception not inheriting from `SystemException` as an internal server error, logs it, and returns a generic 500 response.
