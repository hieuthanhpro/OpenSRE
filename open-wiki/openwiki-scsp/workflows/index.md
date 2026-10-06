# Files

- [Authentication and Authorization](authentication-authorization.md) - End-to-end authentication and authorization flow across middleware, AuthUseCase, credential caching, Argon2id verification, policy JSON, and per-route role enforcement.
- [Key Create, Update, Delete Flow](key-create-update-delete.md) - Write and delete lifecycle for secure keys across REST handlers, usecase, Postgres storage, and cache, including optimistic version checks and error-to-HTTP mapping.
- [Key Read and Caching Flow](key-read-caching.md) - Read path for secure keys, covering cache lookup, singleflight stampede prevention, Vault decryption, TTL caching of plaintext plus KeyData, and invalidation on update, delete, and path delete.
