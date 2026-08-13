---
name: database-oracle-monitoring
description: |
  Oracle Database live performance monitoring, active sessions, locks, high CPU/RAM/IO queries, high cost SQL, long operations, and tablespace usage.
  Use when running SELECT queries, checking active sessions, blocking sessions/locks, slow queries, or storage usage on Oracle Database.

  ❌ DO NOT use for: AWR HTML report files (use database-oracle-awr instead) or Graylog logs (use observability-graylog).
allowed-tools: Bash(python *)
---

# Oracle Database Skill

## 🚨 CRITICAL RULE — Connection Failures & Error Reporting
**If any database query or script returns a connection failure (e.g. `ORA-12170`, `DPY-3010`, `ConnectionRefusedError`, `ORA-01017`):**
1. **STOP IMMEDIATELY.** Do NOT run diagnostic bash loops (do not check `env`, `netstat`, `ss`, `ping`, `curl` endpoints).
2. **DO NOT read or inspect python source code files** (`.py` files like `query_oracle.py`).
3. **Report the exact raw connection error message directly to the user as your final output.**

## ⚡ FAST EXECUTION DIRECTIVES (Zero Redundant Steps)
1. **ALWAYS PRIORITIZE PRE-BUILT SCRIPTS**: Always use pre-built Python scripts in `.claude/skills/database-oracle-monitoring/scripts/` (`monitor_presets.py` or `query_oracle.py`). DO NOT write new temporary `.py` scripts in `/tmp/`.
2. **DO NOT run exploratory bash checks** (`ls /app/.claude/skills/`, `cat SKILL.md`, `env | grep`) or inspect python source files.
3. **Execute immediately in Step 1**:
   - High Cost SQL -> `python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset high_cost`
   - High CPU SQL -> `python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset cpu`
   - Active Sessions -> `python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset active_sessions`
   - Locks / Blocking -> `python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset locks`
   - Tablespaces -> `python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset tablespaces`
   - SQL_ID Full Text & Plan -> `python3 .claude/skills/database-oracle-monitoring/scripts/query_oracle.py --sql-id "<SQL_ID>"`
4. **OUTPUT BUDGET & LAZY EXECUTION PLAN DIRECTIVE**:
   - Limit Top SQL table output to max 3–5 items per response.
   - **Truncate Long SQL Text**: If a SELECT query returns a long SQL statement (>150-200 characters), truncate it in response text (e.g. `SELECT * FROM... (truncated)`). Do not output or feed huge raw SQL blocks into LLM context.
   - **Summary First for Execution Plans**: Do NOT analyze or print massive execution plans by default. Show a summary table of the query (SQL ID, Elapsed Time, CPU Time, Executions, preview text) to the user first.
   - **Perform Deep Plan Analysis ONLY on Demand**: Only fetch and analyze execution plans when the user explicitly asks for execution plan analysis (e.g. "hãy phân tích execution plan câu này").


## Authentication

Credentials are automatically loaded from `.env` environment variables (`ORACLE_DB_HOST`, `ORACLE_DB_PORT`, `ORACLE_DB_USER`, `ORACLE_DB_PASSWORD`, `ORACLE_DB_SERVICE`).



---

## Diagnostic Workflow

```
SELECT PRESET / CUSTOM QUERY → EXECUTE SCRIPT → ANALYZE RESULTS
```

---

## Available Scripts

All scripts are in `.claude/skills/database-oracle-monitoring/scripts/`

### 1. monitor_presets.py - Quick Diagnostic Presets (Slow Queries, CPU, Locks, Storage)
```bash
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset cpu
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset high_cost
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset long_ops
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset physical_io
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset locks
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset active_sessions
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset buffer_gets
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset temp_usage
python3 .claude/skills/database-oracle-monitoring/scripts/monitor_presets.py --preset tablespaces
```

### 2. query_oracle.py - Run Custom SQL Queries & SQL_ID Inspection
```bash
python3 .claude/skills/database-oracle-monitoring/scripts/query_oracle.py --query "SELECT username, status, count(*) FROM gv\$session GROUP BY username, status"
python3 .claude/skills/database-oracle-monitoring/scripts/query_oracle.py --sql-id "<SQL_ID>"
```

---

## Investigation Workflows

### Slow Query / High Load Investigation
```
1. monitor_presets.py --preset active_sessions (find active sessions & wait events)
2. monitor_presets.py --preset cpu (find top CPU-consuming SQLs)
3. monitor_presets.py --preset high_cost (find high optimizer cost / long queries)
4. query_oracle.py --sql-id "<SQL_ID>" (inspect specific SQL_ID details)
```

### Lock Contention & Blocking Sessions
```
1. monitor_presets.py --preset locks (identify blocking sessions and wait events)
```

### Disk I/O & Storage Bottlenecks
```
1. monitor_presets.py --preset physical_io (find high physical read SQLs)
2. monitor_presets.py --preset temp_usage (find sessions heavy on Temp tablespace)
3. monitor_presets.py --preset tablespaces (check % space filled per tablespace)
```

---

## Safety Rules

1. **READ-ONLY GUARANTEE**: Only `SELECT` and `WITH` statements are permitted. Destructive operations (`KILL`, `DROP`, `DELETE`, `UPDATE`, `ALTER SYSTEM KILL SESSION`) are strictly prohibited.
2. **Present Clear Summaries**: Format the query results in markdown tables with key metric columns (`INST_ID`, `SID`, `SERIAL#`, `SQL_ID`, `EVENT`, `SECONDS_IN_WAIT`, `USERNAME`).
