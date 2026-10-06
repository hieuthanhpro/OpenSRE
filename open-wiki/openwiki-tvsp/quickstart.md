---
type: quickstart
title: Quick Start
description: Entry point for developers; overview of architecture and how to build and run the TSP Vault system.
tags: [quickstart, getting-started, build, run, configuration, developer-guide]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:02:32.401Z
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-56dc220ae3eb0d94ee15eda7
    resource: repo://src/main/java/vn/onepay/tsp/vault/Main.java
  - id: openwiki-source-58a23a6e532b87162a8b6628
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/handler/instrument/InstrumentPostHandler.java
  - id: openwiki-source-07053b01d1e268f7b3d098d8
    resource: repo://src/main/java/vn/onepay/tsp/vault/server/vertical/TSPVaultVertical.java
  - id: openwiki-source-947cc9b8d56b1315d6ecdb4e
    resource: repo://src/main/java/vn/onepay/tsp/vault/service/InstrumentService.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:02:32.401Z" }
---

# Quick Start

The **TSP Vault** (Token Service Provider Vault) is a Java-based secure storage and tokenization service for payment instruments. It is built with **Java 11**, **Vert.x**, and **Oracle Database**.

This guide helps you set up your local development environment, build the project, and run the application.

## Prerequisites

- **Java 11** (JDK 11)
- **Maven** (3.6+ recommended)
- **Oracle Database** connectivity (or a mock environment if applicable)

## Project Structure

The project is a standard Maven structure:

```text
tvsp/
├── pom.xml                              # Maven configuration
├── src/
│   ├── main/
│   │   ├── java/vn/onepay/tsp/vault/
│   │   │   ├── Main.java                # Application entry point
│   │   │   ├── server/                  # HTTP Server (Vert.x)
│   │   │   ├── service/                 # Business logic (Instrument, Token, OneSM)
│   │   │   └── util/                    # Utilities and helpers
│   │   └── resources/
│   │       ├── app.properties           # Configuration file
│   │       └── log4j2.xml               # Logging configuration
│   └── test/                            # Unit tests
└── bin/                                 # Build scripts (optional)
```

## Building the Project

To compile and package the application, run the following Maven command from the root directory:

```bash
mvn clean package
```

*Note: Tests are skipped by default in the `pom.xml` configuration (`<skipTests>true</skipTests>`).*

This will generate a packaged artifact in the `target/` directory.

## Running the Application

Once the build is successful, you can run the application using the main class:

```bash
java -cp target/tvsp-1.0.20190926.jar:target/lib/* vn.onepay.tsp.vault.Main
```

*Alternatively, if the build produces a fat jar (check `pom.xml` for shade/assembly plugins, though standard here copies dependencies to `lib/`):*

```bash
mvn exec:java -Dexec.mainClass="vn.onepay.tsp.vault.Main"
```

### Configuration

The application reads configuration from `src/main/resources/app.properties`. Key configurations are loaded at startup using `TemplateProcessor`.

**Important Configuration Keys:**
- `server.host` / `server.port`: Network binding (Default: `0.0.0.0:28582`)
- `database.*`: Oracle DB connection settings (JDBC URL, pool size)
- `onesm.*`: Integration settings for the OnePAY Security Manager (OneSM)
- `token.*`: Token generation rules (prefix, length, expiration)

For full configuration details, see the [Configuration](/openwiki/operations/configuration.md) page.

## Architecture Overview

The system follows a layered architecture:

1.  **Entry Point (`Main`)**: Bootstraps the Vert.x server, database connection pool (HikariCP), and initializes services.
2.  **Server Layer (`TSPVaultVertical`)**: Defines the REST API routes and middleware (Logging, Auth, Exception Handling).
3.  **Handler Layer**: Processes specific HTTP requests (Instrument/Token CRUD).
4.  **Service Layer**: Contains the core business logic (Tokenization, Instrument Management, OneSM Integration).
5.  **Data Layer**: Interacts with the Oracle Database via stored procedures (`DBProcedureUtil`).

For more details, see the [System Overview](/openwiki/architecture/system-overview.md).

## Testing the API

The API is secured using HMAC-SHA256 signatures. A typical request requires the following headers:
- `X-OP-Date`: Request timestamp.
- `X-OP-Expires`: Request expiration.
- `X-OP-Authorization`: Authorization token (signature).

Once running, the API listens on port `28582` with base path `/tvsp/api/v2`.

## Key Dependencies

- **Vert.x**: High-performance, event-driven HTTP server.
- **Oracle JDBC**: Database connectivity.
- **HikariCP**: High-performance JDBC connection pool.
- **OneSM**: OnePAY Security Manager client for encryption and signing.
- **Guava**: Caching and utilities.

## Troubleshooting

- **Port Conflict**: If port 28582 is in use, change `server.port` in `app.properties`.
- **Database Connection**: Ensure your Oracle DB is reachable and credentials in `app.properties` are correct (or placeholders are resolved).
- **Logging**: Check `log4j2.xml` and the configured log file path for runtime errors.
