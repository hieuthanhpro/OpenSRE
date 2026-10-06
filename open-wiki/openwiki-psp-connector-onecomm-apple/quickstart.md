---
type: quickstart
title: Quickstart
description: Entry point and build configuration for the PSP Connector OneComm Apple application.
tags: [setup, build, dependencies, environment, deployment]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:03:17.397Z
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-59577af2d900e3abe382ea36
    resource: repo://src/main/java/vn/onepay/pspconnector/LogMaskingConverter.java
  - id: openwiki-source-10aaa2b53d7b80a058a47bed
    resource: repo://src/main/java/vn/onepay/pspconnector/Main.java
  - id: openwiki-source-c1571ab76b35736eeb1ab282
    resource: repo://src/main/java/vn/onepay/pspconnector/server/PSPConnectorServer.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
  - id: openwiki-source-86b9405caa62185ac5f7891d
    resource: repo://src/main/resources/log4j2.xml
  - id: openwiki-source-85f828023b9f93b05d985383
    resource: repo://sync_dr_100
  - id: openwiki-source-329a43476ea63717afa4ba07
    resource: repo://sync_prod
  - id: openwiki-source-768bac2f49ba983150428dd1
    resource: repo://sync_stg
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

This page covers how to set up, build, and run the **PSP Connector OneComm Apple** service—a Vert.x-based HTTP server that bridges OnePay clients to the Onecomm payment gateway.

## Prerequisites

- **Java 11** (JDK 11) — the Maven compiler source/target is set to 11 in the POM.
- **Apache Maven** — used to resolve dependencies, compile, and package the application.
- **Oracle JDBC driver** is pulled automatically via Maven; no manual installation is required.

## Project Coordinates

| Field | Value |
| :--- | :--- |
| GroupId | `vn.onepay.pspconnector` |
| ArtifactId | `psp-connector-onecomm-apple` |
| Version | `20230401` |

## Key Dependencies

The application is a Java 11 Vert.x application backed by an Oracle database via HikariCP.

| Library | Version | Purpose |
| :--- | :--- | :--- |
| Vert.x Web | 3.9.4 | HTTP server and routing |
| Netty | 4.1.53.Final | Underlying network transport |
| HikariCP | 3.4.5 | JDBC connection pooling |
| Oracle JDBC (ojdbc8) | 19.7.0.0 | Oracle database connectivity |
| Jackson | 2.11.3 | JSON serialization |
| Log4j2 | 2.17.1 | Logging (async, with LMAX Disruptor 3.4.4) |
| OnePAY OWS | 1.0.20180528 | Request signature/authorization |
| JUnit | 4.12 | Unit testing (test scope) |

Dependency JARs are copied to `target/lib/` during the `prepare-package` phase via `maven-dependency-plugin`.

## Building

Run a full Maven build from the project root:

```bash
env JAVA_HOME=/usr/java/jdk-11 mvn clean && env JAVA_HOME=/usr/java/jdk-11 mvn -U package
```

- `-U` forces Maven to check remote repositories for snapshot updates.
- Tests are **skipped** by default (`<skipTests>true</skipTests>` in `pom.xml`).
- The deployable output consists of two directories: `target/classes/` (compiled classes and resources) and `target/lib/` (dependency JARs).

## Application Entry Point

The `Main` class (`vn.onepay.pspconnector.Main`) bootstraps the entire service in a single `main` method. At startup it performs the following steps in order:

1. **Load configuration** — reads `app.properties` from the classpath into a static `Properties` object.
2. **Initialize the database pool** — creates a HikariCP `HikariDataSource` pointed at the Oracle database, configured entirely from `database.*` properties.
3. **Configure client authorization** — sets static fields on `ClientAuthorizationHandler` for service name, region, and OWS1 HMAC-SHA256 signature validation.
4. **Create the PSP provider** — instantiates `OnecommPaymentServiceProvider` with credentials for card verification (`verify_card.*` properties) and injects it into the handler classes that need it (`PurchaseHandler`, `AuthorizationPatchHandler`, `RefundPostHandler`, `InstrumentRegistrationHandler`).
5. **Inject the data source** into service classes (`AuthorizationService`, `PaymentService`, `RefundService`) and the `DB` utility.
6. **Start the HTTP server** — creates a `PSPConnectorServer` with worker/event-loop pool sizes and timeout values, then deploys a `PSPConnectorVertical` Verticle that binds the Vert.x HTTP server to the configured host and port.

