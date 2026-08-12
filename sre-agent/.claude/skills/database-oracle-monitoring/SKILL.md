---
name: database-oracle-monitoring
description: |
  Oracle Database live performance monitoring, active sessions, locks, high CPU/RAM/IO queries, high cost SQL, long operations, and tablespace usage.
  Use when running SELECT queries, checking active sessions, blocking sessions/locks, slow queries, or storage usage on Oracle Database.

  ❌ DO NOT use for: AWR HTML report files (use database-oracle-awr instead) or Graylog logs (use observability-graylog).
allowed-tools: Bash(python *)
---

# Oracle Database Skill

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
