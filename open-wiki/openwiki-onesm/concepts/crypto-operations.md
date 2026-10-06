---
type: "Reference"
title: "Crypto Operations"
openwiki_generated: true
verified:
  - by: openwiki/0.5.2
    at: 2026-09-24T11:53:15.318Z
sources:
  - id: openwiki-source-3d1f45a24ded30320241b951
    resource: repo://src/main/java/com/onepay/onesm/Crypto.java
  - id: openwiki-source-80dcd0d134e9c6d0207eda7f
    resource: repo://src/main/java/com/onepay/onesm/http/HttpServerHandler.java
  - id: openwiki-source-985b1fb38a3f76cec4051200
    resource: repo://src/test/java/DecryptTokenData.java
  - id: openwiki-source-f6e1873df815d079934a1f9f
    resource: repo://src/test/java/EncryptOnecommCards.java
  - id: openwiki-source-8154231636d00468086fa255
    resource: repo://src/test/java/GenerateKey.java
  - id: openwiki-source-45614aeec62afdbbeab29dc3
    resource: repo://src/test/java/TestCrypto.java
generated: { by: "openwiki/0.5.2", at: "2026-09-24T11:53:15.318Z" }
---


# Crypto Operations

`com.onepay.onesm.Crypto` (`src/main/java/com/onepay/onesm/Crypto.java`) is a
stateless static helper class that wraps the JCE for the symmetric, asymmetric,
and hashing primitives used across `onesm`. It holds no state and no keys of its
own; keys and certificates are supplied by the caller, almost always from
`SecureKS` (see [key management](/openwiki/concepts/key-management.md)). The
HTTP endpoints that invoke these primitives are covered in
[encryption/decryption endpoints](/openwiki/workflows/encryption-decryption-endpoints.md)
and the standalone test utilities exercise the same library for offline data
conversion.

## Primitives

### SHA-256 with url-safe base64 (`sha256Base64`)

```java
public static String sha256Base64(byte[] data)
```

Hashes the input with `MessageDigest.getInstance("SHA-256")` and encodes the
digest with Apache Commons Codec `Base64.encodeBase64URLSafeString`, producing a
url-safe, unpadded base64 string. This is the body-hash primitive used by the
HTTP request/response signing scheme in `HttpServerHandler.signRequest` and
`signResponse`.

### HMAC-SHA256 (`hmacSha256`)

```java
public static byte[] hmacSha256(byte[] data, byte[] secretKey)
```

Builds a `SecretKeySpec(secretKey, "HMACSHA256")` and computes an HMAC-SHA256 MAC
over `data` via `Mac.getInstance("HMACSHA256")`. Passing a `null` data payload
returns `null` rather than throwing. The raw MAC bytes are returned; callers
usually wrap them in `Base64.encodeBase64URLSafeString`. This is used both for
authenticating HTTP requests/responses and for one-way hashing of card numbers
and token payloads in the migration utilities.

### AES/CBC/PKCS5 — implicit IV variant (`encryptAES`/`decryptAES` with `SecretKey`)

```java
public static byte[] encryptAES(byte[] plaintext, SecretKey key)
public static byte[] decryptAES(byte[] ciphertext, SecretKey key)
```

The primary AES pair uses `AES/CBC/PKCS5Padding` with the JCE-drawn
random IV **prepended to the ciphertext**. On encryption, the IV is fetched from
`cipher.getParameters()` and copied into the front of the returned byte array;
on decryption, the first `cipher.getBlockSize()` bytes (16 for AES) are read
back as the IV. `decryptAES` rejects a `null` ciphertext or any input shorter
than one block with `IllegalArgumentException("Ciphertext too small to contain IV")`.

This is the format the `/encryptions` and `/decryptions` HTTP endpoints use and
the format the card-vault and token-data utilities read and write.

### AES/CBC/PKCS5 — explicit key and IV variant (`encryptAES`/`decryptAES` with raw bytes)

```java
public static byte[] encryptAES(byte[] data, byte[] key, byte[] iv)
public static byte[] decryptAES(byte[] data, byte[] key, byte[] iv)
```

A second AES pair that takes raw key and IV bytes and routes through the private
`aes(...)` helper. The raw key must be exactly 16, 24, or 32 bytes
(AES-128/192/256); otherwise it throws
`Exception("Invalid key length: <n>. Expect 16, 24 or 32")`. The IV is used as
given, and the ciphertext does **not** carry the IV — the caller owns and must
preserve the IV separately. Used by `GenerateKey` to wrap generated master keys
during key provisioning.

