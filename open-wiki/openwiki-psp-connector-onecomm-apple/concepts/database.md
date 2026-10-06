---
type: utility
title: Database Procedure Execution
description: Centralized Oracle stored procedure mapping, execution, and result-set processing used by all domain services.
tags:
  - database
  - oracle
  - stored-procedure
  - pspconnector
verified:
  - by: openwiki/0.5.2
    at: 2026-09-25T07:03:17.397Z
sources:
  - id: openwiki-source-9c8230397410fb1febe69839
    resource: repo://src/main/java/vn/onepay/pspconnector/common/service/AuthorizationService.java
  - id: openwiki-source-498aa0356cd724a65b3c6455
    resource: repo://src/main/java/vn/onepay/pspconnector/common/service/RefundService.java
  - id: openwiki-source-fbc4ae104d79fced442a02eb
    resource: repo://src/main/java/vn/onepay/pspconnector/common/util/AppParams.java
  - id: openwiki-source-84f1c330a24cbf8adced773b
    resource: repo://src/main/java/vn/onepay/pspconnector/common/util/DBProcedureUtil.java
  - id: openwiki-source-a95d103924c44aa779e3c7eb
    resource: repo://src/main/java/vn/onepay/pspconnector/common/util/ProcedurePool.java
generated: { by: "openwiki/0.5.2", at: "2026-09-25T07:03:17.397Z" }
---

## Database Procedures

The PSP Connector application interacts with its Oracle database almost exclusively through stored procedures. The mapping of these procedures and the generic execution logic are encapsulated in two utility classes: `ProcedurePool` and `DBProcedureUtil`.

### Procedure Pool

`ProcedurePool` serves as a central registry for all stored procedure call strings. It defines constants for each procedure, specifying the package name, procedure name, and the number of parameters.

Key procedure groups defined in `ProcedurePool` include:

*   **Client Management**: `CLIENT_GET_KEY`, `CLIENT_ACTIVITY_INSERT`, `CLIENT_ACTIVITY_UPDATE`
*   **Authorization Management**: `AUTH_GET`, `AUTH_SEARCH`, `AUTH_INSERT`, `AUTH_INSERT_WITH_ID`, `AUTH_UPDATE`
*   **Payment Processing**: `PAYMENT_INSERT`, `PAYMENT_UPDATE`, `PAYMENT_GET`
*   **Connector Messaging**: `CONNECTOR_MSG_GET`, `CONNECTOR_MSG_INSERT`, `CONNECTOR_MSG_UPDATE_REQUEST`, `CONNECTOR_MSG_UPDATE_RESPONSE`
*   **Refund Processing**: `REFUND_INSERT`, `REFUND_UPDATE`
*   **Error Handling**: `CONNECTOR_ERROR_GET`

### Execution Utility (DBProcedureUtil)

`DBProcedureUtil` provides the `execute` method, which is the sole interface for invoking the stored procedures defined in the pool. It handles connection management, parameter binding, execution, and result extraction.

#### Input Parameter Mapping

Input parameters are passed as a `Map<Integer, Object>`, where the key is the 1-based parameter index and the value is the parameter object. The utility performs type checking to correctly bind parameters:

*   **Primitives**: `Integer`, `Long`, `Float`, `Double`, `Boolean` are bound to their respective `CallableStatement` setter methods.
*   **Strings**: Bounded directly.
*   **Dates**: `java.sql.Timestamp` and `java.util.Date` are converted and bounded as SQL timestamps/dates.
*   **Nulls**: `OracleTypes.NULL` is used for unrecognized or null values.

#### Output Parameter Handling

Output parameters are defined using two maps:

*   `outParameters` (`Map<Integer, Integer>`): Maps the parameter index to the Oracle type constant (e.g., `OracleTypes.NUMBER`, `OracleTypes.CURSOR`).
*   `outParameterNames` (`Map<Integer, String>`): Maps the parameter index to a logical name (like `response_code`, `response_data`) for the result map.

#### Result Set Processing

The `execute` method returns a `Map<String, Object>` containing the processed output parameters. The processing logic varies by type:

*   **Scalar Types** (`NUMBER`, `VARCHAR`): The value is extracted directly and placed in the result map using the logical name.
*   **Cursor Types** (`CURSOR`): The `ResultSet` is iterated, and each row is converted into a `Map<String, Object>`. These rows are collected into a `List<Map<String, Object>>` and placed in the result map.

**Data Transformation**: During cursor processing, specific Oracle types are transformed for Java compatibility. Notably, `oracle.sql.TIMESTAMP` objects are converted to `java.util.Date` instances.

#### Error Handling and Cleanup

The method wraps execution in a try-catch block, logging severe errors. It ensures resources (`ResultSet`, `CallableStatement`, `Connection`) are closed in a finally-like manner via `closeObjects`, regardless of the execution outcome.

### Service Layer Integration

Domain services (e.g., `AuthorizationService`, `PaymentService`, `RefundService`) utilize this infrastructure by:

1.  Defining input maps with business data.
2.  Specifying output expectations (code, description, and data cursor).
3.  Calling `DBProcedureUtil.execute` with the appropriate procedure from `ProcedurePool`.
4.  Extracting the result code to check for success (usually `200 OK` or `201 CREATED`).
5.  Mapping the raw database results into domain-specific JSON structures.

This abstraction decouples the service layer from raw JDBC code while maintaining a consistent contract for database interactions across the application.
