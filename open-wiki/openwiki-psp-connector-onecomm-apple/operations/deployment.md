---
type: concept
title: Deployment Processes and Scripts
description: Build pipeline, target environments, and rsync/ssh-based deployment scripts for the PSP Connector OneComm Apple service.
tags: [deployment, build, environment, rsync, ssh, production, staging, disaster-recovery]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:03:17.397Z
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-4f2dbb43613c4637019c1c97
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/Config.java
  - id: openwiki-source-85f828023b9f93b05d985383
    resource: repo://sync_dr_100
  - id: openwiki-source-329a43476ea63717afa4ba07
    resource: repo://sync_prod
  - id: openwiki-source-768bac2f49ba983150428dd1
    resource: repo://sync_stg
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

The PSP Connector OneComm Apple service uses a manual, script-driven deployment pipeline. Builds are produced locally with Maven, then synchronized to remote servers over SSH using `rsync`. There are three target environments—production, staging, and disaster recovery—each served by a dedicated deployment script in the repository root.

## Target Environments

| Environment | Host | SSH Port | Script | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Production** | `dc` | `7100` | `sync_prod` | Live traffic |
| **Staging** | `dc` | `7010` | `sync_stg` | Pre-release validation |
| **Disaster Recovery** | `l` | `7100` | `sync_dr_100` | Standby replica of production artifacts |

Production and staging share the same physical host (`dc`) but are differentiated by SSH port (and therefore distinct listening services). The disaster recovery host (`l`) receives a file-only sync with no build or apply step, suggesting it mirrors an already-validated build.

All remote paths follow the same layout:

```
/tmp_deploy/psp-connector-onecomm-apple/   ← rsync target (staging area)
/opt/psp-connector-onecomm-apple/          ← live runtime directory
/opt/psp-connector-onecomm-apple/setown    ← permission finalization script
```

## Build Pipeline

Every production and staging deploy begins with a full Maven build:

```bash
env JAVA_HOME=/usr/java/jdk-11 mvn clean && env JAVA_HOME=/usr/java/jdk-11 mvn -U package
```

- **JDK 11** is required (`maven.compiler.source` and `maven.compiler.target` are `11` in `pom.xml`).
- `-U` forces Maven to check remote repositories for snapshot updates.
- The `maven-dependency-plugin` copies all transitive JARs into `target/lib/` during `prepare-package` ([`pom.xml`](repo://pom.xml#L30-L48)).
- The `maven-resources-plugin` copies `src/main/resources/` (including `app.properties` and `log4j2.xml`) into `target/classes/` ([`pom.xml`](repo://pom.xml#L72-L92)).
- Tests are skipped by default (`<skipTests>true</skipTests>` in `pom.xml` line 14).

The deployable output consists solely of two directories: `target/classes/` and `target/lib/`.

## Deployment Scripts

### `sync_prod` — Production

Performs a three-step deploy: build → rsync → apply.

```bash
# 1. Build
env JAVA_HOME=/usr/java/jdk-11 mvn clean && env JAVA_HOME=/usr/java/jdk-11 mvn -U package

# 2. Sync build artifacts to remote staging area
rsync -av --progress --delete --delete-excluded --rsh='ssh -p7100' \
  --include=classes \
  --include=lib \
  --include=classes/** \
  --include=lib/* \
  --exclude=* \
  target/ root@dc:/root/tmp_deploy/psp-connector-onecomm-apple/

# 3. Apply: diff with live directory and finalize
ssh root@dc -p 7100 -X 'meld /root/tmp_deploy/psp-connector-onecomm-apple/ /opt/psp-connector-onecomm-apple/ && /opt/psp-connector-onecomm-apple/setown'
```

### `sync_stg` — Staging

Identical workflow to production, targeting port `7010`:

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

### `sync_dr_100` — Disaster Recovery

Synchronizes an existing build to the DR host without rebuilding or applying:

```bash
rsync -av --progress --delete --delete-excluded --rsh='ssh -p7100' \
  --include=classes \
  --include=lib \
  --include=classes/** \
  --include=lib/* \
  --exclude=* \
  target/ root@l:/root/tmp_deploy/psp-connector-onecomm-apple/
```

This script assumes a recent `target/` directory is present from a prior build and syncs it directly to host `l`.

## rsync Strategy

All three scripts use the same rsync filter pattern to transfer exactly the deployable artifact tree:

| Flag | Effect |
| :--- | :--- |
| `--delete` | Removes files on the remote that are not present locally, ensuring a clean state. |
| `--delete-excluded` | Also removes remote files that match exclude rules. |
| `--include=classes` / `--include=lib` | Include the top-level `classes` and `lib` directories. |
| `--include=classes/**` / `--include=lib/*` | Include all contents within those directories. |
| `--exclude=*` | Exclude everything else (e.g., `target/*.jar`, Maven wrapper files). |

The result is that only `classes/**` and `lib/*` are synchronized, matching the minimal runtime footprint of the application.

## Apply Phase (Production and Staging)

After rsync completes, production and staging deployments run an interactive apply step over SSH:

1. **`meld`** — A visual diff/merge tool (`-X` enables X11 forwarding) is opened to let the operator review changes between the staging area and the live directory.
2. **`setown`** — A shell script (`/opt/psp-connector-onecomm-apple/setown`) that presumably sets file ownership and permissions to the runtime user, ensuring the application can read its configuration and JARs.

This step is manual and operator-driven, serving as a final verification gate before the new code is active.

## Environment-Specific Overrides

While the build artifacts are identical across environments, runtime behavior is differentiated through Java system properties passed at startup. The `Config.java` class reads properties such as `onecomm_service_url` and `uri_prefix` via `System.getProperty`, falling back to defaults in `app.properties` when not provided ([`configuration.md`](/openwiki/concepts/configuration.md)). This allows staging and production to use different backend endpoints and database connections without modifying the deployed files.
