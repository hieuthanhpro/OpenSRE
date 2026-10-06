---
type: operations-guide
title: Configuration & Operations
description: How the MSP payment service is configured, built, and deployed, covering the single config.json settings file, dynamic connector loading, Vert.x runtime knobs, database pools, and the GitLab CI/CD deployment pipeline.
tags: [configuration, operations, deployment, vertx, connectors, database]
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-c1d3ad7d358550973ffa9bb7
    resource: repo://src/main/java/vn/onepay/msp/Config.java
  - id: openwiki-source-2f7c58118401dd4ae7bab7ed
    resource: repo://src/main/java/vn/onepay/msp/connectors/MSPConnector.java
  - id: openwiki-source-da1743c8ff223fc12d243228
    resource: repo://src/main/java/vn/onepay/msp/connectors/PSPConnector.java
  - id: openwiki-source-e5c36d83bef2a94b76981db9
    resource: repo://src/main/java/vn/onepay/msp/connectors/RSPConnector.java
  - id: openwiki-source-65bd1403a19f4e81726ae943
    resource: repo://src/main/java/vn/onepay/msp/Main.java
  - id: openwiki-source-4cd7e20f615762231df1304f
    resource: repo://src/main/java/vn/onepay/msp/Server.java
  - id: openwiki-source-9d8fe87a238862d1ebfb1562
    resource: repo://src/main/resources/config.json
generated: { by: "openwiki/0.5.2", at: "2026-09-22T07:52:36.277Z" }
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:48:15.044Z
---

# Configuration & Operations

This page documents how the MSP (Merchant Service Platform) payment service is configured, built, and deployed. It covers the single JSON settings file that drives all runtime behavior, how connectors are loaded dynamically from that config, the Vert.x runtime tuning parameters, database connection pools, credential/key material, and the CI/CD pipeline that ships the artifact to production.

## Architecture context

The MSP service exposes a large REST API surface (invoices, payments, refunds, voids, QR, authorizations, tokens, migrations, settlements) on a Vert.x HTTP server. All behavior beyond the server skeleton is configured through one resource file, `src/main/resources/config.json`, which is packaged into the built artifact and read at startup. The service is the orchestration hub for a large family of payment connectors: on-us (OnePAY) channels, off-us bank/acquirer connectors, PSP (payment service provider) connectors, QR schemes, and merchant extension connectors.

## The configuration file

### Loading mechanism

`vn.onepay.msp.Config` loads the entire `config.json` from the classpath in a static initializer and caches it in a public `JsonObject config` field. Every accessor method reads from this cached object; there is no externalized configuration store or environment-based override path in the current implementation. This means a configuration change requires a rebuild/repackage or a runtime edit plus restart, not a hot reload.

The `Config` class exposes strongly typed accessors for every section: server (`getServerPort`, `getUriPrefix`, authorization region/service/algorithm/terminator), database pools, SMS, TSP, FSP, PSP-connector, MSP/RSP/CSP/void/merchant connector arrays, onebill, vpc error mapping, instrument masking, Vietin QR keys, Samsung config, and more.

### Server and Vert.x runtime

The `server` section of `config.json` controls the HTTP listener and Vert.x runtime:

| Key | Default | Purpose |
| --- | --- | --- |
| `server.port` | 8000 | HTTP listen port |
| `server.uri_prefix` | `/msp/api/v1` | URL prefix prepended to every registered route |
| `server.authorization.region` | `onepay` | OWS authorization region |
| `server.authorization.service` | `msp` | OWS authorization service name |
| `server.worker_pool_size` | 20 | Vert.x worker pool size |
| `server.event_loop_pool_size` | 2 | Vert.x event loop pool size |
| `server.blocked_thread_check_interval` | 60000 | Warning interval (ms) for blocked threads |
| `server.max_worker_execute_time` | 120000 | Max worker execution time (ms) before warning |
| `server.max_event_loop_execute_time` | 120000 | Max event loop execution time (ms) |
| `server.enable_lock_invoice` | false | Whether invoice locking is enabled |

