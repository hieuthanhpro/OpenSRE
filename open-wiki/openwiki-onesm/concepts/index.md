# Files

- [Crypto Operations](crypto-operations.md)
- [Key Management and SecureKS](key-management.md) - How onesm stores master-key-protected keys and certificates in a JCEKS keystore, loads them via SecureKS.load, serves them through Guava LoadingCaches with 5-minute expiry, and exposes cache statistics through JMX, including the client.* and http_client.* aliases.
