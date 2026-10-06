---
type: integration
title: OnePay Security Manager (OneSM)
description: Integration with the external OnePay Security Manager (OneSM) service for AES encryption and HMAC signing of sensitive instrument data.
tags: [security, encryption, integration, HMAC, AES, tokenization, external-service]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:02:32.401Z
sources:
  - id: openwiki-source-56dc220ae3eb0d94ee15eda7
    resource: repo://src/main/java/vn/onepay/tsp/vault/Main.java
  - id: openwiki-source-947cc9b8d56b1315d6ecdb4e
    resource: repo://src/main/java/vn/onepay/tsp/vault/service/InstrumentService.java
  - id: openwiki-source-f2afadef62412b791b8aadc7
    resource: repo://src/main/java/vn/onepay/tsp/vault/service/OneSMService.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:02:32.401Z" }
---

# OnePay Security Manager (OneSM) Integration

The OnePay Security Manager (OneSM) is an external service used by the TSP Vault to securely handle sensitive payment instrument data. It provides cryptographic services to encrypt data at rest (AES) and generate HMAC signatures for data integrity and request validation.

## Core Responsibilities

The `OneSMService` serves as the primary client for the OneSM service, offering the following capabilities:

*   **AES Encryption:** Encrypts sensitive instrument data (e.g., card numbers, names, billing addresses) using AES before storing it in the database.
*   **HMAC Signing:** Generates HMAC-SHA256 signatures for instrument data maps to ensure data integrity and non-repudiation.
*   **Decryption:** Retrieves and decrypts encrypted instrument data when requested by authorized clients.

## Mechanism and Control Flow

### Configuration
The service is configured via static fields in `OneSMService` which are initialized from `app.properties` during application startup (see `Main.java`).

Key configuration parameters include:
*   `onesm.service.url`: The endpoint URL for the OneSM service.
*   `onesm.service.client.id`: The client identifier used for authentication.
*   `onesm.service.client.key`: The hex-encoded client secret key.
*   `onesm.service.aes.key.label`: The key label used for AES operations.
*   `onesm.service.hmac.key.label`: The key label used for HMAC operations.
*   `onesm.service.connection.timeout`: Connection timeout in milliseconds.

### Encryption Flow (`encryptAES`)
1.  **Preparation:** The service constructs a map of instrument data (reference, type, name, number, month, year, etc.).
2.  **External Call:** Calls `OneSMHttpClient.encryptToBase64String` with the configured service URL, client credentials, AES key label, and the data bytes.
3.  **Result:** Returns a Base64-encoded string representing the encrypted data.

### HMAC Signing Flow (`encryptHMAC`)
1.  **Preparation:** Similar to encryption, a map of instrument data is prepared.
2.  **External Call:** Calls `OneSMHttpClient.encryptToBase64String` using the HMAC key label.
3.  **Result:** Returns a Base64-encoded HMAC signature.

### Decryption Flow (`decrypt`)
1.  **Input:** Receives a Base64-encoded encrypted string.
2.  **External Call:** Calls `OneSMHttpClient.decrypt` with the configured credentials and AES key label.
3.  **Result:** Returns the decrypted string (UTF-8 encoded).

## Relationships and Usage

### InstrumentService Integration
The `InstrumentService` heavily relies on `OneSMService` for securing data during the instrument lifecycle:

*   **Instrument Creation (`insert`):** Before inserting a new instrument, `InstrumentService` encrypts the sensitive data map using `OneSMService.encryptAES` and generates an integrity hash using `OneSMService.encryptHMAC`. Both encrypted data and hash are stored in the database.
*   **Instrument Update (`update`):** Similarly, updates trigger re-encryption and re-hashing of the modified instrument data.
*   **Instrument Data Update (`updateInstrumentData`, `updateInstrumentData2`):** Specific update operations that modify partial data (like month/year) also utilize `OneSMService.encryptAES` to refresh the encrypted storage.
*   **Instrument Retrieval (`get`, `format`):** When an instrument is retrieved with the `decrypt` flag set to true, the service calls `OneSMService.decrypt` to restore the sensitive information in plain text.

### InstrumentPatchHandler Usage
The `InstrumentPatchHandler` uses `OneSMService.encryptAES` to encrypt "extra data" (`instrumentDataExtra`) when updating instrument state.

### UpdateInstrumentHandler Usage
The `UpdateInstrumentHandler` uses `OneSMService` to re-encrypt instrument data during specific updates, such as adding missing month/year information for certain PSPs (e.g., ONECOMM).

## Dependencies

The `OneSMService` depends on the external `OneSMHttpClient` library (`com.onesm.client`) to communicate with the OneSM service. The availability and performance of this service are critical for all instrument data operations.

*   **External Dependency:** `OneSMHttpClient` (OneSM Java Client)
*   **Configuration Source:** `app.properties` (via `Main.java` initialization)

## Failure Scenarios

*   **Service Unavailability:** If the OneSM service is unreachable, encryption/decryption operations will fail, likely causing `SystemException` or `DecoderException` to be thrown by the calling services (`InstrumentService`).
*   **Invalid Credentials:** Incorrect `client.id` or `client.key` will lead to authentication failures on the OneSM side.
*   **Timeout:** Long-running requests might time out if `onesm.service.connection.timeout` is too low.

## Configuration Properties

```properties
onesm.service.url=http://localhost/onesm/api/v1
onesm.service.client.id=tspvault
onesm.service.client.key={{ tvsp/config/onesm_service_client_key }}
onesm.service.aes.key.label=tspvault.aes
onesm.service.hmac.key.label=tspvault.hmac
onesm.service.connection.timeout=60000
```
