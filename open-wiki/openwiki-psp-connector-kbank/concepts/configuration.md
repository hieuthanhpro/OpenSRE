---
type: concept
title: Configuration & Setup
description: Describes how the psp-connector-kbank application loads configuration, what properties control server and database behavior, how environment variables are used, and how the startup wiring maps properties into runtime components.
tags: [configuration, properties, database, deployment, vert.x, hikaricp, kbank, msp]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:01:46.974Z
sources:
  - id: openwiki-source-83e662a0e6ae1ee83d4fe6be
    resource: repo://src/main/java/vn/onepay/pspconnector/Config.java
  - id: openwiki-source-10aaa2b53d7b80a058a47bed
    resource: repo://src/main/java/vn/onepay/pspconnector/Main.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
  - id: openwiki-source-86b9405caa62185ac5f7891d
    resource: repo://src/main/resources/log4j2.xml
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:01:46.974Z" }
---

# Configuration & Setup

This page explains how the application is configured, what the configuration sources are, how database and server settings are wired at startup, and what operational knobs are available.

## Configuration source

The application uses a single classpath properties file as its primary configuration source:

- `repo://src/main/resources/app.properties`

`Main.main` loads this file into a shared `java.util.Properties` instance:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L30-L35`

There is no externalized configuration loader, profile mechanism, or `application-{env}.properties` layering in the current codebase. Environment-specific differences are therefore handled by deploying different property files or JVM-level overrides.

## Property groups

`app.properties` is organized into five logical groups.

### Service identity and authorization

These properties identify the service and define the request signing behavior expected by upstream components.

| Property | Default / current value | Purpose |
| --- | --- | --- |
| `service.name` | `psp-connector-kbank` | Logical service name used for client authorization headers. |
| `service.region` | `onepay` | Region scope used in authorization context. |
| `service.authorization.type` | `ows1_request` | Authorization scheme type. |
| `service.authorization.algorithm` | `OWS1-HMAC-SHA256` | Signature algorithm for client authorization. |

In `Main.main`, these values are assigned into `ClientAuthorizationHandler` and the shared `Properties` instance:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L60-L64`

### Server configuration

These properties control the embedded HTTP server built on Vert.x.

| Property | Current value | Purpose |
| --- | --- | --- |
| `server.host` | `0.0.0.0` | Bind address. |
| `server.port` | `28680` | HTTP listen port. |
| `server.api.prefix` | `/psp-connector-kbank/api/v1` | Base path for exposed REST endpoints. |
| `server.worker.poolsize` | `10` | Vert.x worker thread pool size. |
| `server.eventloop.poolsize` | `1` | Vert.x event loop thread pool size. |
| `server.thread.checkinterval` | `50000` | Blocked thread check interval. |
| `server.connection.keepalive` | `true` | HTTP keep-alive toggle. |
| `server.connection.timeout` | `180000` | Connection timeout in milliseconds. |
| `server.connection.idle.timeout` | `120` | Idle connection timeout. |
| `server.max.worker.execute.time` | `60000` | Max worker execution time before blocked-thread detection. |
| `server.max.eventloop.execute.time` | `60000` | Max event loop execution time before blocked-thread detection. |

These are wired into `PSPConnectorServer` and then into `PSPConnectorVertical` during startup:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L91-L104`
- `repo://src/main/java/vn/onepay/pspconnector/server/PSPConnectorServer.java#L53-L66`

### Database configuration

Database connectivity uses HikariCP with an Oracle datasource. The relevant properties are:

| Property | Current value | Purpose |
| --- | --- | --- |
| `database.url` | `jdbc:oracle:thin:@db.onepay.vn:1521:orcl` | Oracle JDBC URL. |
| `database.username` | `psp_connector` | Database user. |
| `database.password` | `psp_connector` | Database password. |
| `database.min.pool.size` | `0` | Minimum idle connections. |
| `database.max.pool.size` | `5` | Maximum pool size. |
| `database.idle.timeout` | `30000` | Idle connection timeout in milliseconds. |
| `database.validation.timeout` | `1000` | Validation timeout in milliseconds. |
| `database.connection.timeout` | `60000` | Connection acquisition timeout in milliseconds. |
| `database.connection.testquery` | `select null from dual` | Oracle keepalive/validation query. |

Startup builds the `HikariConfig` from these properties and creates a `HikariDataSource` named `PSP_DB_POOL`. Fail-fast on startup is disabled by setting initialization fail timeout to `-1`:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L37-L54`

The resulting datasource is assigned into shared service-layer fields:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L66-L76`

This means the same connection pool backs authorization, payment, refund, capture, void, and KBank persistence operations.

### Access keys

Static access keys for TSP, WSP, and MSP consumers are stored in the properties file:

