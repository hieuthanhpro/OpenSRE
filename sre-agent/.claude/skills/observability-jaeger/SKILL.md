---
name: observability-jaeger
description: |
  Jaeger distributed tracing analysis for microservices. Use this skill ONLY for:
  - Investigating request latency, tracing runtime errors across services, finding slow spans, or inspecting live service dependencies.
  - Querying distributed traces, inspecting trace spans, analyzing error spans (tags error=true).
  - Finding and analyzing slow requests and latency bottlenecks (slow traces, percentiles).
  - Visualizing actual runtime request flows from specific Trace IDs into Node-based Topology Graphs or Sequence Diagrams.
  - User queries explicitly requesting real traces: "trace ID [abc]", "lấy trace thật", "real trace flow", "check Jaeger", "inspect trace", "slow traces", "error traces".
  - NOTE: For general architectural flows or design specifications (e.g. "draw payment flow", "draw refund flow"), do NOT use this skill; use `openwiki` instead.
allowed-tools: Bash(*)
---

# Jaeger Tracing Analysis

## 🚨 CRITICAL ROUTING RULE — When to Use Jaeger Tracing vs. OpenWiki
- **DO NOT AUTOMATICALLY FETCH TRACES:** When the user asks general architectural questions like *"draw payment flow"*, *"vẽ luồng thanh toán"*, *"draw refund flow WSP → MSP"*, *"draw sequence diagram"*, **YOU MUST USE `openwiki`**. Never automatically call Jaeger to pull runtime traces.
- **ONLY USE JAEGER UPON EXPLICIT USER INSTRUCTION:**
  - When the user explicitly asks for live traces: *"theo trace thật"*, *"get real trace"*, *"trace ID: ..."*, *"Jaeger trace"*, *"find latest error trace"*, *"draw actual trace flow"*.
  - When the user provides a specific `Trace ID` to investigate runtime errors or live latency.

## 🚨 CRITICAL RULE — Connection Failures & Error Reporting
**If any script returns a connection failure, network timeout, 404, or Connection Refused:**
1. **STOP IMMEDIATELY.** Do NOT run diagnostic bash loops (do not check `netstat`, `ping`, `curl`).
2. **DO NOT read or inspect python source code files.**
3. **Report the exact connection error message directly to the user.**

## Configuration
- Jaeger Query API is configured via `JAEGER_URL` in `.env` (defaults to `http://127.0.0.1:16686` if present in `.env`).
- Scripts use `python3 .claude/skills/observability-jaeger/scripts/...`.
- No authentication required for internal Jaeger queries.

---

## MANDATORY: Statistics-First Investigation

**NEVER dump all traces.** Always follow this pattern:

```
SERVICES → OPERATIONS → STATISTICS → SAMPLE TRACES
```

1. **List Services** - Know what services exist
2. **List Operations** - Understand endpoints/operations per service
3. **Get Statistics** - Error rates, latency percentiles
4. **Sample Traces** - Get specific traces after understanding the landscape

## Available Scripts

All scripts are in `.claude/skills/observability-jaeger/scripts/`

### SERVICE DISCOVERY

#### list_services.py - List All Traced Services
```bash
python .claude/skills/observability-jaeger/scripts/list_services.py

# Output: List of all services sending traces to Jaeger
```

#### list_operations.py - List Operations for a Service
```bash
python .claude/skills/observability-jaeger/scripts/list_operations.py <service>

# Example:
python .claude/skills/observability-jaeger/scripts/list_operations.py frontend
```

### TRACE INVESTIGATION

#### get_traces.py - Search for Traces
```bash
python .claude/skills/observability-jaeger/scripts/get_traces.py --service SERVICE [OPTIONS]

# Options:
#   --operation OPERATION  Filter by operation name
#   --tags KEY=VALUE       Filter by tags (can repeat)
#   --min-duration MS      Minimum duration in milliseconds
#   --max-duration MS      Maximum duration in milliseconds
#   --limit N              Max traces to return (default: 20)
#   --lookback HOURS       How far back to search (default: 1)

# Examples:
python .claude/skills/observability-jaeger/scripts/get_traces.py --service frontend --limit 10
python .claude/skills/observability-jaeger/scripts/get_traces.py --service checkout --min-duration 500
python .claude/skills/observability-jaeger/scripts/get_traces.py --service api --operation "HTTP GET /users" --limit 5
python .claude/skills/observability-jaeger/scripts/get_traces.py --service payment --tags error=true
```

