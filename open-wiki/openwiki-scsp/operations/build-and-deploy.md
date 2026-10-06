---
type: operations
title: Build and Deploy
description: Documents how the SCSP Go service is built, packaged, and deployed across environments, including the Makefile targets, the two-phase prepare/push release scripts, the build and rsync/ssh sync scripts, and how config travels with the binary.
tags: [build, deploy, release, makefile, rsync, ssh, environments]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-06T03:44:01.257Z
sources:
  - id: openwiki-source-022a1b7df577b7fcc0c6f7f9
    resource: repo://1_prepare_build.sh
  - id: openwiki-source-8eff3bc923e0d1971cfc8276
    resource: repo://2_push_release.sh
  - id: openwiki-source-86f07a22dc20785aaf62d460
    resource: repo://build_prod
  - id: openwiki-source-cc16eff065bff8111f8e2d85
    resource: repo://build_stg
  - id: openwiki-source-83c9ecd3284b33afe13167b9
    resource: repo://config.yaml
  - id: openwiki-source-a8910515ddd14810ad43f5c1
    resource: repo://internal/config/config.go
  - id: openwiki-source-012f2c78e3b1446dfc35803f
    resource: repo://Makefile
  - id: openwiki-source-361c84b305a7406483b4b4f5
    resource: repo://sync_dev
  - id: openwiki-source-7f1521d226990679b940ce80
    resource: repo://sync_prod_154_40
  - id: openwiki-source-bde447bf11bfce6f7dda096c
    resource: repo://sync_prod_154_41
  - id: openwiki-source-03d022c14f5dc7a701935960
    resource: repo://sync_stg_154_50
generated: { by: "openwiki/0.5.2", at: "2026-10-06T03:44:01.257Z" }
---

## Overview

The repository builds the `scsp` Go service from `./cmd/server/main.go` and ships it together with `config.yaml`. There are two cooperating release paths:

- A manual per-environment path using the `build_*` and `sync_*` wrapper scripts, and
- A two-phase scripted release (`1_prepare_build.sh` then `2_push_release.sh`) that produces a binary repository for centralized distribution.

`Makefile` provides the everyday development targets; the scripts wrap the same `go build -ldflags="-s -w"` invocation.

## Makefile targets

The `Makefile` at the repository root defines these targets:

| Target | What it does |
| --- | --- |
| `all` | Default; runs `build` |
| `build` | Compiles `./cmd/server/main.go` with `-ldflags="-s -w"` into `releases/bin/scsp` |
| `test` | Runs `go test ./... -v` |
| `run` | Runs `go run ./cmd/server/main.go` |
| `clean` | Removes `releases/bin` |
| `deps` | Runs `go mod tidy` and `go mod download` |
| `fmt` | Runs `go fmt ./...` |
| `vet` | Runs `go vet ./...` |

`BINARY_NAME=scsp`, `BUILD_DIR=releases/bin`, and `MAIN=./cmd/server/main.go` are the key variables, so the binary lands at `releases/bin/scsp`.

## Two-phase release flow

The release pipeline runs in two phases coordinated through a staging directory `bin/tmp/` and a cloned binary repository `bin/binary_repo`.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: a semicolon inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    Start["Developer on current branch"] --> P1["Phase 1: 1_prepare_build.sh"]
    P1 --> Clean["Reset bin/tmp and bin/binary_repo"]
    Clean --> Clone["Clone deploy/scsp.git at current branch"]
    Clone --> Build["go clean; go build -ldflags='-s -w' to bin/tmp/scsp"]
    Build --> Cfg["Copy config.yaml to bin/tmp/config/config.yaml"]
    Cfg --> Meld["meld bin/tmp and bin/binary_repo for review"]
    Meld --> P2["Phase 2: 2_push_release.sh"]
    P2 --> Check["Require bin/binary_repo/.git; git add and commit"]
    Check --> Push["git push origin of current branch"]
    Push --> Done["Binary repo updated on remote"]
