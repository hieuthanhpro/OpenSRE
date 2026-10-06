---
type: concept
title: Key Paths and Policies
description: Domain concepts for hierarchical keys, subkeys, versions, custom metadata, soft deletes, and the prefix-based role policy JSON used for authorization.
tags: [keys, paths, subkeys, versioning, metadata, policies, authorization, soft-delete]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-06T03:44:01.257Z
sources:
  - id: openwiki-source-bdb8fa3b82741c02f01bd07f
    resource: repo://internal/adapters/driven/postgres/storage.go
  - id: openwiki-source-d16e1b9a2050738acb69a3fc
    resource: repo://internal/adapters/driving/rest/handler.go
  - id: openwiki-source-aa6b97d03595a553638bc70d
    resource: repo://internal/domain/port/cache.go
  - id: openwiki-source-f6b8c6a57d5f21396dc7852a
    resource: repo://internal/domain/port/types.go
  - id: openwiki-source-992a08d47624a04343ec2b04
    resource: repo://internal/domain/usecase/secure_key_usecase.go
generated: { by: "openwiki/0.5.2", at: "2026-10-06T03:44:01.257Z" }
---

## Overview

The SCSP secure key service stores encrypted values under a two-level address: a hierarchical **key path** plus an optional **subkey** name. Every stored value carries a monotonically increasing **version**, a JSON-encoded **custom metadata** blob, and a lifecycle **state** that implements soft deletes. Authorization is expressed as a per-user JSON **policy** string of `{path, roles}` entries that the HTTP middleware matches against the request path by prefix. These concepts are defined across `internal/domain/port/types.go`, `internal/adapters/driven/postgres/storage.go`, and `internal/adapters/driving/rest/handler.go`.

## Key path and subkey grammar

The route parameter `/*key-path` captures everything after `/key/` in the request URL. `Handler.parseKeyPathSubkey` interprets it in exactly one of two forms:

- **Pure key path** — the value ends in `/`. It is validated against `^/[-0-9a-zA-Z_/]+/$` (leading and trailing slash required, segments of letters, digits, `-`, `_`, and `/`). On success the subkey is empty and the whole value is the path.
- **Path plus subkey** — the value does not end in `/`. It is split on `/`, the last segment becomes the subkey, and the remaining segments are re-wrapped as `/` + join + `/` to form the key path. This requires at least two segments, a key path that matches the path regex, and a subkey that matches `^[-0-9a-zA-Z_]+$`.

Failures produce `400` with a message naming the regex that was violated. The `GET`/`LIST`/`DELETE` routes on `/keys/*key-path` validate only the key-path regex against the wildcard parameter, because they operate on a whole path rather than a single subkey.

Two operational consequences follow:

- A key path always begins and ends with `/`; a subkey never contains `/`. A `POST` to `/key/app/config/db_password` creates subkey `db_password` under path `/app/config/`, while a request to `/key/app/config/` addresses the path itself.
- The regex deliberately forbids dots, spaces, and other punctuation in path segments and subkeys, which keeps cache keys (`path + "::" + key`) and URL parsing unambiguous.

## KeyData and storage state

`port.KeyData` is the metadata record returned by storage operations:

| Field | Meaning |
| --- | --- |
| `Key` | Subkey identifier (empty when addressing a bare path in some flows) |
| `Value` | Encrypted ciphertext as persisted, or decrypted plaintext after a usecase read |
| `Version` | Integer version of the record |
| `Metadata` | Custom metadata as a JSON string |
| `CreatedAt` | Creation timestamp |
| `UpdatedAt` | Last update timestamp |

Rows live in `scsp.tb_kv_store` with columns `s_path`, `s_key`, `s_value`, `n_version`, `s_custom_metadata`, `s_state`, `d_create`, `d_update`, and `d_delete`. A second table, `scsp.tb_user_policy`, stores each user's Argon2 password hash (`s_hash_password`) and policy string (`s_policy`).

## Versioning