#### get_trace.py - Get Full Trace by ID
```bash
python .claude/skills/observability-jaeger/scripts/get_trace.py <trace-id>

# Example:
python .claude/skills/observability-jaeger/scripts/get_trace.py abc123def456789
```

#### visualize_trace.py - Generate Interactive Trace Diagram & Timeline
Use when user asks to:
- "vẽ diagram", "visualize trace", "sơ đồ luồng request", "vẽ flow trace", "mô tả luồng request từ trace id".

```bash
# Generate standalone interactive HTML file (default)
python .claude/skills/observability-jaeger/scripts/visualize_trace.py <trace-id>

# Generate Mermaid flowchart text (for terminal/chat output)
python .claude/skills/observability-jaeger/scripts/visualize_trace.py <trace-id> --mode mermaid

# Save HTML to a specific path
python .claude/skills/observability-jaeger/scripts/visualize_trace.py <trace-id> --output /tmp/trace_flow.html

# Automatically open in browser
python .claude/skills/observability-jaeger/scripts/visualize_trace.py <trace-id> --open
```

Features:
- **Node-based Service Topology**: Each service is a node with duration badge, error status, and aggregated DB call badge (`🗄️ X DB calls`).
- **Clickable Edges**: Clicking any request edge opens an inspector with Method, Endpoint, Status, Server Address, Headers, and **Response Time Breakdown** inside the call.
- **Clickable Nodes**: Clicking a service node displays service metrics and full list of database statements executed.
- **Interactive Timeline**: Gantt chart displaying service spans and the slowest representative DB call for each service. Hovering shows operation tooltip; clicking highlights on the graph.
- **Fallback Mermaid Diagram**: Clean flowchart text format for markdown previews and terminal environments.


### LATENCY ANALYSIS

#### get_slow_traces.py - Find Slow Traces
```bash
python .claude/skills/observability-jaeger/scripts/get_slow_traces.py --service SERVICE [OPTIONS]

# Options:
#   --min-duration MS      Minimum duration threshold (default: 1000)
#   --operation OPERATION  Filter by specific operation
#   --limit N              Max traces to return (default: 20)
#   --lookback HOURS       How far back to search (default: 1)

# Examples:
python .claude/skills/observability-jaeger/scripts/get_slow_traces.py --service checkout --min-duration 500
python .claude/skills/observability-jaeger/scripts/get_slow_traces.py --service api --operation "POST /orders"
```

#### get_latency_stats.py - Latency Statistics
```bash
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service SERVICE [OPTIONS]

# Options:
#   --operation OPERATION  Filter by operation
#   --lookback HOURS       Time window (default: 1)

# Example:
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service frontend
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service checkout --operation "POST /checkout"
```

### ERROR ANALYSIS

#### get_error_traces.py - Find Traces with Errors
```bash
python .claude/skills/observability-jaeger/scripts/get_error_traces.py --service SERVICE [OPTIONS]

# Options:
#   --operation OPERATION  Filter by operation
#   --limit N              Max traces (default: 20)
#   --lookback HOURS       Time window (default: 1)

# Example:
python .claude/skills/observability-jaeger/scripts/get_error_traces.py --service payment
python .claude/skills/observability-jaeger/scripts/get_error_traces.py --service api --operation "POST /checkout"
```

---

## Investigation Workflow

### Standard Latency Investigation

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LIST SERVICES                                              │
│    python list_services.py                                    │
│    → Identify which service to investigate                    │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. GET LATENCY STATS                                          │
│    python get_latency_stats.py --service X                    │
│    → See p50, p95, p99 latencies per operation                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                   High Latency Found?
               ┌─────────────┴─────────────┐
               │                           │
              YES                          NO
               │                           │
               ▼                           ▼
