---
name: observability-graylog
description: |
  Graylog log analysis using Lucene query syntax. Use this skill for:
  - Checking recent issues, errors, or alerts for Oracle databases (oracle DB log stream in Graylog).
  - Questions like "oracle 114 có vấn đề gì không?", "5 phút gần đây DB có lỗi không?", "xem log oracle [số]", "oracle [số] gần đây có gì?", "kiểm tra lỗi DB".
  - Database log investigation: Oracle alert logs, LOGMINER logs, DB errors in Graylog.
  - General incident investigation through Graylog log search and statistics.
allowed-tools: Bash(*)
---

# Graylog Log Analysis Skill

## 🚨 CRITICAL RULE — Connection Failures & Error Reporting
**If any script returns a connection failure, network timeout, 404, or Connection Refused (`[Errno 111] Connection refused`):**
1. **STOP IMMEDIATELY.** Do NOT run diagnostic bash loops (do not check `env`, `netstat`, `ss`, `ping`, `curl`, scan ports 9000/9001/12201).
2. **DO NOT read or inspect python source code files** (`.py` files like `graylog_client.py` or `search_logs.py`).
3. **Report the exact raw connection error message directly to the user as your final output.**

## ⚡ FAST EXECUTION DIRECTIVES (Zero Redundant Steps)
1. **DO NOT run exploratory bash checks** (`ls /app/.claude/skills/`, `cat SKILL.md`, `env | grep`).
2. **DO NOT read, grep, or inspect python script files** (`graylog_client.py` or `search_logs.py`). They are ready to execute.
3. **Execute immediately in Step 1**:
   - Oracle DB check -> `python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle NNN --range 5m`

> **IMPORTANT — Skill Routing for Oracle DB Questions:**
> When the user asks about recent Oracle DB issues → this skill is CORRECT. Do NOT try sqlplus, tnsping, or local file lookups. Go straight to Step 1 below.


---

## Oracle DB Quick Check Workflow (START HERE for "oracle NNN có vấn đề gì không?")

**Step 1 — Run this ONE command immediately** (replace NNN with the oracle number):

```bash
# Recent relative check (default 15m):
python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle NNN --range 15m

# Specific timeframe check:
python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle NNN --from "YYYY-MM-DD HH:MM:SS" --to "YYYY-MM-DD HH:MM:SS"
```

> **🚨 CRITICAL QUERY RULE**:
> **DO NOT pass `--query "level:<=3..."` or restrict query to only `message:ORA- OR message:TNS-"`!**
> In Graylog, Oracle Alert logs have `level: -1` (info). Critical root cause events such as:
> - `TMON: Process hung on an I/O to LAD:3 after ... seconds`
> - `TMON: WARN: Terminating process hung on an operation` / `Killing ... processes`
> - `TMON: Detected ARCH process failure`
> - `Thread 1 cannot allocate new log` / `Checkpoint not complete`
> have **NO ORA- code** and have **level: -1**. Restricting to `level:<=3` or `ORA-` will **SILENTLY MISS THE ROOT CAUSE**!
> `search_logs.py --oracle NNN` automatically applies smart anomaly filtering when logs exceed 50 lines.

**Step 2 — Analyze and respond:**

### ⚠️ Volume Rule (>50 logs in timeframe):
If the timeframe contains **more than 50 logs**, `search_logs.py` automatically filters out routine background logs (`LOGMINER`, routine `LGWR switch`, `Archived Log entry added`).
Focus EXCLUSIVELY on:
1. **Process Hangs, TMON & I/O Stalls (PRIMARY ROOT CAUSE):**
   - `TMON hung on an I/O to LAD:X`: Archiver / background process stuck on I/O to archive destination (Data Guard / disk).
   - `TMON: Terminating / Killing process hung on an operation`: Watchdog killing hung archiver processes.
   - `Detected ARCH process failure` / `ORA-16055: FAL request rejected`: Archive process failed, causing Data Guard gap.
   - `Thread 1 cannot allocate new log` + `Checkpoint not complete`: Write pipeline stall — all redo logs full, instance freezes until logs are archived/checkpointed.
2. **DB Kernel & Network Errors:** `ORA-` errors, `TNS-` errors, timeouts (`TNS-12535`, `ORA-3136`, `ORA-16055`, `ORA-609`, `Fatal NI connect error 12170`).
3. **DB Lock & Integrity Issues:** `deadlock`, `Corrupt block`, `hang`.

- If any such issues exist: Report them in the Event Summary Table with actionable DBA advice and trace the **full root cause chain**.
- If NO such issues exist: Conclude immediately: **✅ Database is healthy (all logs are routine background operations, no errors or slowness issues found).**

