---
type: concept
title: System Configuration Reference
description: Configuration properties, environment-specific overrides, and deployment scripts for the PSP Connector OneComm Apple service.
tags: [configuration, deployment, environment, properties, scripts]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:03:17.397Z
sources:
  - id: openwiki-source-10aaa2b53d7b80a058a47bed
    resource: repo://src/main/java/vn/onepay/pspconnector/Main.java
  - id: openwiki-source-53846417de8e0a79b9b703a9
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/DB.java
  - id: openwiki-source-497da8d64c5091eb415989b1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java
  - id: openwiki-source-a01977200ecb2cf14429baf1
    resource: repo://src/main/java/vn/onepay/pspconnector/server/handler/common/ClientAuthorizationHandler.java
  - id: openwiki-source-c1571ab76b35736eeb1ab282
    resource: repo://src/main/java/vn/onepay/pspconnector/server/PSPConnectorServer.java
  - id: openwiki-source-342250f810d369e837aacf96
    resource: repo://src/main/java/vn/onepay/pspconnector/server/vertical/PSPConnectorVertical.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
  - id: openwiki-source-329a43476ea63717afa4ba07
    resource: repo://sync_prod
  - id: openwiki-source-768bac2f49ba983150428dd1
    resource: repo://sync_stg
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

This document outlines the system configuration for the PSP Connector OneComm Apple service. It covers the primary configuration source (`app.properties`), environment-specific overrides, and deployment scripts used to build and release the application.

## Configuration Properties (`app.properties`)

The application's runtime configuration is centralized in `src/main/resources/app.properties`. This file defines settings for the service identity, server, database, external service integrations, and error mapping.

### Service Identity

Properties under `service.*` define the identity of the service within the OnePay ecosystem, used primarily for client authorization and routing.

| Property | Description | Example Value |
| :--- | :--- | :--- |
| `service.name` | Unique name of the service. | `psp-connector-onecomm-apple` |
| `service.region` | Geographical or logical region of the service. | `onepay` |
| `service.authorization.type` | Authorization type required by clients. | `ows1_request` |
| `service.authorization.algorithm` | Algorithm used for signature validation. | `OWS1-HMAC-SHA256` |

### Server Configuration

Properties under `server.*` control the Vert.x HTTP server behavior, including network binding, threading, and timeouts.

| Property | Description | Default/Example |
| :--- | :--- | :--- |
| `server.host` | Network interface to bind the server. | `0.0.0.0` |
| `server.port` | Port number the server listens on. | `38681` |
| `server.api.prefix` | Base path prefix for all API routes. | `/psp-connector-onecomm-apple/api/v1` |
| `server.worker.poolsize` | Number of worker threads. | `10` |
| `server.eventloop.poolsize` | Number of event loop threads. | `2` |
| `server.thread.checkinterval` | Interval (ms) to check for blocked threads. | `50000` |
| `server.connection.keepalive` | Enable TCP keep-alive. | `true` |
| `server.connection.timeout` | Request processing timeout (ms). | `180000` |
| `server.connection.idle.timeout` | Connection idle timeout (seconds). | `120` |
| `server.max.worker.execute.time` | Max execution time for worker threads (ms). | `60000` |
| `server.max.eventloop.execute.time` | Max execution time for event loop threads (ms). | `60000` |

### Database Configuration

Properties under `database.*` configure the Oracle database connection pool (HikariCP).

| Property | Description | Example Value |
| :--- | :--- | :--- |
| `database.url` | JDBC connection string. | `jdbc:oracle:thin:@db.onepay.vn:1521:orcl` |
| `database.username` | Database username. | `psp_connector` |
| `database.password` | Database password. | `psp_connector` |
| `database.min.pool.size` | Minimum number of idle connections. | `0` |
| `database.max.pool.size` | Maximum number of connections in the pool. | `5` |
| `database.idle.timeout` | Max time (ms) a connection can sit idle. | `30000` |
| `database.validation.timeout` | Timeout (ms) for connection validation. | `1000` |
| `database.connection.timeout` | Max time (ms) to wait for a connection. | `10000` |
| `database.connection.testquery` | SQL query used to validate connections. | `select null from dual` |

### External Service Configuration

Properties under `onesm.*` and other top-level keys configure connections to external services like OneSM and the Onecomm payment gateway.