In the checked-in `config.json`, the server is configured with port `28380`, URI prefix `/msp/api/v1`, worker pool `1000`, and event loop pool `8`.

`Main.main` builds a `VertxOptions` from these and deploys the `Server` verticle. HTTP and HTTPS clients are created in `Server.start` with an idle timeout of 120 seconds; the HTTPS client trusts all certificates (`setTrustAll(true)`).

## Database connectivity

Three database pools are configured independently from `config.json`, all pointing at Oracle via `ojdbc8`/`ucp`:

- `database` — the primary MSP schema. In the checked-in config: `jdbc:oracle:thin:@db.onepay.vn:1521:orcl`, user/password `msp`, max pool size 200.
- `database_backup` — a read fallback pool to the same host, max pool size 2.
- `bill_database` — a separate schema (`onebill`) for bill-related data, max pool size 2.

Each pool has `init_pool_size`, `min_pool_size`, and `max_pool_size` keys read via `Config.getDB*PoolSize()` accessors. HikariCP and Oracle UCP are both on the classpath via `pom.xml`; the pools are sized small for backup/bill databases to avoid consuming unnecessary Oracle licenses/sessions.

## Connector architecture and dynamic loading

The service is connector-driven. `Main` instantiates connectors reflectively at startup: for each entry in the `msp_connectors`, `rsp_connectors`, `csp_connectors`, `void_connectors`, `bill_rsp_connectors`, `merchant_connectors`, `psp_connectors`, and `query_pay_connectors` arrays, it reads the `class` field, loads the class, invokes the `(String id, JsonObject properties)` constructor, and appends the instance to a static list on `Main`.

The connector abstract bases defined under `vn.onepay.msp.connectors` each define the operations a connector of that family must implement:

- `MSPConnector` — `createInvoice`, `getInvoice`, `createPayment`, `updatePayment`
- `RSPConnector` — `createRefund`, `createRefund2`, `enquiryRefund`
- `PSPConnector` — `approveOrder`, `voidOrder`, `verifyOTP`
- `VoidConnector`, `CSPConnector`, `BillRspConnector`, `MerchantConnector`, `QueryPayConnector`, and `ClientConnector` similarly

Because connectors are resolved by fully-qualified class name at runtime, adding a new payment scheme requires only: (a) implementing the connector class on the classpath and (b) adding a JSON entry to the appropriate array in `config.json`. No controller wiring change is required — this is the primary extension point of the platform.

### Configured connector families

The checked-in `config.json` defines a broad set of connectors:

- **PSP connectors** (`psp_connectors`): AMIGO, SHOPEEPAY, KBANK — buy-now-pay-later / on-us PSP schemes with OWS1-HMAC-SHA256 authorization.
- **Query-pay connectors** (`query_pay_connectors`): UNIONPAY QR.
- **MSP connectors** (`msp_connectors`): ONUS (OnePAY), BIDV, VCB, ESP, ESHOP — each an on-us or off-us merchant-service integration with own host, timeouts, and credentials.
- **RSP connectors** (`rsp_connectors`): DSP, BIDV, VIB, WSP, MOMO, GRABPAY, ZALOPAY, VIETINQR, MSBQR, UNIONPAY, SHOPEEPAY, VIETTELMONEY, VIETQR — refund service providers, several with per-brand partner credentials, endpoints, and error mappings.
- **Void connectors** (`void_connectors`): UNIONPAY, WSP.
- **CSP connectors** (`csp_connectors`): WSP.
- **Merchant connectors** (`merchant_connectors`): CHUDU.

## External services and credentials

The service integrates with a set of downstream services, each configured with its own URL and request-signing credentials. All of these live in `config.json` and must be kept in sync with the deployed environment:

