---
type: concept
title: Key Dependencies
description: Documents the core Maven dependencies, internal OnePay libraries, and runtime build tooling that support the WSP gateway.
tags: [dependencies, maven, vertx, netty, jackson]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T08:58:44.659Z
sources:
  - id: openwiki-source-022a1b7df577b7fcc0c6f7f9
    resource: repo://1_prepare_build.sh
  - id: openwiki-source-8eff3bc923e0d1971cfc8276
    resource: repo://2_push_release.sh
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-d3b273c4f3372c3dd0aedf39
    resource: repo://src/main/java/vn/onepay/wsp/Main.java
generated: { by: "openwiki/0.5.2", at: "2026-09-22T08:58:44.659Z" }
---

WSP is a Java 11 service built on a Maven POM that mixes a reactive core, legacy transport layers, internal OnePay libraries, and deployment scripts for a Git-backed release workflow.

## Core Runtime Stack

The gateway runtime is built on:

- Vert.x 3.9.2 for HTTP routing, asynchronous I/O, mail client support, and Thymeleaf template rendering.
- Netty 4.1.52.Final, brought in via `netty-all` to unify low-level transport modules and override any conflicting transitive versions from Vert.x.
- Log4j 2.25.4 for logging, including the JUL bridge (`log4j-jul`) and SLF4J binding (`log4j-slf4j-impl`).
- LMAX Disruptor 3.4.4, typically used to support high-throughput async logging or internal ring-buffer patterns.

This combination is visible in the application startup in `Main.java` and in how `Server.java` creates HTTP/HTTPS clients, Vert.x routes, and Thymeleaf rendering infrastructure.

## Serialization and Data Utilities

WSP uses these libraries to handle configuration, payloads, and text manipulation:

- Jackson 2.19.2 (`jackson-core`, `jackson-annotations`, `jackson-databind`) for JSON serialization and deserialization.
- SnakeYAML 2.0 for YAML parsing.
- Google Guava 29.0-jre for general utility APIs.
- Apache Commons Configuration 1.10 for property-based configuration loading.
- Apache Commons Text 1.10.0 for text utilities.

These dependencies support both application configuration loading in `Config.java` and the JSON-heavy API behavior exposed through `Server.java`.

## Internal OnePay Libraries

Several dependencies are internal OnePay modules rather than public open-source artifacts:

- `vn.onepay:ows` for authorization helpers.
- `vn.onepay:error` for standardized error handling.
- `com.onepay:onesm-http-client` for service-management HTTP integration.
- `vn.onepay:secure-config-lib` for secure configuration and secrets handling.

These libraries connect WSP to the broader OnePay platform conventions for authorization, error responses, monitoring, and secure configuration.

## Build Plugins and Packaging

Maven packaging is intentionally non-uber-jar and more deployment-directory oriented:

- `maven-dependency-plugin` copies runtime dependencies into `target/lib` during the `prepare-package` phase.
- `maven-jar-plugin` builds the application JAR with `vn.onepay.wsp.Main` as the main class and a classpath manifest pointing to `lib/`.

This structure supports the shell-based deployment workflow that rsyncs only the final `classes/` and `lib/` layout into a separate binary repository.

## CI/CD Pipeline and Build Stages

There is no declarative `.gitlab-ci.yml` in this repository. Instead, release and deployment preparation are driven by two shell scripts.

### `1_prepare_build.sh`

This script performs the build and artifact staging phase:

1. Resolves the current source branch and prepares local staging directories.
2. Clones or resets a separate binary/deployment Git repository (`bin/binary_repo`) used to store packaged output.
3. Runs `mvn clean` and `mvn -U package` under JDK 11.
4. Copies only the deployable artifacts from `target/` into a temporary staging directory using rsync, filtering to `classes/` and `lib/`.
5. Launches `meld` to compare or synchronize the staged output into the binary repository.

This creates a reproducible deployment layout without publishing artifacts to an external registry.

### `2_push_release.sh`

This script performs the release commit phase:

1. Collects source metadata from the current repository: remote URL, branch, short commit hash, author, commit message, and commit time.
2. Builds a structured commit message that records the source commit details and build timestamp.
3. Detects whether changes exist in the binary repository.
4. Commits the prepared release artifacts and pushes them to the binary repository for downstream deployment.

Together, the two scripts form a manual, two-stage pipeline: build and stage first, then commit and push release artifacts second.

## Deployment Implications

The dependency model supports deployment as a plain JAR plus `lib/` directory tree, started with JDK 11 as defined in the `wsp.service` systemd unit. This fits the pattern of a gateway that is packaged, rsynced, and executed directly rather than containerized through a more elaborate OCI image build.

The current page owns 0 Claim(s).
