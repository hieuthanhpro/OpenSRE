---
type: caching
title: Instrument Cache and BIN Country Lookup
description: Singleton in-memory cache for mapping Bank Identification Numbers (BINs) to country codes, backed by a Guava LoadingCache and an async MSP backend call.
tags: [instrument, cache, bin, country, guava, msp]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T08:58:44.659Z
sources:
  - id: openwiki-source-8e15284c867273dabf2be508
    resource: repo://src/main/java/vn/onepay/wsp/resources/instrument/InstrumentCache.java
  - id: openwiki-source-5f00d1d228eb06562636cc2e
    resource: repo://src/main/java/vn/onepay/wsp/resources/instrument/InstrumentService.java
generated: { by: "openwiki/0.5.2", at: "2026-09-22T08:58:44.659Z" }
---

# Instrument Cache and BIN Country Lookup

The WSP gateway uses `InstrumentCache` to maintain an in-memory mapping between Bank Identification Numbers (BINs) and their associated country codes. This avoids redundant network calls to the downstream MSP (Microservice Platform) for every payment request that requires BIN country validation. The cache is implemented as a singleton wrapper around a Guava `LoadingCache` and is consumed by `InstrumentService`, which exposes the lookup to the REST API.

## Architecture and Responsibilities

`InstrumentCache` is responsible for:

1.  **Singleton Lifecycle**: Ensuring only one instance of the cache exists across the application to guarantee a shared, consistent view of cached data.
2.  **Automatic Loading**: Defining how to fetch and populate cache entries when they are missing (cache miss).
3.  **Expiry Management**: Configuring entries to expire after a set duration to prevent stale data from persisting indefinitely.

`InstrumentService` acts as the facade for instrument-related operations, using `InstrumentCache` to serve BIN country lookups to external clients.

## Singleton Lifecycle

The `InstrumentCache` class uses a double-checked locking pattern to implement a thread-safe singleton. This ensures that the expensive initialization of the cache and its configuration happens only once, even in a concurrent Vert.x environment.

```java
// repo://src/main/java/vn/onepay/wsp/resources/instrument/InstrumentCache.java#L14-L38
private static volatile InstrumentCache instance;

public static InstrumentCache getInstance() {
    if (instance == null) {
        synchronized (InstrumentCache.class) {
            if (instance == null) {
                instance = new InstrumentCache();
            }
        }
    }
    return instance;
}
```

## Cache Configuration

The underlying Guava `LoadingCache` is configured with a simple time-based expiration policy:

-   **Expiration**: Entries expire 1 day after being written (`expireAfterWrite`).
-   **Loader**: A custom `CacheLoader` handles data retrieval on cache misses.

```java
// repo://src/main/java/vn/onepay/wsp/resources/instrument/InstrumentCache.java#L46-L50
private static final LoadingCache<String, String> initBinCountryCache() {
    return CacheBuilder.newBuilder()
                .expireAfterWrite(1, TimeUnit.DAYS)
                .build(binCountryCacheLoader);
}
```

## Data Loading Flow (Cache Miss)

When a requested BIN is not in the cache, Guava invokes the `binCountryCacheLoader`. The loading process bridges the gap between Guava's synchronous `CacheLoader` and WSP's asynchronous Vert.x HTTP client:

1.  **Initiation**: The `load` method is triggered with the missing BIN as the key.
2.  **Async Bridge**: A `CompletableFuture` is created to act as a bridge. The async result of `InstrumentService.getBinCountryFromMsp` is piped into this future.
3.  **MSP Call**: `getBinCountryFromMsp` executes a GET request to the MSP endpoint (`/checkbin/<binNum>`) using `Util.mspGet`.
4.  **Blocking Wait**: The loader calls `futureResult.get(timeout, ...)`, blocking the Guava loader thread until the async MSP response is received or the configured MSP timeout (`Config.getMspTimeout()`) is exceeded.
5.  **Population**: The returned country code is automatically placed into the cache by Guava for subsequent requests.

```java
// repo://src/main/java/vn/onepay/wsp/resources/instrument/InstrumentCache.java#L55-L78
private static final CacheLoader<String, String> binCountryCacheLoader = new CacheLoader<>() {
    @Override
    public String load(String key) throws Exception {
        CompletableFuture<String> futureResult = new CompletableFuture<>();
        InstrumentService.getBinCountryFromMsp(key).onComplete(ar -> {
            if (ar.succeeded()) futureResult.complete(ar.result());
            else futureResult.completeExceptionally(ar.cause());
        });
        // Blocks until async MSP call completes or times out
        return futureResult.get(Config.getMspTimeout(), TimeUnit.MILLISECONDS);
    }
};
```

## API Usage

The `InstrumentService.getBinCountry` method handles the HTTP request for BIN validation.

1.  **Validation**: The `bin_num` parameter is validated to ensure it is 6-11 digits.
2.  **Retrieval**: The service calls `InstrumentCache.getInstance().getBinCountryFromCache(binNum)`.
3.  **Response**: The result is filtered against a supported country list ("US", "GB", "CA") and returned as a JSON object.

The route is registered in `Server` as:
`GET /paygate/api/v1/checkbin/:bin_num`

## External Dependencies

### Guava Cache
The cache implementation relies heavily on `com.google.common.cache.CacheBuilder` and `CacheLoader`, part of the Google Guava library (`com.google.guava:guava`). This provides robust in-memory caching capabilities including expiration, size limits (though not used here), and automatic loading.

### MSP Client (via Util)
The data source for the cache is the MSP backend. `InstrumentCache` indirectly depends on `Util.mspGet`, which handles the HTTP communication, authentication (HMAC signing via `vn.onepay:ows`), and serialization with the MSP service. The connection settings (URL, timeout, credentials) are managed by `Config`.

## Failure Modes

-   **MSP Unavailability**: If the MSP backend is unreachable or slow, the `CompletableFuture.get` call in the loader will timeout (based on `Config.getMspTimeout()`). This will throw an `ExecutionException` (wrapping a `TimeoutException`), causing the cache load to fail. The caller (the REST handler) will catch this and return an error to the client.
-   **Stale Data**: Due to the 1-day expiration, the cache may serve country data that is up to 24 hours old. This is an acceptable trade-off for performance and reduced backend load, as BIN-country mappings rarely change.