┌─────────────────────────────┐  ┌───────────────────────────────────────────┐
│ 3a. GET SLOW TRACES         │  │ 3b. CHECK ERRORS                          │
│    python get_slow_traces.py│  │    python get_error_traces.py --service X │
│    --service X              │  │    → Look for error patterns              │
│    → Analyze slow paths     │  └───────────────────────────────────────────┘
└─────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. ANALYZE SPECIFIC TRACE                                     │
│    python get_trace.py <trace-id>                             │
│    → See full span tree, find bottleneck                      │
└─────────────────────────────────────────────────────────────┘
```

### Quick Commands Reference

| Goal | Command |
|------|---------|
| List all services | `list_services.py` |
| List operations | `list_operations.py <service>` |
| Get latency stats | `get_latency_stats.py --service X` |
| Find slow traces | `get_slow_traces.py --service X --min-duration 500` |
| Find error traces | `get_error_traces.py --service X` |
| Get specific trace | `get_trace.py <trace-id>` |
| Search with tags | `get_traces.py --service X --tags http.status_code=500` |

---

## Trace Anatomy

### Span Structure
```
Trace (trace_id: abc123)
├── Span: frontend (span_id: 001, duration: 250ms)
│   ├── Span: api-gateway (span_id: 002, duration: 200ms)
│   │   ├── Span: auth-service (span_id: 003, duration: 50ms)
│   │   └── Span: order-service (span_id: 004, duration: 120ms) ← bottleneck
│   │       └── Span: database (span_id: 005, duration: 100ms) ← root cause
│   └── Span: cache-lookup (span_id: 006, duration: 5ms)
```

### Common Tags
- `http.method` - HTTP method (GET, POST, etc.)
- `http.url` - Request URL
- `http.status_code` - Response status code
- `error` - Boolean, true if span has error
- `span.kind` - client, server, producer, consumer
- `db.type` - Database type (mysql, postgres, redis)
- `db.statement` - Database query (may be truncated)

### Finding Bottlenecks
1. Sort spans by duration (longest first)
2. Look for the **critical path** (spans on the main request flow)
3. Check if slow span has child spans (slow child = propagated latency)
4. Check tags for error=true or high status codes

---

## Common Patterns

### Find Slow Database Queries
```bash
# Find traces with slow DB operations
python .claude/skills/observability-jaeger/scripts/get_traces.py \
  --service order-service \
  --tags db.type=postgres \
  --min-duration 100
```

### Find HTTP Errors
```bash
# Find 5xx errors
python .claude/skills/observability-jaeger/scripts/get_traces.py \
  --service api-gateway \
  --tags http.status_code=500

# Or use error traces script
python .claude/skills/observability-jaeger/scripts/get_error_traces.py --service api-gateway
```

### Compare Latency Across Services
```bash
# Get stats for each service
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service frontend
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service api
python .claude/skills/observability-jaeger/scripts/get_latency_stats.py --service database
```

---

## Anti-Patterns to Avoid

1. **NEVER fetch all traces** - Always use filters (service, time, duration)
2. **Skip service discovery** - Always start with `list_services.py`
3. **Ignore latency stats** - Get percentiles before diving into individual traces
4. **Focus on single spans** - Look at the full trace context
5. **Miss error tags** - Always check for `error=true` in slow traces
6. **Unbounded time ranges** - Always specify `--lookback` for time bounds

---

## Output Format

When reporting trace findings, use this structure:

```
## Trace Analysis Summary

### Service: [service name]
### Time Window: [start] to [end]

### Latency Statistics
| Operation | p50 | p95 | p99 | Count |
|-----------|-----|-----|-----|-------|
| GET /api  | 50ms| 150ms| 300ms| 1000|

### Slow Traces Found
1. **Trace ID**: abc123
   - **Duration**: 2.5s
   - **Bottleneck**: database span (1.8s)
   - **Root Cause**: Slow query on orders table

### Error Traces Found
1. **Trace ID**: def456
   - **Error**: Connection refused to payment-service
   - **Impact**: 5xx returned to client

### Root Cause Hypothesis
[Based on trace analysis]

### Recommended Action
[Specific remediation step]
```
