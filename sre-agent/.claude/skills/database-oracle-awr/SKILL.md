---
name: database-oracle-awr
description: Oracle AWR (Automatic Workload Repository) report analysis. Use when analyzing Oracle Database performance, listing top SQL queries consuming CPU, RAM, or Disk I/O, or investigating Oracle DB bottlenecks and AWR reports.
allowed-tools: Bash(*)
---

# Oracle AWR Report Analysis Skill

## Workflow

Follow these steps IN ORDER. Do NOT skip steps. Do NOT add extra steps.

### Step 1: Check Memory for Past Analysis

Before running any parser command, search memory for previous AWR analyses:

```bash
python .claude/skills/memory-search/scripts/search.py \
  --query "AWR Oracle CPU SQL performance orcl" --limit 3
```

If memory returns a **resolved** episode with matching SQL IDs or metrics that answer the user's question → **use that data to answer directly. STOP HERE. Do not proceed to Step 2.**

If memory returns no relevant hits or the data is stale → proceed to Step 2.

### Step 2: Run the Parser Script (ONE command only)

**Fixed paths** (do not search for these — they are always correct):
- **Parser**: `.claude/skills/database-oracle-awr/scripts/parse_awr.py`
- **AWR file**: `/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html`

Choose the correct command based on what the user is asking:

| User's question | Command |
|---|---|
| query tốn cpu / top CPU | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric cpu` |
| query tốn RAM / buffer gets / memory | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric ram` |
| query tốn I/O / disk reads / physical reads | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric io` |
| phân tích tổng quan / full report / all | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric all` |
| xem SQL ID cụ thể / full sql text | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --sql-id "<SQL_ID>"` |
| query chạy lâu / elapsed time | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric elapsed` |
| wait events / nghẽn hệ thống | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric wait` |
| SGA PGA advisory / tư vấn RAM | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric advisory` |

Run **exactly one** command from the table above. Do not run any other commands (`ls`, `find`, `grep`, `sed`, `awk`, `cat`, or inline Python).

### Step 3: Present Results and STOP

After the parser output is displayed:

1. **Strict Output Scoping (CRITICAL)**: 
   - **ONLY show the results of the requested metric.** 
   - If the user asks for CPU (e.g., "query tốn cpu", "top cpu"), **ONLY** show the Top CPU queries table. **NEVER** include Top RAM (Buffer Gets), Top I/O, or any other tables/summaries in your final response.
   - If the user asks for RAM/Memory, **ONLY** show the RAM table.
   - If the user asks for I/O, **ONLY** show the I/O table.
2. **Format your answer** using the parser output directly. Present the data in a clear markdown table.
3. **STOP**. Do NOT run additional commands to "get more details", "verify", or "check further".

If the user asks a follow-up question later, go back to Step 1.

---

## Analysis Rules (Master Trần Văn Bình Method)

When presenting results, apply these rules to highlight what matters within the requested metric scope:

- **Executions = 0**: ALWAYS flag first (if present in the metric output). These are long-running queries stuck during the snapshot — highest priority to investigate.
- **CPU**: Focus on top 2 queries with highest `% Total CPU`.
- **RAM (Buffer Gets)**: Focus on top 2 queries.
- **RAM (Sharable Memory)**: Focus on top 1 query.
- **Disk I/O (Physical Reads)**: Focus on top 5 queries.
- **User I/O Time**: Focus on top 2 queries.
- **Elapsed Time**: Focus on top 2-3 queries.

**Strict scoping**: If user asks for CPU → ONLY show CPU results. Do NOT add RAM or I/O sections unless asked.

---

## Prohibited Actions

These actions waste tokens and produce errors. NEVER do them:

- ❌ Running `ls`, `find`, `which`, `locate` to search for files
- ❌ Using `grep`, `sed`, `awk`, `cat`, `head`, `tail` on the AWR HTML file
- ❌ Writing inline Python to parse HTML
- ❌ Running the parser script more than once per question
- ❌ Running additional commands after getting the parser output
- ❌ Checking `sqlplus`, `ps aux`, or other system commands

---

## DB Context (pre-loaded — do NOT run commands to get this)

- **DB**: ORCL | **Instance**: orcl | **Version**: 11.2.0.1.0
- **Host**: db.onepay.vn | **Platform**: Linux x86 64-bit
- **CPUs**: 16 | **Cores**: 16 | **Memory**: 62.92 GB
- **Snap**: 125190 → 125191 | 21-Jul-26 22:00 → 23:00 (60 mins)
- **DB Time**: 112.71 mins (~1.87x elapsed → moderate load)
