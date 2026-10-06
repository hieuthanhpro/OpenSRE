---
type: workflow
title: Key Create, Update, Delete Flow
description: Write and delete lifecycle for secure keys across REST handlers, usecase, Postgres storage, and cache, including optimistic version checks and error-to-HTTP mapping.
tags: [workflow, keys, rest, cache, optimistic-concurrency]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-06T03:44:01.257Z
sources:
  - id: openwiki-source-bdb8fa3b82741c02f01bd07f
    resource: repo://internal/adapters/driven/postgres/storage.go
  - id: openwiki-source-d16e1b9a2050738acb69a3fc
    resource: repo://internal/adapters/driving/rest/handler.go
  - id: openwiki-source-992a08d47624a04343ec2b04
    resource: repo://internal/domain/usecase/secure_key_usecase.go
generated: { by: "openwiki/0.5.2", at: "2026-10-06T03:44:01.257Z" }
---

## Purpose

This page documents the write-side lifecycle of secure keys — create, update, and delete — through the REST driving adapter, the `SecureKeyUseCase`, the Postgres driven adapter, and the cache port. It covers optimistic version checks, domain error mapping to HTTP status codes, and cache side effects after each write. Read-path caching and singleflight are covered by the related read/caching page.

## Entrypoints

All endpoints live under the handler prefix group and are guarded by `BasicAuthMiddleware` (authentication) and `PolicyMiddleware` (role check for the key path). Routes are registered in `SetupRouter`:

- `POST /key/*key-path` with role `create` → `CreateKeyOrSubkeyHandler`
- `PUT /key/*key-path` with role `update` → `UpdateKeyOrSubkeyHandler`
- `DELETE /key/*key-path` with role `delete` → `DeleteKeyOrSubkeyHandler`
- `DELETE /keys/*key-path` with role `delete` → `DeletePathHandler`

`parseKeyPathSubkey` validates the URL into a `keyPath` (must match `^/[-0-9a-zA-Z_/]+$`) and optional `subkey` (must match `^[-0-9a-zA-Z_]+$`), returning 400 on malformed input.

## Create

Flow: REST `POST /key/*key-path` → `CreateKeyOrSubkeyHandler` → `useCase.Create` → `encryptor.Encrypt` → `storage.Save`.

- Request body requires `value` (string); `custom_metadata` is an optional map.
- The usecase encrypts the plaintext with the `EncryptionPort` and starts every new key at `n_version = 1`.
- `custom_metadata` is marshaled to a JSON string; marshal failure aborts the call with a wrapped error (no storage write).
- `PostgresAdapter.Save` runs in a transaction: it first checks `scsp.tb_kv_store` for an existing row with the same `s_path`/`s_key` and `s_state != 'DELETED'`, then inserts a row with `s_state = 'CREATED'` and returns the row via `RETURNING`.
- If a non-deleted row already exists, `Save` returns `port.ErrKeyAlreadyExists`; a unique-constraint violation from the INSERT is also mapped to `ErrKeyAlreadyExists` as a race-condition fallback.
- The REST handler maps `ErrKeyAlreadyExists` to `409 Conflict` and any other error to `500`. On success it returns `200` with `version`, `custom_metadata`, and `created_time`.
- No cache side effect occurs on create; the key enters the cache lazily on first successful `Read`.

## Update

Flow: REST `PUT /key/*key-path` → `UpdateKeyOrSubkeyHandler` → `useCase.Update` → `encryptor.Encrypt` → `storage.Update` → cache invalidation.