## Configuration

All runtime configuration lives in `src/main/resources/app.properties`. Key sections:

- **`service.*`** — service identity and authorization algorithm (`OWS1-HMAC-SHA256`).
- **`server.*`** — host, port, API prefix (`/psp-connector-onecomm-apple/api/v1`), thread pool sizes, timeouts, and keep-alive settings.
- **`database.*`** — Oracle JDBC URL, credentials, HikariCP pool sizing, and connection validation.
- **`onesm.*`** — OneSM security service endpoint and client credentials.
- **`access_key.*`** — per-client authorization keys (TSP, WSP, MSP).
- **`onecomm.status.*`** — mapping of Onecomm gateway numeric response codes to internal error names and descriptions.
- **`onecomm_service_url`** / **`verify_card.*`** — Onecomm payment gateway endpoint and card verification merchant credentials.

See the [Configuration Reference](/openwiki/concepts/configuration.md) for a full property listing.

## Running Locally

After building, the application can be run directly with:

```bash
java -cp target/classes:target/lib/* vn.onepay.pspconnector.Main
```

The Vert.x HTTP server will start on `0.0.0.0:38681` (by default) and expose API routes under `/psp-connector-onecomm-apple/api/v1`.

Configuration can be overridden via Java system properties (e.g., `-Dserver.port=8080`). The `Config.java` class reads some properties via `System.getProperty()` with fallbacks to `app.properties` defaults.

## Logging

Logging is configured via `src/main/resources/log4j2.xml` and outputs to:

- A **rolling file** (path set by the `log` system property).
- A **Graylog GELF socket** at `log.onepay.vn:12201` (UDP) for centralized log aggregation.

The `LogMaskingConverter` class provides sensitive-data masking in log output.

## Deployment

The repository includes three shell scripts for deploying to different environments. All use `rsync` over SSH to transfer `target/classes/` and `target/lib/` to a remote staging directory, followed by an operator-driven apply step.

| Script | Target | SSH Port | Steps |
| :--- | :--- | :--- | :--- |
| `sync_prod` | Production (`dc`) | 7100 | Build → rsync → meld diff → `setown` |
| `sync_stg` | Staging (`dc`) | 7010 | Build → rsync → meld diff → `setown` |
| `sync_dr_100` | Disaster Recovery (`l`) | 7100 | rsync only (assumes existing build) |

On production and staging, the apply step opens a visual diff (`meld`) between the staging area (`/root/tmp_deploy/psp-connector-onecomm-apple/`) and the live directory (`/opt/psp-connector-onecomm-apple/`), then runs the `setown` script to finalize ownership and permissions.

The DR script performs a file-only sync with no build or apply, suggesting it mirrors a previously validated build.

See the [Deployment](/openwiki/operations/deployment.md) page for detailed documentation.

## Project Structure

```
pom.xml                                          ← Maven build definition
src/main/java/
  vn/onepay/pspconnector/
    Main.java                                    ← Application entry point
    LogMaskingConverter.java                     ← Log masking for sensitive data
    common/
      error/                                     ← System error definitions
      exception/                                 ← Custom exception types
      service/                                   ← Service layer (Authorization, Payment, Refund, etc.)
      util/                                      ← Utilities (crypto, HTTP, DB procedures, constants)
    provider/
      PaymentServiceProvider.java                ← Abstract provider interface
      onecomm/
        OnecommPaymentServiceProvider.java        ← Onecomm provider implementation
        OnecommGateway.java                       ← HTTP client for Onecomm gateway
        Config.java                               ← Runtime property overrides
        DB.java                                   ← Database access helper
    server/
      PSPConnectorServer.java                     ← Server bootstrap and Vert.x deployment
      vertical/PSPConnectorVertical.java          ← Vert.x Verticle with HTTP routing
      routing/RoutePool.java                      ← API route constants
      handler/                                    ← Request handlers per endpoint
src/main/resources/
  app.properties                                  ← Runtime configuration
  log4j2.xml                                      ← Logging configuration
sync_prod, sync_stg, sync_dr_100                 ← Deployment scripts
```

## Next Steps

- [Vert.x Server Architecture](/openwiki/architecture/server.md) — request lifecycle and routing details.
- [Configuration Reference](/openwiki/concepts/configuration.md) — full property documentation.
- [Deployment](/openwiki/operations/deployment.md) — environment-specific deployment procedures.