Every key starts at version `1` on `Save`. `Update` is optimistic-concurrency controlled: the SQL `UPDATE` sets `n_version = n_version + 1` only `WHERE s_path = $1 AND s_key = $2 AND n_version = $5 AND s_state != 'DELETED'`. If no row matches, the adapter distinguishes the two failure modes with a follow-up query:

- The key (or a live row for it) does not exist → `port.ErrKeyNotFound` → HTTP `404`.
- The key exists but its current version differs from the caller-supplied one → `port.ErrVersionConflict` → HTTP `409`.

At the REST layer the update request body carries `value`, an optional `version` (defaulting to `1` when omitted), and `custom_metadata`. Because the client must supply the version it believes is current, concurrent writers cannot silently overwrite each other.

## Custom metadata JSON handling

Clients send `custom_metadata` as a free-form JSON object (`map[string]interface{}`) in create and update request bodies. The usecase marshals it to a JSON string with `json.Marshal` and persists that string in `s_custom_metadata`; a marshal failure aborts the operation with `failed to marshal custom metadata` before anything is written. On reads, the handler parses `KeyData.Metadata` back into `map[string]interface{}` with `json.Unmarshal`; an empty stored string yields an empty object. A stored value that no longer parses causes a `500` with `Failed to parse metadata`. The value is never validated semantically — any JSON object is accepted — so callers own the meaning of their metadata keys.

## Soft deletes

Deletes never remove rows. `Delete` and `DeleteByPath` set `s_state = 'DELETED'` and stamp `d_delete = NOW()` on the matching live rows. Every read path (`Find`, `FindByPath`, `ListSubkeys`, `FindAll`, and the existence and version checks inside `Save`/`Update`) filters with `s_state != 'DELETED'`, so a deleted key behaves as absent and its path/subkey pair can be recreated — though re-creation inserts a new row with version `1`, and the old tombstone rows remain for audit. `Delete` returns an error when no live row matched (mapped to `404`), and `DeleteByPath` likewise reports `ErrKeyNotFound` when no rows were affected.

## Policy JSON and prefix role matching

`AuthUseCase.Authenticate` returns a raw policy string that is stored in the Gin context by `BasicAuthMiddleware`. `PolicyMiddleware(requiredRole)` unmarshals it as:

```json
[
  {"path": "/app/", "roles": ["read", "list"]},
  {"path": "/admin/", "roles": ["create", "update", "delete"]}
]
```

each entry binding to the `Policy` struct `{Path string json:"path"; Roles []string json:"roles"}`. The request's `key-path` parameter is normalized to start with `/` and a grant is allowed only when some entry's `Path` is a `strings.HasPrefix` match on that request path **and** that same entry's `Roles` contains the route's required role (`create`, `update`, `read`, `delete`, or `list`). Prefix matching means a policy on `/app/` confers its roles on every deeper path such as `/app/config/`, but a request outside all listed prefixes is denied. Distinct failure modes are surfaced differently: missing username → `401`, missing policy in context → `403` with `Forbidden: No policy found`, non-string or unparsable policy JSON → `500`, and a valid policy that lacks the required role for the path → `403` with `Forbidden: Insufficient permissions` (plus a warn log naming the user, role, and path).

## Invariants and failure semantics

- Path and subkey grammar is enforced in exactly one place (`parseKeyPathSubkey` plus the regex checks on `/keys` routes); storage trusts what it receives.
- A key is always addressed as the `(s_path, s_key)` pair; the same subkey name may exist under different paths.
- Version conflicts and missing keys are domain errors (`port.ErrVersionConflict`, `port.ErrKeyNotFound`, `port.ErrKeyAlreadyExists`) that the handler maps to `409`/`404`; usecase-level cache failures never mask the underlying storage result.
- Cache invalidation follows successful mutation only: `Update` and `DeleteKey` delete the entry `path + "::" + key`, while `DeleteByPath` clears the entire cache because the port exposes no prefix-delete operation.
- Soft delete is the only deletion model; the schema retains tombstones and `d_delete` timestamps.

## Related pages

- [HTTP API Surface](/openwiki/architecture/http-api.md)
- [System Architecture](/openwiki/architecture/overview.md)