### RSA/ECB/PKCS1 (`encryptRSA`/`decryptRSA`)

```java
public static byte[] encryptRSA(byte[] data, PublicKey key)
public static byte[] decryptRSA(byte[] data, PrivateKey key)
```

Both delegate to a private `rsa(...)` helper using `RSA/ECB/PKCS1Padding`. The
mode (encrypt vs. decrypt) is chosen by object type: a `PublicKey` encrypts, a
`PrivateKey` decrypts. The `/encryptions` endpoint selects this primitive when
the resolved key's algorithm contains `RSA` and the caller supplied
`public_key`.

### Hex helpers (`toHexString`, `decodeHexa`, `printHexBinary`, `parseHexBinary`)

`toHexString(byte[])` (delegating to `printHexBinary`) produces an **uppercase**
hex string using the `0123456789ABCDEF` alphabet. `decodeHexa(String)`
(delegating to `parseHexBinary`) parses hex back to bytes, rejecting odd-length
input or any non-hex character with
`IllegalArgumentException("hexBinary needs to be even-length: ...")` /
`"...contains illegal character for hexBinary: ..."`. Hex is the conventional
display format in the tooling (e.g., printing ciphertext in `TestCrypto`).

## Key-length validation rules

| Primitive | Key source | Validation | Failure |
|-----------|-----------|-----------|---------|
| AES (`SecretKey`) | JCE `SecretKey` object | none in `Crypto` | block/IPC-level failures surface as JCE exceptions |
| AES (raw bytes) | explicit `byte[] key` | exactly 16, 24, or 32 bytes | `Exception("Invalid key length ...")` |
| HMAC-SHA256 | raw `byte[] secretKey` | none (wrapped in `SecretKeySpec`) | none; a `null` data payload returns `null` |
| RSA | `PublicKey`/`PrivateKey` object | none | mode inferred from key type |

## Failure modes

- **Ciphertext too small**: `decryptAES(byte[], SecretKey)` throws
  `IllegalArgumentException` when the input is `null` or shorter than the AES
  block size, since no IV can be extracted.
- **Bad AES key length**: the raw-byte AES pair throws a generic `Exception` for
  any key length other than 16/24/32.
- **Malformed hex**: `decodeHexa` throws `IllegalArgumentException` on odd
  length or illegal characters; no silent truncation or coercion.
- **Null HMAC data**: `hmacSha256` returns `null` instead of throwing.
- **Padding/parsing failures**: because the JCE `Cipher` throws
  `BadPaddingException`/`IllegalBlockSizeException` on decrypt, a decryption of
  tampered or mis-keyed data surfaces as an exception from `doFinal`. In the
  HTTP layer these map to `500 INTERNAL_SERVER_ERROR`; the `/decryptions`
  endpoint only accepts AES keys and rejects others with
  `400 UNSUPPORTED_ALGORITHM`.

## Integration boundaries

- **Provider of keys**: `SecureKS` resolves `SecretKey`, `PublicKey`, and raw
  key bytes (via `getKey`, `getPublicKey`, `getHttpClientKey`) that are passed
  into `Crypto`. `Crypto` never touches the keystore itself.
- **HTTP consumers**: `HttpServerHandler` dispatches on the key's algorithm —
  `HMACSHA256` → `hmacSha256`, `AES` → implicit-IV `encryptAES`/`decryptAES`,
  RSA → `encryptRSA` — and uses `sha256Base64` + `hmacSha256` to sign requests
  and responses.
- **Offline tooling**: the `src/test/java` standalone `main()` utilities
  (`EncryptOnecommCards`, `DecryptTokenData`, `Decrypt`, `DecryptList`,
  `DecryptTVSP`, `GenerateKey`, `TestCrypto`) reuse `encryptAES`, `decryptAES`,
  and `hmacSha256` for card-vault seed, token-data hashing, key provisioning,
  and round-trip benchmarks. These are not JUnit tests; they are build-skipped
  (`<skipTests>true</skipTests>`) operational scripts.

## Notes

- An earlier `KeyDTO`-based `encrypt`/`decrypt` dispatch (switching on a key
  type string) exists only as commented-out dead code in `Crypto.java`; the
  live API is the explicit primitive methods above.
- The implicit-IV AES format is self-describing and is the canonical interchange
  format for the service; the raw-byte AES variant exists for controlled
  provisioning scenarios where the IV is known out-of-band.