| Section | Service | Auth model |
| --- | --- | --- |
| `smssp` | SMS service provider | OWS1-HMAC-SHA256 with `client_id`/`client_key`, brand name `OnePAY` |
| `tsp` | Token service provider | OWS1-HMAC-SHA256, timeout 55s, return URL to paygate authorizations |
| `fsp` / `fsp-go` | Fraud screening service | POST with `auth_client_id`/`auth_client_key` |
| `psp-connector-onecomm` | OneComm connector | access_key_id/secret |
| `psp-onecredit` | OneCredit credit scheme | OWS1-HMAC-SHA256 |
| `psp-connector-paycollect` | PayCollect connector | OWS1-HMAC-SHA256 |
| `ma-service` | Payment acquisition service (international transactions and refunds) | plain URL pair |
| `onebill` | OneBill WS endpoint | SOAP-style URL with a shared key |
| `onesm` (read via `getOneSMURL`) | OneSM HTTP client service | client_id/client_key |

A full matrix of downstream URLs, client IDs, client keys, HMAC signing details, regions, services, and timers is contained in `config.json`. Environment-specific overrides are performed by editing this file for the target deployment (dev/mtf/prod) — note the `authorization_return_url` values currently point at `dev.onepay.vn`.

## Error mapping and business rules config

Beyond connectivity, `config.json` carries significant business-rules data:

- `vpc_errors` — maps named reasons (e.g. `HOMECREDIT_*`, `KREDIVO_*`, `KBANK_*`, `AMIGO_*`, `ONECREDIT_*`, `ONECOMM_*`) to VPC response codes and user-facing messages.
- `vpc_reasons` / `vpc_pay_channels` / `vpc_cards` / `accept_instruments` — VPC response-code→reason mapping, channel mapping, card-type matching regexes, and the accepted-instruments matrix used by `Config.getAcceptInstruments*` to decide which payment instruments a merchant can accept.
- `instrument_mask` — regex and replacement for masking card numbers (default `^(\d{6})\d+(\d{4})$` → `$1***$2`).
- Per-merchant overrides such as `merchant_extend_expired_time.<merchantID>` and `time_cut_off_refund_bnpl_by_merchant.<merchantID>`, read via `Config.getExpiredTimeExtendByMerchant` / `getTimeCutOffRefundBnplByMerchant`.
- Refund auto-send settings for MSB QR (`enable_auto_refund`, `enable_send_mail_refund`) with SMTP mail configuration embedded, and ZaloPay error code tables.

## Credential and key material files

Additional sensitive resources live under `src/main/resources`:

- `onepay_msp.jceks` — Java keystore used for credential storage.
- `onepay.vn_vietin_qr.cer`, `vietinbanknew.cer`, `vietinbankqr.onepay.vn_production.cer` — certificates for the Vietin QR integration (and its production counterpart).
- `merchant.properties` — merchant flag properties (currently `merchant.samsung="TESTSAMSUNG,OP_SAMSUNG"`), read via `Config.getMerchantSamsung`.
- `bank-amount.json` — bank/amount configuration.
- `sql.txt` — SQL statements used by the application.

Note that many connector `properties` blocks embed plaintext secrets (HMAC `client_key`s, partner secret keys, SMTP passwords, JWT keys for MSB). These are deployed as-is through CI; rotating them requires editing `config.json` and redeploying.

## Logging and observability

Logging is configured via `src/main/resources/log4j2.xml` (bundled with `log4j-core` and `log4j-jul` in `pom.xml`):

- A `Console` appender (commented out in practice).
- A `RollingFile` appender writing to `/var/log/${env:app}/${env:app}.log` with daily `.gz` rotation (`TimeBasedTriggeringPolicy`).
- A `Graylog` GELF UDP socket appender to `log.onepay.vn:12201` for centralized log shipping (GZIP-compressed above 1024 bytes).
- Async loggers for hot packages (`vn.onepay.msp.dao`, `vn.onepay.msp.resources.Invoices`, `vn.onepay.msp.connectors.onus`, `vn.onepay.msp.Util`) at debug, `com.onepay` at error, and an async root at warn.

The log file path and Graylog app name both derive from the `${env:app}` environment variable.

