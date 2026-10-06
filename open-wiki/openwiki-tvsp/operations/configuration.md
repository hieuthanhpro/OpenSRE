---
type: concept
title: TSP Vault Configuration
description: Documents the runtime configuration, properties, and environment variables for the TSP Vault application, including database, cache, server, and service settings.
tags: [configuration, properties, environment variables, runtime, setup]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:02:32.401Z
sources:
  - id: openwiki-source-7e02c4222be6115e64857f27
    resource: repo://src/main/java/vn/onepay/tsp/vault/cache/ApplicationCache.java
  - id: openwiki-source-56dc220ae3eb0d94ee15eda7
    resource: repo://src/main/java/vn/onepay/tsp/vault/Main.java
  - id: openwiki-source-22c51dd0f924ce3195ef7770
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/TSPVaultServer.java
  - id: openwiki-source-f2afadef62412b791b8aadc7
    resource: repo://src/main/java/vn/onepay/tsp/vault/service/OneSMService.java
  - id: openwiki-source-86222e9c18bdb5718a8d7d86
    resource: repo://src/main/java/vn/onepay/tsp/vault/util/AppUtil.java
  - id: openwiki-source-cbb6d9e19acc95849592c33b
    resource: repo://src/main/java/vn/onepay/tsp/vault/util/TokenGenerator.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:02:32.401Z" }
---

# Configuration

The TSP Vault application (`tvsp`) relies on a central properties file located at `src/main/resources/app.properties` for its runtime configuration. These properties control every major subsystem: HTTP server, database connection, caching, external security services (OneSM), token generation, and instrument processing.

## Overview

The configuration is loaded and processed at application startup (`Main.java`). The system uses a `TemplateProcessor` (from an external library) to dynamically resolve sensitive values (like database credentials) from a secure configuration store before the application initializes its components.

## Configuration Processing

At startup (`Main.main`), the application performs the following steps:

1.  **Load Properties File**: It locates `app.properties` in the classpath.
2.  **Template Processing**: A `TemplateProcessor` instance reads the file and replaces placeholders like `{{ tvsp/config/database_username }}` with actual values retrieved from a secure backend. This ensures that sensitive data is not hardcoded in the repository.
3.  **Property Parsing**: The processed string is re-loaded into a `Properties` object.
4.  **Component Initialization**: These properties are then used to configure:
    *   **HikariCP Data Source**: Database connection pool settings.
    *   **Application Cache**: Size and timeout for the Guava cache.
    *   **Server Configuration**: Host, port, worker threads, and timeouts for the Vert.x HTTP server.
    *   **Service Integration**: URLs and credentials for the OneSM security service.
    *   **Token Generation**: Prefixes, lengths, and expiration rules for generated tokens.

## Key Configuration Properties

### Server Configuration
Controls the Vert.x HTTP server behavior.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `server.host` | Bind address for the HTTP server. | `0.0.0.0` |
| `server.port` | Listening port for the HTTP server. | `28582` |
| `server.worker.poolsize` | Number of worker threads for blocking operations. | `50` |
| `server.eventloop.poolsize` | Number of event loop threads. | `2` |
| `server.thread.checkinterval` | Interval (ms) to check for blocked threads. | `10000` |
| `server.connection.keepalive` | Enable TCP keep-alive. | `true` |
| `server.connection.timeout` | Connection timeout (ms). | `15000` |
| `server.connection.idle.timeout` | Idle connection timeout (seconds). | `120` |
| `server.max.worker.execute.time` | Max time (ms) a worker thread can execute. | `60000` |
| `server.max.eventloop.execute.time` | Max time (ms) an event loop thread can execute. | `60000` |
| `service.base_path` | Base URL path for all API endpoints. | `/tvsp/api/v2` |

### Database Configuration
Configures the HikariCP connection pool for Oracle.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `database.url` | JDBC URL (supports placeholders). | `jdbc:oracle:thin:...` |
| `database.username` | Database username (supports placeholders). | `{{ tvsp/config/... }}` |
| `database.password` | Database password (supports placeholders). | `{{ tvsp/config/... }}` |
| `database.min.pool.size` | Minimum idle connections. | `0` |
| `database.max.pool.size` | Maximum active connections. | `50` |
| `database.idle.timeout` | Idle connection timeout (ms). | `120000` |
| `database.validation.timeout` | Validation timeout (ms). | `5000` |
| `database.connection.timeout` | Connection acquisition timeout (ms). | `60000` |
| `database.max.lifetime` | Maximum connection lifetime (ms). | `300000` |
| `database.connection.testquery` | SQL query for connection validation. | `select null from dual` |

### Cache Configuration
Configures the Google Guava in-memory cache used for client keys.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `cache.size` | Maximum number of entries in the cache. | `1000` |
| `cache.timeout` | Entry expiration time (seconds). | `86400` (24 hours) |

### OneSM Configuration
Configures the connection to the OnePAY Security Manager (OneSM) for encryption and HMAC operations.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `onesm.service.url` | Base URL of the OneSM service. | `http://localhost/onesm/api/v1` |
| `onesm.service.client.id` | Client identifier for OneSM authentication. | `tspvault` |
| `onesm.service.client.key` | Client secret key for OneSM (supports placeholders). | `{{ tvsp/config/... }}` |
| `onesm.service.aes.key.label` | Key label for AES encryption. | `tspvault.aes` |
| `onesm.service.hmac.key.label` | Key label for HMAC signing. | `tspvault.hmac` |
| `onesm.service.connection.timeout` | Connection timeout to OneSM (ms). | `60000` |

### Instrument Configuration
Configures how financial instruments (cards, accounts) are handled.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `instrument.accept.types` | Comma-separated list of accepted instrument types. | `card,sacombank_card,...` |
| `instrument.mask.regexp` | Regular expression for masking instrument numbers. | `(\d{6})\d+(\d{4})` |
| `instrument.mask.replacement` | Replacement pattern for masking. | `$1xxxxxx$2` |
| `card.bin.*.check.regexp` | Regular expressions for card BIN validation (Visa, Master, etc.). | Various regex patterns |

### Token Configuration
Configures the generation and lifecycle of tokens.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `token.reserved` | Whether tokens are reserved. | `false` |
| `token.number.prefix.length` | Length of the token prefix (preserved from original number). | `6` |
| `token.number.suffix.length` | Length of the token suffix (preserved from original number). | `0` |
| `token.number.prefix.default` | Default prefix for account tokens. | `970499` |
| `token.number.length.default` | Default total length for generated token numbers. | `16` |
| `token.expiration.month` | Token validity period in months. | `48` |

### Service Configuration
General service metadata.

| Property | Description | Default Value |
| :--- | :--- | :--- |
| `service.name` | Service identifier. | `tvsp` |
| `service.region` | Region identifier. | `onepay` |
| `service.authorization.type` | Authorization header type. | `ows1_request` |
| `service.authorization.algorithm` | HMAC algorithm used. | `OWS1-HMAC-SHA256` |
