# Files

- [Encryption and Decryption Endpoints](encryption-decryption-endpoints.md) - The /encryptions and /decryptions HTTP endpoints served by HttpServerHandler: authenticated POST requests with a JSON body carrying base64 data and a key or public_key alias, algorithm dispatch (HMACSHA256, AES, RSA), and the shared JSON error contract.
- [HTTP Request and Response Signing](http-request-auth.md) - The custom HMAC-SHA256 authentication scheme that gates every request to HttpServerHandler: the Authorization/X-Authorization header format, the request string-to-sign construction (method, path, date, content type, body SHA-256), response X-Secure-Hash signing bound to the request signature and status, and how client keys are resolved from the http_client.* keystore aliases.