```

Caption: The two release phases — phase 1 builds and stages artifacts, phase 2 commits and pushes them.

### Phase 1: `1_prepare_build.sh`

- Derives `TARGET_BRANCH` from the current git branch (`git rev-parse --abbrev-ref HEAD`).
- Cleans and recreates `DIST_DIR=bin/tmp/` and `GIT_DIR=bin/binary_repo`.
- Clones the remote deployment repository (`GIT_URL` pointing at `git.opvn.vn/deploy/scsp.git`) with `--filter=blob:none` at the current branch, or fetches/resets an existing clone to `origin/$TARGET_BRANCH`; it exits non-zero if the branch cannot be cloned or checked out.
- Runs `go clean` and builds the server binary into `bin/tmp/scsp`.
- Copies `config.yaml` into `bin/tmp/config/config.yaml`, so the config file travels alongside the binary in the staged artifact.
- Opens `meld` between `bin/tmp/` and `bin/binary_repo/` for manual review/sync of the staged artifacts into the binary repo.

### Phase 2: `2_push_release.sh`

- Collects provenance for the release commit: source repo URI, branch, short commit hash, author, commit time, and message, plus the build timestamp.
- Fails early if `bin/binary_repo` does not look like a git checkout, instructing the operator to run phase 1 first.
- Stages all changes in `bin/binary_repo`, commits with the generated message, and pushes to the remote branch.
- If the push fails (network, conflict, permissions) it exits non-zero; otherwise it prints `[DC] Push Success` and reports completion.

Notable detail: the script computes branch variables (`SRC_BRANCH`, `TARGET_BRANCH` is referenced but only `SRC_BRANCH` is set in the file) from the current repository state, so it must be run from the checked-out source repository. The commit message always records the exact source commit and build time, making each pushed binary reproducible against its source.

## Per-environment build scripts

- `build_prod` — rebuilds `releases/bin/scsp`, copies `config.yaml` into `releases/bin/config/`, pulls the current production tree from `$USER@dc:/opt/scsp/` (via rsync over ssh port 15441) into `./prod/`, and opens `meld` between `releases/bin/` and `./releases/prod/`.
- `build_stg` — same shape, but pulls from `$USER@dc-154-50:/opt/scsp/` over ssh port 22 into `./stg/`.

Both scripts take the remote user as `$1` and rebuild before comparing local artifacts against the deployed tree.

## Sync scripts

- `sync_dev` — copies the built binary from `bin/scsp` and `config.yaml` into `releases/`, then rsyncs `releases/` to `root@dev9:/opt/scsp/` over ssh port 15440.
- `sync_prod_154_40` — rsyncs `./prod/` to `$USER@dc:/home/$USER/tmp_deploy/scsp/` over ssh port 15440, then over ssh port 15441 backs up `/opt/scsp/` to a timestamped directory, rsyncs `tmp_deploy/scsp/` into `/opt/scsp/` with sudo, and runs `/opt/scsp/setown`.
- `sync_prod_154_41` — same flow, but the initial upload uses ssh port 15441 and the sudo rsync source path is `/home/duongpxt/tmp_deploy/scsp/`.
- `sync_stg_154_50` — same flow against `$USER@dc-154-50` over ssh port 22, backing up to `tmp_backup/scsp-<timestamp>/` and restoring from `tmp_deploy/scsp/`.

In every sync script the lifecycle is: upload new bits to a per-user staging directory, take a timestamped backup of the live tree, replace the live tree, then re-apply ownership via the deployed `setown` helper. Deployment is therefore a destructive rsync (`--delete`) gated by a manual per-user staging step.

## Config travels with the binary

Configuration is versioned next to the code in `config.yaml` and directory layout:

- `1_prepare_build.sh` places it at `bin/tmp/config/config.yaml`.
- `build_prod`/`build_stg` place it at `releases/bin/config/config.yaml`.
- `sync_dev` places it at `releases/config/config.yaml`.

At runtime, `config.Load` (`internal/config/config.go`) searches `.` and `./config` for `config.yaml`, applies `SCSP_`-prefixed environment overrides, and falls back to built-in defaults, so the deployed tree expects a `config/` directory sibling of the binary. Secrets such as Postgres credentials, Vault tokens, and AppRole keys are supplied through `SCSP_*` environment variables rather than committed to the YAML, and the production tree is refreshed by the rsync flows described above.