| Property | Description | Example Value |
| :--- | :--- | :--- |
| `onesm.service.url` | Base URL for the OneSM service. | `http://localhost/onesm/api/v1` |
| `onesm.service.client.id` | Client ID for OneSM authentication. | `tsp` |
| `onesm.service.client.key` | Client key for OneSM authentication. | `4BBF7853...` |
| `onecomm_service_url` | URL for the Onecomm payment service endpoint. | `http://localhost/onecomm-payservice-apple/execute` |
| `access_key.TSP` | Access key for TSP client authorization. | `KEY_39A3F6ED...` |
| `access_key.WSP` | Access key for WSP client authorization. | `rFTiFRSqsJ5...` |
| `access_key.MSP` | Access key for MSP client authorization. | `m9XB2cvDGUg...` |

### Onecomm Status Codes

The application maps Onecomm gateway response codes to system-internal error statuses using properties with the pattern `onecomm.status.<code>.code` and `onecomm.status.<code>.desc`.

Example mapping:
```properties
onecomm.status.1.code=ONECOMM_BANK_DECLINED
onecomm.status.1.desc=Bank Declined Transaction
```

These properties are read by `OnecommGateway.getFailedReason()` to generate standardized error responses.

## Deployment Scripts

The repository includes shell scripts for building and deploying the application to different environments. All scripts use Maven for building and `rsync` for file synchronization.

### `sync_prod` - Production Deployment

Deploys the application to the production server (`dc`) on port `7100`.

**Workflow:**
1. **Build**: Runs `mvn clean package` using JDK 11.
2. **Sync**: Uses `rsync` to transfer the `target/classes` and `target/lib` directories to the remote server's temporary deployment folder.
3. **Apply**: Connects via SSH to verify changes using `meld` and runs the `setown` script to finalize permissions/ownership.

```bash
env JAVA_HOME=/usr/java/jdk-11 mvn clean && env JAVA_HOME=/usr/java/jdk-11 mvn -U package
rsync -av --progress --delete --delete-excluded --rsh='ssh -p7100' \
  --include=classes \
  --include=lib \
  --include=classes/** \
  --include=lib/* \
  --exclude=* \
  target/ root@dc:/root/tmp_deploy/psp-connector-onecomm-apple/

ssh root@dc -p 7100 -X 'meld /root/tmp_deploy/psp-connector-onecomm-apple/ /opt/psp-connector-onecomm-apple/ && /opt/psp-connector-onecomm-apple/setown'
```

### `sync_stg` - Staging Deployment

Deploys the application to the staging server (`dc`) on port `7010`. The workflow is identical to production but uses a different SSH port.

```bash
env JAVA_HOME=/usr/java/jdk-11 mvn clean && env JAVA_HOME=/usr/java/jdk-11 mvn -U package
rsync -av --progress --delete --delete-excluded --rsh='ssh -p7010' \
  --include=classes \
  --include=lib \
  --include=classes/** \
  --include=lib/* \
  --exclude=* \
  target/ root@dc:/root/tmp_deploy/psp-connector-onecomm-apple/

ssh root@dc -p 7010 -X 'meld /root/tmp_deploy/psp-connector-onecomm-apple/ /opt/psp-connector-onecomm-apple/ && /opt/psp-connector-onecomm-apple/setown'
```

### `sync_dr_100` - Disaster Recovery Sync

Synchronizes the build artifacts to a secondary disaster recovery server (`l`). This script only performs the `rsync` step and does not include the build or apply phases, implying it syncs an existing build.

```bash
rsync -av --progress --delete --delete-excluded --rsh='ssh -p7100' \
  --include=classes \
  --include=lib \
  --include=classes/** \
  --include=lib/* \
  --exclude=* \
  target/ root@l:/root/tmp_deploy/psp-connector-onecomm-apple/
```

## Environment-Specific Overrides

While `app.properties` provides default values, the system supports overriding these values via Java system properties at startup. For example, `Config.java` reads `onecomm_service_url` and `uri_prefix` using `System.getProperty`, falling back to hardcoded defaults if not provided. This allows different environments (Staging vs. Production) to be configured via command-line arguments (e.g., `-Donecomm_service_url=...`) without modifying the properties file directly.