- Request body requires `value`; `version` is optional and **defaults to 1 when omitted**, so a client that omits the version will conflict with any key already past version 1.
- The usecase encrypts the new plaintext and marshals `custom_metadata` before touching storage.
- `PostgresAdapter.Update` issues a single `UPDATE ... WHERE s_path = $1 AND s_key = $2 AND n_version = $5 AND s_state != 'DELETED'` that increments `n_version` and refreshes `s_value`, `s_custom_metadata`, and `d_update`. This is the optimistic lock: the stored version must equal the caller-supplied version.
- When the update matches no row, the adapter distinguishes two cases with a follow-up `SELECT n_version`: key genuinely absent (or deleted) → `port.ErrKeyNotFound`; key present but version mismatched → `port.ErrVersionConflict`.
- The usecase maps `sql.ErrNoRows` to `ErrKeyNotFound` and passes `ErrVersionConflict` through. On success it invalidates the cache entry `path::key`; a cache-delete failure is logged as a warning and does not fail the operation.
- HTTP mapping: `ErrKeyNotFound` → `404`, `ErrVersionConflict` → `409`, other errors → `500`.

### Update version-conflict path

```mermaid
sequenceDiagram
    participant Client
    participant REST as REST Handler
    participant UC as SecureKeyUseCase
    participant PG as PostgresAdapter
    participant Cache as CachePort

    Client->>REST: PUT /key/path/ subkey (value, version=N)
    REST->>UC: Update(ctx, path, key, plaintext, N, metadata)
    UC->>UC: Encrypt(plaintext)
    UC->>PG: Update(ctx, path, key, ciphertext, N, metadataJSON)
    PG->>PG: UPDATE ... WHERE n_version = N (no row matched)
    PG->>PG: SELECT n_version to disambiguate
    PG-->>UC: port.ErrVersionConflict
    UC-->>REST: port.ErrVersionConflict
    REST-->>Client: 409 Conflict
    Note over Cache: No cache invalidation occurs on conflict; stale entry may remain until TTL expiry
```

Caption: A failed optimistic version check returns `409 Conflict` and never invalidates or refreshes the cache entry.

## Delete

Two scoped operations, both implemented as soft deletes.

### DeleteKey

Flow: REST `DELETE /key/*key-path` → `DeleteKeyOrSubkeyHandler` → `useCase.DeleteKey` → `storage.Delete` → cache invalidation.

- `PostgresAdapter.Delete` sets `s_state = 'DELETED'` and `d_delete = NOW()` for the matching non-deleted row; zero affected rows maps to `sql.ErrNoRows`, which the usecase maps to `port.ErrKeyNotFound`.
- After a successful storage delete, the usecase invalidates the `path::key` cache entry; cache failure is logged and non-fatal.
- HTTP mapping: not found → `404`, success → `204 No Content`, other errors → `500`.

### DeleteByPath

Flow: REST `DELETE /keys/*key-path` → `DeletePathHandler` → `useCase.DeleteByPath` → `storage.DeleteByPath` → full cache clear.

- `PostgresAdapter.DeleteByPath` marks every row under `s_path` as deleted; zero affected rows maps to `ErrKeyNotFound`.
- Because per-prefix cache deletion is not supported by all cache backends, the usecase calls `keyCache.Clear(ctx)` to drop the entire cache after a successful path delete; cache failure is logged and non-fatal.
- HTTP mapping: not found → `404`, success → `204 No Content`, other errors → `500`.

## Invariants and failure semantics

- Every read/write against `tb_kv_store` filters `s_state != 'DELETED'`, so deleted rows never surface and can share `(s_path, s_key)` with a recreated row.
- Exactly one successful `Save` per `(s_path, s_key)` exists at a time; concurrent creates are serialized by the existence check plus the unique-constraint fallback.
- Version monotonicity comes from `n_version = n_version + 1` inside the conditional update; a caller can never overwrite a newer version because the `WHERE n_version = $5` clause fails first.
- Cache entries are only written on successful `Read`; all write-side cache effects are invalidations (single-key delete or full clear), never updates.
- Deleted-row filtering is enforced at the query level, so recreating a key under the same path/subkey is allowed once the old row is soft-deleted.

## Tests

Representative coverage lives in the usecase and handler test suites (e.g. `internal/domain/usecase` and `internal/adapters/driving/rest`), which exercise the version-conflict, not-found, and already-exists mappings through the domain-error layer. Storage behavior is exercised against the Postgres adapter; when running tests locally, configure the connection via `config.yaml` / `config.PostgresConfig`.
