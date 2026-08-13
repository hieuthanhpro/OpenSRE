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
python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle NNN --range 5m
```

> Examples:
> ```bash
> # Oracle 114, last 5 minutes
> python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle 114 --range 5m
>
> # Oracle 114, errors only, last 15 minutes
> python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle 114 --query "level:3" --range 15m
>
> # Oracle 114, ORA- errors only
> python3 .claude/skills/observability-graylog/scripts/search_logs.py --oracle 114 --query "message:ORA-" --range 1h
> ```

The `--oracle NNN` flag automatically:
- Sets query to `source:10.36.88.NNN AND log_service:oracle_alert`

**Step 2 — Analyze and respond:**
- `✅ No matching logs found` → Không có vấn đề gì trong khoảng thời gian này
- Lines with `⚠️` → ORA- errors hoặc ERROR/CRIT — cần chú ý và giải thích cho user
- Lines without `⚠️` → INFO/NOTICE logs — hoạt động bình thường

**STOP. Do NOT run additional commands unless user asks to drill down.**

---

## ⚠️ PROHIBITED Actions (waste time, cause errors)

- ❌ Do NOT run `pwd`, `ls`, `find`, `env`, `which sqlplus` before searching
- ❌ Do NOT list streams or check statistics first for Oracle DB questions — go straight to search
- ❌ Do NOT exceed `--limit 50` per query

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

# Absolute time range search (ISO8601)
python3 .claude/skills/observability-graylog/scripts/search_logs.py --query "message:Exception" --from "2026-08-11T08:00:00Z" --to "2026-08-11T09:00:00Z"
```

### Lucene Query Quick Reference
```lucene
source:10.36.88.114              # Filter by Oracle 114
level:3                          # ERROR severity
message:ORA-                     # Oracle errors
log_service:oracle_alert         # Oracle alert log type
source:10.36.88.114 AND level:3  # Combined filter
```

### Syslog Level Reference
| Level | Severity |
|---|---|
| `3` | ERROR |
| `4` | WARN |
| `6` | INFO |