### 1. Log Classification & Root Cause Guide:

- **`✅ No matching logs found`:**
  - No error or warning logs found in the queried timeframe.
  - Immediate conclusion: Database is operating normally; no alerts or anomalies recorded in alert log.

- **Lines with `⚠️` — Actionable Alerts & Error Analysis:**

  - **🔴 Group 1: Process Hangs, TMON & Redo/Archive Stalls (CRITICAL ROOT CAUSE):**
    - `TMON: Process (PID:...) hung on an I/O to LAD:X after N seconds with threshold of M`:
      - **Root Cause**: Archiver process hung on network/disk I/O to Log Archive Destination `LAD:X` (typically Data Guard standby or remote NFS/disk).
    - `TMON: Terminating / Killing process hung on an operation (PID:...)`:
      - **Root Cause**: TMON watchdog killed the hung process to prevent full instance stall.
    - `Detected ARCH process failure`:
      - **Impact**: Archive shipping to standby halted. Standby requests archive redo gap (`ORA-16055: FAL request rejected`).
    - `Thread 1 cannot allocate new log, sequence ...` + `Checkpoint not complete`:
      - **Impact**: **DATABASE WRITE STALL (HANG)**. LGWR needs to switch redo logs, but the next redo group cannot be overwritten because archiver hung or checkpoint is not complete. All user write transactions freeze until switch completes!

  - **🟡 Group 2: Network & Listener Group (Application connectivity):**
    - `TNS-12535: TNS:operation timed out` / `Fatal NI connect error 12170`: Client initiated connection to Oracle Listener but timed out before handshake finished. Root causes: Network latency/packet loss, firewall dropping connections, connection storm, or high host CPU load.
    - `ORA-3136: inbound connection timed out`: Client completed TCP handshake but failed to authenticate within `SQLNET.INBOUND_CONNECT_TIMEOUT` (default 60s). Frequently accompanies `TNS-12535`.

  - **🔴 Group 3: Storage & Memory Critical Group:**
    - `ORA-19809 / ORA-19815 / ORA-00257 (Archiver error)`: Flash Recovery Area (FRA) full or archive disk exhausted. Database halts writes.
    - `ORA-01653 / ORA-01654 (unable to extend table/index)`: Tablespace full or datafile reached maxsize.
    - `ORA-04031 (unable to allocate memory)`: Shared Pool or Large Pool memory exhaustion in SGA.
    - `ORA-00600 / ORA-07445`: Internal Oracle kernel unhandled exception.
    - `ORA-00060 (Deadlock detected)`: Application-level transaction deadlock.

- **Lines without `⚠️` — Benign Background Operations (NORMAL, NOT ERRORS):**
  - `LOGMINER: Begin mining logfile...` / `LOGMINER: End mining logfile...`: Change Data Capture (CDC) streaming tools (Debezium, Kafka Connect, GoldenGate) reading redo logs. Normal.
  - `Thread 1 advanced to log sequence ... (LGWR switch)`: Routine Redo Log Group switch when current is full. Normal.
  - `Archived Log entry ... added for thread ...`: Archiver process (`ARCn`) successfully archived a redo log group. Normal.
  - `Incremental checkpoint up to RBA...`: Regular DBWR/CKPT checkpoint. Normal.

### 2. Standard Response Format for Users:
Always present findings to the user following this 3-part structure:
1. **Quick Verdict:** Clear statement identifying if the database experienced a stall, hang, network timeout, or is healthy.
2. **Event Summary Table:**
   | Timestamp (Local) | Event / Error Code | Severity | Root Cause & Technical Interpretation |
   |---|---|---|---|
   | HH:MM:SS | TMON hung on I/O LAD:3 / ORA-xxxx | 🚨 Critical / ⚠️ Warning | Cause, Impact on DB, Recovery |
3. **Actionable Recommendations:**
   - For TMON / LAD hung I/O: Check network connectivity and disk latency on Data Guard Standby (`LAD:3`), inspect Data Guard transport lag (`v$archive_dest_status`), verify storage performance.
   - For network timeouts (`TNS-12535`, `ORA-3136`): Check app connection pools, firewall conntrack timeouts, and network path.

**STOP. Do NOT run additional commands unless user asks to drill down.**

---

## 🛑 ROOT CAUSE & DRILL-DOWN RULES (Max 2 Queries Budget)