Operational observability is also served by `HealthCheckService`, which registers an "MSP" health check (via `HealthCheckHandler`) reporting memory, CPU count, Java version, OS, version/start time/active connections/request frequency/average response time/error count from `ApplicationMetrics`, and a database connectivity check. It also exposes the `/vpc/...`-style `CheckMSP` and `Check` endpoints that answer with OnePay "up" status and a per-database connection health report.

## Build configuration

`pom.xml` defines the build. Notable aspects:

- Coordinates: `vn.onepay:msp:1.0.20200803`, Java 11 (`maven.compiler.source`/`target`), UTF-8, tests skipped by default (`skipTests=true`).
- The `health-microservice.jar` is a **system-scope** dependency (`vn.onepay:hm:1.0`) resolved from `${project.basedir}/health-microservice.jar` — a prebuilt jar provided alongside the source tree rather than fetched from a repository.
- Runtime stack: Vert.x 3.9.4 (`vertx-web`, `vertx-mail-client`, `vertx-health-check`), Netty 4.1.58 (`netty-all` with the modular netty artifacts excluded from vertx-web to avoid version conflicts), Jackson 2.14.1, Gson 2.8.9, Guava 30.1-jre, Log4j 2.17.1 with the LMAX Disruptor async logger, OpenCSV 5.7.1, HikariCP 5.0.1, Oracle `ojdbc8`/`ucp` 19.8, jose4j, commons-configuration, commons-codec, javax.mail, and ZXing.
- OnePay internal libraries: `ows` 1.0.20180528 (OWS authorization/HMAC), `error` 1.0.20191105, and `onesm-http-client` 1.0.20150807.
- Build plugins: `maven-dependency-plugin` copies all dependencies into `target/lib` at the `prepare-package` phase; `maven-resources-plugin` copies `src/main/resources` into the classes output directory at the `compile` phase so the resource files (notably `config.json`) are present inside the artifact.
- Test dependencies: JUnit 4.12, JUnit Jupiter 5.8.1, Mockito 5.12 (core and inline), and vertx-unit.

## Deployment pipeline

`.gitlab-ci.yml` drives CI/CD on the `paygate` tag runner:

- **clean stage**: runs `mvn clean` with `JAVA_HOME=/usr/java/jdk-11` for merge requests targeting `master`.
- **deploy stage** (the active pipeline): on a commit to the `master` branch, runs `mvn clean` then `mvn -U package`, then `rsync`s the built `target/` — including `classes/config.json`, `classes/bank-amount.json`, `classes/vn/**`, and `lib/**` — to the production host `root@192.168.166.78:/opt/msp` over SSH (port 7100), and finally restarts the `msp` systemd service.

The `build` and `test` stages are commented out in the current file, so a successful `master` push rebuilds and restarts production. Note the deploy rsync preserves the checked-in `config.json` from `classes`, meaning the deployed configuration is whatever was committed to the repo.

The old commented runtime indicated a similar deploy flow (`rsync target/ /opt/wsp-cicd` and `systemctl restart wsp-cicd`), which has since been renamed to the `msp` unit.

## Invariants and failure semantics

- **Config changes are not hot-reloaded**: `Config.config` is loaded once in a static block; a change to `config.json` requires a rebuild/restart. The deploy pipeline does exactly this (package + restart).
- **Connector failures**: connectors are constructed at startup; a missing `class` on the classpath throws `ClassNotFoundException`/`NoSuchMethodException` during `Main`, failing startup. Adding an incompatible connector class without the `(String, JsonObject)` constructor breaks boot.
- **HTTPS trust-all**: `Server` creates an HTTPS client with `setTrustAll(true)` — the platform deliberately skips hostname/cert verification for downstream calls, a security consideration for operators.
- **Graylog dependency**: if the Graylog UDP socket is unavailable, logging falls back to the rolling file; log4j2 async loggers buffer to avoid blocking the request path.
- **Multiple database failure domains**: the primary `database` pool is mandatory for the core transaction flow; `database_backup` and `bill_database` are small pools (max 2) for read and bill operations. Losing the primary pool makes transactions fail and feeds the `KO` health status.

## Related

- See `/openwiki/architecture/components.md` for the component-level view of the MSP service.
