---
type: testing
title: Testing Overview
description: Overview of the PSP-Connector test suite for the Onecomm provider, covering the OnecommGateway unit tests, configuration under test, and how to run and extend them.
tags: [testing, unit-tests, onecomm, gateway, coverage]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-23T03:50:02.660Z
sources:
  - id: openwiki-source-2355f81d7cf522f8dbdaabd4
    resource: repo://pom.xml
  - id: openwiki-source-497da8d64c5091eb415989b1
    resource: repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java
  - id: openwiki-source-f268d86baa48659da143531e
    resource: repo://src/main/resources/app.properties
  - id: openwiki-source-0cc0cdbf3e6e0899961e9b13
    resource: repo://src/test/java/vn/onepay/pspconnector/provider/onecomm/OnecommGatewayTest.java
generated: { by: "openwiki/0.5.2", at: "2026-09-23T03:50:02.660Z" }
---

# Testing Overview

This page documents the test coverage for the **PSP-Connector – Onecomm** provider and how to extend itdb. The current suite is small but targets the two methods with the most nontrivial, self-contained logic in the gateway: bank version selection and transaction-response-code-to-failure-reason mapping.

## Test Suite at a Glance

The project contains a single unit test class, `OnecommGatewayTest`, located under `src/test/java/vn/onepay/pspconnector/provider/onecomm/`. It exercises the `OnecommGateway` gateway directly:

```text
src/test/java/vn/onepay/pspconnector/provider/onecomm/
└── OnecommGatewayTest.java
```

| Test method | Target | What it verifies |
|---|---|---|
| `testGetBankVersion` | `OnecommGateway.getBankVersion(bankId, instrumentType, jInstrument)` | SHB (bank 12) version selection: returns `"2"` for `shb_account` instruments, for card instruments with month+year present, or when a `bank_version` of `"2"` is supplied; returns `"1"` otherwise; returns `null` for all other banks. |
| `testGetFailedReason` | `OnecommGateway.getFailedReason(code)` and `getFailedReason(code, bankId)` | Maps Onecomm transaction response codes to reason JSON objects, including bank-specific overrides (e.g., SHB bank 12 overriding token info) and the default fallback for unmapped codes. |

**Source:** `repo://src/test/java/vn/onepay/pspconnector/provider/onecomm/OnecommGatewayTest.java#L10-L69`

## Bank Version Selection

`getBankVersion` decides which protocol version to use when talking to a bank. The logic is concentrated on SHB (bank id `12`):

```java
// src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java#L1645-L1657
public static String getBankVersion(int bankId, String instrumentType, JsonObject jInstrument) {
    if (bankId == 12) { // SHB
        if ("2".equals(jInstrument.getString(BANK_VERSION))
            || SHB_ACCOUNT.equals(instrumentType)
            || (CARD.equals(instrumentType)
                && Strings.isNotEmpty(jInstrument.getString("month"))
                && Strings.isNotEmpty(jInstrument.getString("year")))) {
            return "2";
        } else {
            return "1";
        }
    } else {
        return null;
    }
}
```

Version `2` is selected for SHB when any of the following holds:

*   The caller explicitly passes `bank_version = "2"` (UI-supplied).
*   The instrument is an `shb_account` (account-based transaction).
*   The instrument is a `card` whose **month** and **year** fields are both present (card issued-date known).

Otherwise SHB uses version `1`. For any bank other than SHB the method returns `null` (no version override).

The tests cover all four branches: explicit version, account instrument, card with month/year, and card without month/year, plus a non-SHB bank returning `null`.

**Source:** `repo://src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java#L1645-L1657`

## Failure Reason Mapping

`getFailedReason` translates a transaction **response code** into a structured failure reason (name, message, details, information link). There are three overloads:

### 1. Generic mapping — `getFailedReason(code)`

```java
// src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java#L1669-L1689
String reasonName  = Main.p.getProperty("onecomm.status." + txnResponseCode + ".code");
String reasonMessage = Main.p.getProperty("onecomm.status." + txnResponseCode + ".desc");
if (reasonName == null || "".equalsIgnoreCase(reasonName)) {
    reasonName = "ONECOMM_RESPONSE_CODE_NOT_MAP";
    reasonMessage = "Response code is not map";
}
```

The mapping reads `onecomm.status.<code>.code` and `onecomm.status.<code>.desc` properties from the loaded `app.properties`. When no entry exists, it falls back to the default reason `ONECOMM_RESPONSE_CODE_NOT_MAP`.

### 2. Bank-specific mapping — `getFailedReason(code, bankId)`

```java
// src/main/java/vn/onepay/pspconnector/provider/onecomm/OnecommGateway.java#L1691-L1711
String reasonName  = Main.p.getProperty("onecomm.status." + txnResponseCode + ".bank." + bankId + ".code");
String reasonMessage = Main.p.getProperty("onecomm.status." + txnResponseCode + ".bank." + bankId + ".desc");
if (reasonName == null || "".equalsIgnoreCase(reasonName)) {
    reasonName = "ONECOMM_RESPONSE_CODE_NOT_MAP";
    reasonMessage = "Response code is not map";
}
```

