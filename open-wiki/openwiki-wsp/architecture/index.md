# Files

- [WSP Configuration System](configuration.md) - Documents how WSP loads, accesses, and overrides settings from config.json, config.properties, and validation.yaml using the Config.java facade.
- [Key Dependencies](dependencies.md) - Documents the core Maven dependencies, internal OnePay libraries, and runtime build tooling that support the WSP gateway.
- [WSP Architecture Overview](overview.md) - Overview of WSP (Website Service Provider), a Vert.x HTTP gateway that orchestrates payment flows across MSP, ASP, TSP, and PSP connectors.
- [Routing and Request Handling](routing-and-requests.md) - Defines the Vert.x Router setup, URI prefixes, middleware chain, and route map for WSP request handling.
- [Legacy ONECOMM Migration Layer](templates.md) - Integration and redirection layer handling legacy ONECOMM payment gateway requests, including VPC, Traveloka, and Refund flows, and their redirection to the MSP.
- [Shared Utilities](util.md)
