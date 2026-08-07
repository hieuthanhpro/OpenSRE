---
name: database-oracle-awr
description: Oracle AWR (Automatic Workload Repository) report analysis. Use when analyzing Oracle Database performance, listing top SQL queries consuming CPU, RAM, or Disk I/O, or investigating Oracle DB bottlenecks and AWR reports.
allowed-tools: Bash(*)
---

# Oracle AWR Report Analysis Skill

## ⚠️ MANDATORY FILE DISCOVERY RULES

> [!IMPORTANT]
> **CRITICAL RULE**: NEVER attempt to read or list dummy paths like `/path/to/awr/file`.
> Always use real file paths from `/app/awr/orcl/` or `/app/awr/`.
> 
> When analyzing Oracle DB performance:
> 1. Run `ls -la /app/awr/orcl/ /app/awr/` to find the actual AWR HTML report file.
> 2. Execute the parser script directly on the found file:
>    `python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric cpu`

---

## Overview

Oracle AWR (Automatic Workload Repository) reports are typically very large (10,000+ lines of HTML).
**NEVER load raw AWR HTML files directly into your prompt context.**

Always run the `parse_awr.py` script to extract structured, high-density performance metrics filtered by resource type (CPU, RAM, I/O, Elapsed Time).

---

## MANDATORY: Statistics-First Investigation Workflow

```
1. DISCOVER REAL FILE IN /app/awr/orcl/ → 2. RUN PARSER SCRIPT → 3. IDENTIFY BOTTLENECK → 4. REMEDIATE
```

### Step 1: Run the AWR Parser Script

Depending on what the user is asking, run the appropriate script command:

#### A. Top SQL Consuming CPU
```bash
python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric cpu
```

#### B. Top SQL Consuming RAM / Memory (Buffer Gets & Shared Pool)
```bash
python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric ram
```

#### C. Top SQL Consuming Disk I/O (Physical Reads & User I/O Time)
```bash
python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric io
```

#### D. Full Performance & Resource Breakdown
```bash
python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --metric all
```

#### E. Inspect Specific SQL_ID Code
```bash
python .claude/skills/database-oracle-awr/scripts/parse_awr.py "/app/awr/orcl/AWR Rpt - orcl Snap 125190 thru 125191.html" --sql-id "<SQL_ID>"
```

---

## Resource Bottleneck Mapping Guide (Master Tran Van Binh Rules)

### 1. ⚠️ Executions = 0 Queries (Highest Priority)
- If a query has `Executions = 0` (or 1) with high `Elapsed Time`, it is a **long-running query currently executing during the snapshot**.
- **ACTION**: Always highlight this query at the top of your report as the primary bottleneck to optimize first.

### 2. CPU Consumption (`--metric cpu`)
- **Key Tables**: `SQL ordered by CPU Time`
- **Rule**: Focus on the top 2 queries accounting for the highest `% Total CPU`.

### 3. RAM / Memory Consumption (`--metric ram`)
- **Key Tables**: `SQL ordered by Buffer Gets` (Buffer Cache) & `SQL ordered by Sharable Memory` (Shared Pool)
- **Rule**: Focus on top 2 queries for Buffer Gets, top 1 query for Sharable Memory.

### 4. Disk I/O Consumption (`--metric io`)
- **Key Tables**: `SQL ordered by Physical Reads` & `SQL ordered by User I/O Time`
- **Rule**: Focus on top 5 queries for Physical Reads, top 2 queries for User I/O Time.

---

## Output Report Structure

When presenting findings to the user, format your report clearly:

```markdown
## Oracle AWR Performance Analysis (Oracle DB: orcl)

### 1. System Overview
- **DB Name & Host**: [Details]
- **Target Metric**: [CPU / RAM / I/O / All]

### 2. ⚠️ High-Priority Warning (Executions = 0 Queries)
[Details of long-running queries currently stuck or executing]

### 3. Top Offending SQL Statements
| SQL ID | Resource Metric (CPU/IO/RAM) | Executions | Avg Value per Exec | SQL Text Preview |
|---|---|---|---|---|
| `[SQL_ID]` | [Value] | [Execs] | [Avg] | [SQL Text] |

### 4. Root Cause & Recommended Remediations
1. **Index Optimization**: [Specific table/column index recommendations]
2. **Memory / Database Config**: [SGA/PGA/Shared Pool adjustments]
3. **Application SQL Rewrite**: [Bind variables, query restructuring]
```
