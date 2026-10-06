# Files

- [Database & Persistence](data-access.md) - Maps the Oracle database layer, including connection pooling, stored procedure execution, and provider-specific data access classes.
- [Provider SPI (Payment & Refund)](provider-spi.md) - The PaymentServiceProvider and RefundServiceProvider abstract classes define the pluggable payment-provider SPI used by PSP-Connector to integrate with downstream payment gateways, with Onecomm as the primary implementation.
- [HTTP Server & Routing](server.md) - Describes the Vert.x-based HTTP server setup, including server lifecycle, router wiring, global middleware, route registration, and request/response handling.
