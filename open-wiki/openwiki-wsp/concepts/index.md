# Files

- [Authorization and 3D Secure](authorization.md) - Domain handling payment authorization, 3-D Secure verification, OTP flows, and authorization state transitions within the WSP payment gateway.
- [Card Brands and Instrument Types](card-brands.md) - Defines how the payment gateway identifies card brands, BIN-based issuer routing, and the full instrument type taxonomy used across VPC, Google Pay, Apple Pay, and Samsung Pay invoice flows.
- [Digital Wallets and BNPL](digital-wallets.md) - Describes the WSP digital wallet payment integrations (Apple Pay, Google Pay, Samsung Pay), the Merchant Decrypt flow, and Buy Now Pay Later (BNPL) instrument types (HomeCredit, Kredivo, Fundiin), including their payment creation flows, token handling, and instrument mapping.
- [Error Codes and Handling](error-codes.md) - Documents the error codes, exception classes, JSON response formatting, and error page redirect logic used across the WSP payment gateway, including invoice and payment flows.
- [Instrument Cache and BIN Country Lookup](instrument-cache.md) - Singleton in-memory cache for mapping Bank Identification Numbers (BINs) to country codes, backed by a Guava LoadingCache and an async MSP backend call.
- [Instruments and Tokenization](instrument.md) - Documentation of instrument service, tokenization, card storage, and installment plan flows.
- [Invoice Encrypted Card Service](invoice-encrypt-card.md) - Documents the 2C2P encrypted card invoice creation flow, handling the lifecycle of encrypted card data from validation and decryption to MSP and PSP payment creation.
- [Invoice and Payment State Model](invoice-states.md) - Documents the state values and transitions for invoices and payments in the WSP proxy layer, including the relationship between invoices, payments, instruments, and authorizations.
- [Payment Methods Taxonomy](payment-methods.md) - The complete taxonomy of supported payment methods, including card brands, bank-specific card profiles, digital wallets, and merchant validation profiles.