When user asks to drill down, find root cause, or "tìm hiểu rõ nguyên nhân":
1. **MAXIMUM BUDGET: 1 TO 2 QUERIES ONLY.** Conclude your analysis immediately.
2. **COMBINE ALL ERROR CHECKS (ORA- and TNS-) INTO ONE SINGLE QUERY:**
   ```bash
   python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle NNN --query "message:ORA- OR message:TNS- OR message:timeout" --from "..." --to "..."
   ```
3. **❌ NEVER run multiple sequential queries guessing individual errors** (such as separate searches for `ORA-3136`, `ORA-609`, `ORA-16055`, `ORA-16038`, `Fatal NI`, `Client address`, `Starting up`, `Shutdown`). The combined query above catches **ALL** errors at once!
4. **❌ NEVER redirect output to files** (e.g. `> /tmp/out.txt`) or chain with `&&` or `;`. Run the command directly.
5. **CONCLUSION RULES:**
   - If the combined query returns no errors (no ORA-, no TNS-): Conclude immediately that the database is healthy with no recorded errors.
   - If `TNS-12535` is found: Explain listener timeout (network latency, connection storm, or firewall issue).
   - If the logs show `LOGMINER` or sequence switch lines: Explain that these are normal, expected database background operations.

---

## ⚠️ PROHIBITED Actions (waste time, cause errors)

- ❌ Do NOT run `pwd`, `ls`, `find`, `env`, `which sqlplus` before searching
- ❌ Do NOT list streams or check statistics first for Oracle DB questions — go straight to search
- ❌ Do NOT exceed `--limit 50` per query
- ❌ Do NOT run more than 2 query commands per turn

---

## Authentication & Configuration

The Graylog scripts automatically read environment variables:
- `GRAYLOG_URL` — Graylog server URL (default: `http://localhost:9000`)
- `GRAYLOG_API_TOKEN` — API Token for HTTP Basic auth

---

## Oracle DB Naming Convention

| User says | Oracle IP | Graylog query |
|---|---|---|
| oracle 114 | 10.36.88.114 | `source:10.36.88.114` |
| oracle 89 | 10.36.88.89 | `source:10.36.88.89` |
| oracle NNN | 10.36.88.NNN | `source:10.36.88.NNN` |

- **Stream**: `Database Log stream`
- **Log service field**: `log_service:oracle_alert`
- **Limit**: max 20–50 logs per query

---

## Full Investigation Workflow (for general log investigations)

```
1. LIST STREAMS ➔ 2. CHECK STATISTICS ➔ 3. SEARCH & SAMPLE ➔ 4. DRILL DOWN
```

### 1. `get_streams.py` - List Graylog Streams
```bash
python3 .claude/skills/observability-graylog/scripts/get_streams.py
```

### 2. `get_statistics.py` - Log Volume & Field Terms Breakdown
```bash
# Top log sources in the last 1 hour
python3 .claude/skills/observability-graylog/scripts/get_statistics.py --field source --range 1h

# Log level distribution
python3 .claude/skills/observability-graylog/scripts/get_statistics.py --field level --query "level:<=4" --range 24h
```

### 3. `search_logs.py` - Search & Query Logs
```bash
# Search for error logs in the last 15 minutes
python3 .claude/skills/observability-graylog/scripts/search_logs.py --query "level:3 OR message:error" --range 15m

# Search specific host in the last 2 hours (limit 30)
python3 .claude/skills/observability-graylog/scripts/search_logs.py --query "source:10.36.88.114 AND level:3" --range 2h --limit 30

# Absolute time range search (Format: "YYYY-MM-DD HH:MM:SS")
python3 .claude/skills/observability-graylog/scripts/search_logs.py --query "source:10.36.88.124 AND log_service:oracle_alert AND (message:ORA- OR message:TNS- OR message:timeout)" --from "2026-09-22 17:50:00" --to "2026-09-22 18:20:00"
```

### ⏰ Timezone Rule for `--from` and `--to`:
- **ALWAYS use the local time string**: `"YYYY-MM-DD HH:MM:SS"` (e.g. `"2026-09-22 17:50:00"`).
- **❌ DO NOT convert local time to UTC** by subtracting 7 hours! Graylog interprets local time strings directly. If you subtract 7 hours, you will search the morning (10:50) instead of the afternoon (17:50) and get 0 results!

### Lucene Query Quick Reference
```lucene
source:10.36.88.114              # Filter by Oracle 114
message:ORA- OR message:TNS-     # Both DB kernel and TNS network/listener errors
message:timeout OR message:"timed out" # Connection timeouts
log_service:oracle_alert         # Oracle alert log type
source:10.36.88.114 AND level:3  # Combined filter
```

### Syslog Level Reference
| Level | Severity |
|---|---|
| `3` | ERROR |
| `4` | WARN |
| `6` | INFO |
