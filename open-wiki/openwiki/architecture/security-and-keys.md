---
type: Reference
title: Security and key-management interaction map
description: How OneSM, SCSP and TVSP interact with WSP, MSP and PSP connectors for encryption, HMAC request signing, token protection and key storage, including exact header names, string-to-sign layouts, key aliases, cache TTLs and error codes.
resource: repo://openwiki
tags: [security, onesm, scsp, crypto, hmac, aes, rsa, key-management, tvsp]
---

# Security and key-management interaction map

Companion: [`/openwiki/workflows/cross-service-flows.md`](/openwiki/workflows/cross-service-flows.md) sections 10-12.

## 1. Security boundaries

```mermaid
flowchart TB
    WSP -->|OneSMHttpClient.encryptToBase64String (PAN -> HASH)| ONESM[OneSM]
    MSP -->|encrypt instrument| ONESM
    TVSP[TVSP Vault] -->|encryptAES / encryptHMAC / decrypt| ONESM
    ONESM -->|JCEKS /keystore.jceks| KS[(Keystore aliases<br/>http_client.clientId, one credit.hmac, tspvault.aes, tspvault.hmac)]
    SCSP[SCSP] -->|EncryptionPort| VAULT[(Vault transit)]
    SCSP -->|storage| PG[(Postgres scsp.tb_kv_store)]
    MSP -.->|ScspApplePayKeyStore GET /key/msp/merchants/.../applepay/...| SCSP
    OC[psp-connector-onecomm] -->|HMACSHA256 vpc_SecureHash| G1[Onecomm gateway]
    KB[psp-connector-kbank] -->|AES-GCM + RSA signature| G2[KBank API]
```

Documented facts: **no integration edge** from OneSM to SCSP, and TVSP's OneSM client is the only documented TVSP external security call. OneSM keys are loaded from its own local JCEKS keystore, not from SCSP.

## 2. OneSM request authentication (caller side)

Headers on every OneSM call:

| Header | Notes |
|---|---|
| `X-Authorization` | preferred; fallback `Authorization` |
| `X-Date` | fallback `Date`, RFC-1123 GMT `EEE, dd MMM yyyy HH:mm:ss z` |
| `Content-Type` | must be exactly `application/json` |

`X-Authorization` value shape: `<scheme> <clientId>:<HMAC-SHA256 base64url>` (scheme is matched but ignored). Client key alias: `http_client.<clientId>`, read with empty entry password.

Exact string-to-sign (request):

```
<HTTP method>\n<request path including query>\n<X-Date>\n<Content-Type>\n<body SHA-256>
```

Empty body contributes an empty string (no digest). Result: `Crypto.hmacSha256(stringToSign.getBytes(), key)` -> `Base64.encodeBase64URLSafeString`. Comparison is exact and case-sensitive. `X-Date` freshness is **not** validated.

Response signing (`X-Secure-Hash`, only when client key resolved):

```
<request signature>\n<HTTP status code>\n<X-Date>\n<Content-Type>\n<response body SHA-256>
```

## 3. OneSM operations

| Endpoint | Body fields | Output |
|---|---|---|
| `POST /encryptions` | `data` (base64), exactly one of `key` / `public_key` (JCEKS alias) | `{response_code: 0, encryption_data: base64url}` |
| `POST /decryptions` | `data` (base64), `key` (AES alias only) | `{response_code: 0, decryption_data: base64url}` |

Algorithm dispatch by `key.getAlgorithm()`: `HMACSHA256` -> `hmacSha256` (raw MAC bytes); `AES` -> `encryptAES` (`AES/CBC/PKCS5Padding`, random IV prepended, 16/24/32-byte keys); contains `RSA` -> `encryptRSA` (`RSA/ECB/PKCS1Padding`). Errors: `UNAUTHORIZED_ACCESS` (401), `INVALID_KEY` (400, `details="<alias> key is not existed"`), `ALGORITHM_NOT_SUPPORTED` (400), `UNSUPPORTED_ALGORITHM` (400, `/decryptions` non-AES), `INVALID_CONTENT_FORMAT` (400), `INTERNAL_SERVER_ERROR` (500).

Caches: `keysCache`/`certsCache` Guava, `maximumSize(1000)`, `expireAfterAccess(5, TimeUnit.MINUTES)`; `getHttpClientKey` is uncached (direct `ks.getKey`). JMX MBean `com.onepay.onesm:type=Cache,name=KeyStore`.

## 4. TVSP side