This overload gives a per-bank override on top of the generic mappinghol, so a bank can remap a code that the generic table would otherwise translate differently (for instance SHB bank 12 remapping code `24` to an SHB-specific token-information reason).

### Status code vocabulary

The codes and their failure-reason names are defined in `app.properties`:

```text
# src/main/resources/app.properties
onecomm.status.1.code=ONECOMM_BANK_DECLINED
onecomm.status.3.code=ONECOMM_TRANSACTION_TIMEOUT
onecomm.status.4.code=ONECOMM_INVALID_ACCESS_CODE
onecomm.status.5.code=ONECOMM_INVALID_AMOUNT
onecomm.status.6.code=ONECOMM_INVALID_CURRENCY_CODE
onecomm.status.7.code=ONECOMM_INTERNAL_SERVER_ERROR
onecomm.status.9.code=ONECOMM_INVALID_CARD_HOLDER_NAME
onecomm.status.10.code=ONECOMM_INVALID_CARD
onecomm.status.11.code=ONECOMM_CARD_NOT_REGISTER_SERVICE
onecomm.status.12.code=ONECOMM_INVALID_DATE
onecomm.status.13.code=ONECOMM_LIMIT_EXCEEDED
onecomm.status.14.code=ONECOMM_INVALID_CARD_NUMBER
onecomm.status.21.code=ONECOMM_INSUFFICIENT_FUND
onecomm.status.22.code=ONECOMM_INVALID_ACCOUNT_INFO
onecomm.status.23.code=ONECOMM_ACCOUNT_LOCKED
onecomm.status.24.code=ONECOMM_INVALID_CARD_INFO
onecomm.status.25.code=ONECOMM_INVALID_OTP
onecomm.status.26.code=ONECOMM_EXPIRED_OTP
onecomm.status.253.code=ONECOMM_TRANSACTION_TIME_EXCEEDED
onecomm.status.254.code=ONECOMM_INTERNAL_SERVER_ERROR
onecomm.status.98.code=ONECOMM_AUTHENTICATION_CANCEL
onecomm.status.99.code=ONECOMM_USER_CANCEL_TRANSACTION
```

`testGetFailedReason_WithoutBank` asserts these mappings for a broad set of codes (1–26, 98, 99, 253, 254) and confirms that code `100` resolves to the generic fallback `ONECOMM_RESPONSE_CODE_NOT_MAP`.

**Source:** `repo://src/main/resources/app.properties#L67-L134`; `repo://src/test/java/vn/onepay/pspconnector/provider/onecomm/OnecommGatewayTest.java#L41-L69`

## Test Setup Dependencies

Both tests construct `OnecommGateway` directly (it is package-private) and rely on two shared pieces of state:

1.  **The properties bag `Main.p`** — the mapping methods read response-code properties from this static field. In the tests it is populated by loading `app.properties`:
    ```java
    p.load(Main.class.getClassLoader().getResourceAsStream("app.properties"));
    ```
2.  **The `app.properties` resource** must therefore be reachable on the test classpath for the reason-mapping tests to pass.

Because `OnecommGateway` is package-private and its constructor is trivial, the tests live in the same package (`vn.onepay.pspconnector.provider.onecomm`) as the class under test.

## Running the Tests

Tests are **skipped by default**. The build sets `skipTests=true` in `pom.xml`:

```xml
<skipTests>true</skipTests>
```

So a plain `mvn test` compiles but does not execute the suite. Re-enable them explicitly:

```bash
mvn test -DskipTests=false
```

**Source:** `repo://pom.xml#L13-L14`

## How to Extend Tests

When modifying the Onecomm provider, follow these guidelines:

1.  **Keep unit tests focused on pure logic.** `getBankVersion` and `getFailedReason` are ideal candidates because they perform deterministic mapping with no I/O. Prefer testing these directly over integration tests.
2.  **Mock external dependencies.** Methods that call the Onecomm service over HTTP, use Hessian serialization, or hit the Oracle database belong in integration tests with mocked clients/sources (e.g., Mockito), not in the pure unit suite.
3.  **Add bank-specific cases.** New banks or instruments usually introduce new `getBankVersion` branches and new `onecomm.status.*` property entries. Add one assertion per branch and one per new status-code mapping, and cover the unmapped fallback.
4.  **When adding a new response code,** add the corresponding `onecomm.status.<code>.code` / `.desc` properties **and** a test assertion so the property and its test stay in sync.

## Limitations

*   The current suite covers only `OnecommGateway`. Provider-level classes (`OnecommPaymentServiceProvider`, `OnecommRefundServiceProvider`), the NAPAS gateway, and the database access layer have no direct tests yet.
*   Tests depend on a shared static `Main.p` properties instance and the `app.properties` resource, so they are stateful rather than fully isolated.
.