- `repo://src/main/resources/app.properties#L35-L37`

These values are used in authorization and signature generation flows. The MSP access key ID and secret are also exposed through `Config`:

- `repo://src/main/java/vn/onepay/pspconnector/Config.java#L67-L73`

### KBank integration properties

The KBank partner/gateway section is the most sensitive and largest configuration block.

| Property | Purpose |
| --- | --- |
| `kbank.host` | Base host for KBank API calls. |
| `kbank.path` | API path appended to the host. |
| `kbank.token` | Partner token. |
| `kbank.code` | Partner code. |
| `kbank.partner_id` | Partner identifier. |
| `kbank.language` | Response language. |
| `kbank.partner_uid` | Partner UID used in request flow. |
| `kbank.encryption_path` | Filesystem path to the initialization vector used by KBank security operations. |
| `kbank.onepay_private` | PEM-encoded RSA private key material. |
| `kbank.kbank_public` | PEM-encoded RSA public key material. |

During startup, `Main.main` assigns the first eight KBand values directly into `KBankGateway` and the encryption material into `KBankSecurity`:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L78-L89`

### MSP properties

MSP connection properties define how the connector reaches the MSP backend.

| Property | Default / current value | Purpose |
| --- | --- | --- |
| `msp.url` | `http://localhost/msp/api/v1` | Base MSP URL. |
| `msp.uri_prefix` | `/msp/api/v1` | URI prefix used locally. |
| `msp.access_key_id` | `PSP_CONNECTOR_KBANK` | MSP access key identity. |
| `msp.secret_access_key` | `8478ddfac9b674cad7056c276020b43b` | MSP secret. |
| `msp.timeout` | `60000` | MSP request timeout in milliseconds. |
| `msp.region` | `onepay` | MSP region. |
| `msp.service` | `msp` | MSP service name. |

`Config.java` provides typed getters for these values with fallback defaults:

- `repo://src/main/java/vn/onepay/pspconnector/Config.java#L46-L73`

`Config.java` also exposes KBank and domain defaults, such as `getMspUrl`, `getPartnerUID`, and `getDefaultURL`. These defaults may not match the deployed environment and should not be treated as authoritative without explicit override in `app.properties`.

## Environment variables

The codebase does not read environment variables directly for database, MSP, KBank, or server settings. The only environment-driven configuration is in logging:

- `repo://src/main/resources/log4j2.xml#L1-L31`

Log4j2 expects:

- `${env:app}` to identify the application name for log routing.
- `${sys:log}` to define the rolling log file path.

This means logging requires at least the `app` environment variable and the `log` system property to be set at runtime. If they are missing, log routing and file naming degrade to unresolved placeholders.

## Database setup

The database setup is Oracle-specific and lives entirely in the HikariCP wiring inside `Main.main`:

- `repo://src/main/java/vn/onepay/pspconnector/Main.java#L37-L54`

Key points:

- Datasource class: `oracle.jdbc.pool.OracleDataSource`
- Validation query: `select null from dual`
- Default pool size is small: minimum `0`, maximum `5`
- Initialization fail-fast is disabled, so the application can start even if the database is temporarily unreachable; failures surface later when handlers query the pool.

Related database procedures and utilities are under:

- `repo://src/main/java/vn/onepay/pspconnector/common/util/DBProcedureUtil.java`
- `repo://src/main/java/vn/onepay/pspconnector/common/util/ProcedurePool.java`
- `repo://src/main/java/vn/onepay/pspconnector/provider/kbank/DB.java`

## Startup wiring summary

At a high level, `Main.main` performs the following configuration steps:

1. Load `app.properties` into a shared `Properties` object.
2. Build an Oracle `HikariDataSource` from `database.*` properties.
3. Assign the datasource into service-layer singletons for authorization, payment, refund, capture, void, and KBank persistence.
4. Assign KBand gateway, token, partner, and security material from `kbank.*` properties.
5. Assign MSP identity and timeout settings.
6. Build Vert.x server and deployment options from `server.*` properties.
7. Start the server via `PSPConnectorServer.init()`.

This means configuration is static after startup; there is no reload or dynamic refresh mechanism in the current codebase.

## Operational notes

- **Secrets in properties**: `app.properties` contains credentials, encryption material, and private keys in plaintext. Deployment workflows should treat this file as sensitive and avoid checking production values into source control.
- **Encryption file path**: `kbank.encryption_path` points to a filesystem resource outside the JAR. That file must exist on every host at the same path.
- **Oracle dependency**: The application fails to build or start without Oracle JDBC classes and an available Oracle service at the configured URL.
- **Blocked-thread detection**: The Vert.x options use relatively tight max worker and event loop execution times (`60000` ms). Long-running handler work should be offloaded appropriately or these values should be tuned for the target environment.