- Client auth to TVSP: `X-OP-Date`, `X-OP-Expires`, `X-OP-Authorization` (OWS1-HMAC-SHA256), defaults `service.name=tvsp`, `service.region=onepay`, `service.authorization.type=ows1_request`, `service.authorization.algorithm=OWS1-HMAC-SHA256`. Exact canonical string-to-sign for `X-OP-Authorization` is not documented on TVSP pages.
- OneSM client config: `onesm.service.url`, `onesm.service.client.id`, `onesm.service.client.key` (hex-encoded), key labels `tspvault.aes`, `tspvault.hmac`, timeout `60000` ms.
- Client key cache: Guava `ApplicationCache`, `cache.size=1000`, `cache.timeout=86400` s.
- Card data encryption on instrument insert: `OneSMHttpClient.encryptToBase64String` with AES label -> ciphertext in `S_DATA`; HMAC label -> integrity hash; masked number kept separately (`instrument.mask.regexp=(\d{6})\d+(\d{4})`, `instrument.mask.replacement=$1xxxxxx$2`).
- iCVV generation: HMAC-SHA256 over (Token Number, Expiry, Sequence Number, Pay Time) -> 4-digit dynamic CVV persisted as `S_ICVV`. HMAC key is not documented.

## 5. SCSP side

API under prefix `/scsp/api/v1`. Documented consumer: MSP, which resolves Apple Pay merchant key/cert material via `GET /key/msp/merchants/{merchantId}/applepay/{publicKeyHashHex}` (HTTP Basic auth, Ristretto cache in front with TTL `scsp.cache.ttl_seconds` default 3600, max size 5000). Key path grammar: pure path ends with `/`, e.g. `/msp/merchants/{merchantId}/applepay/`, subkey is the public-key hash hex. Other services are not documented as SCSP clients.

| Method | Path | Role required |
|---|---|---|
| POST | `/key/*key-path` | `create` |
| PUT | `/key/*key-path` | `update` |
| GET | `/key/*key-path` | `read` |
| DELETE | `/key/*key-path` | `delete` |
| GET | `/keys/*key-path` | `read` |
| LIST | `/keys/*key-path` | `list` |
| DELETE | `/keys/*key-path` | `delete` |

Auth: HTTP Basic -> `scsp.tb_user_policy` (`s_hash_password` Argon2id PHC, `s_policy` JSON array of `{path, roles}`). Policy example: `[{"path":"/app/","roles":["read","list"]}]`. Deny-by-default; grant requires path prefix match **and** role in the same policy entry.

Key path grammar: pure path ends with `/` and matches `^/[-0-9a-zA-Z_/]+/$`; subkey matches `^[-0-9a-zA-Z_]+$`. Example: `POST /key/app/config/db_password` -> path `/app/config/`, key `db_password`.

Caches: Ristretto key cache key `path + "::" + key`, TTL `cache.ttl` default `300`, clamped to 300..86400; auth cache key `auth_creds_<username>`. Invalidation: `Update`/`DeleteKey` -> `Delete(path::key)`; `DeleteByPath` -> `Clear()` (whole cache, also drops auth entries); `Create` does not cache. `GET /keys/*key-path` never touches cache (one Vault decrypt per key). States: `CREATED` on insert, `DELETED` on soft delete; `n_version` starts at 1 and increments per successful update.

Errors: `Key not found` 404, `Key already exists` 409, `Version conflict` 409, `Forbidden: Insufficient permissions` 403, `Forbidden: No policy found` 403, `Unauthorized` 401.

## 6. PSP connector crypto summary

| Connector | Inbound | Outbound |
|---|---|---|
| psp-connector-onecomm | OWS1-HMAC-SHA256 | HMAC-SHA256 `vpc_SecureHash` over sorted `vpc_`/`user_` fields using merchant `hash_code` |
| psp-connector-onecomm-apple | OWS1-HMAC-SHA256 | same `vpc_SecureHash` via `hashCode` from `get_onecomm_merchant` |
| psp-connector-kbank | OWS1-HMAC-SHA256 | AES/GCM/NoPadding payload + RSA/ECB/PKCS1Padding signature; response verified with `kbank.kbank_public` |
| psp-connector-ewallet | OWS1-HMAC-SHA256 | OWS1 to VCB TSP with `ewallet.service.authorization.id`/`key` |

OneSM/SCSP are **not documented** as dependencies of any PSP connector.

## 7. MSP auth helpers

- `Util.checkOWSAuthorization` - canonical string = HTTP method, path, query parameters, signed headers, payload, signed with client secret; client must exist and be `active` (Guava cache by `accessKeyId`).
- `Util.checkVpcAuthorization` - compares `vpc_SecureHash` against merchant access code + hash code.
- `Util.checkHttpSignature` - HMAC-SHA512 over signed headers, replay protection via expiration.

## 8. Key-alias inventory (OneSM JCEKS)

`http_client.<clientId>` (auth), `onecredit.aes`, `onecredit.hmac`, `tspvault.aes`, `tspvault.hmac`, `tsp.hmac`, `aes256`; dormant `client.<clientId>`. Master key is provided at startup (`setMasterKey` JMX / hardcoded `4n8c8f5t` in shipped descriptors - flagged as an operational risk in the source docs).
