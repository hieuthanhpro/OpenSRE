---
name: database-oracle-awr
description: |
  Oracle AWR (Automatic Workload Repository) HTML report analysis ONLY.
  Use ONLY when the user explicitly mentions: AWR report, AWR file, top SQL by CPU/RAM/I/O,
  SQL execution plan, buffer gets, physical reads, wait events, SGA/PGA advisory, DB bottleneck analysis.

  ❌ DO NOT use for: real-time monitoring, recent logs, "có vấn đề gì không", "5p/15p/1h gần đây",
  "oracle 114 có lỗi không", "xem log oracle", "DB có lỗi không". For those → use observability-graylog.
allowed-tools: Bash(*)
---

# Oracle AWR Report Analysis Skill

> ⚠️ **SKILL ROUTING GUARD** — If the user's question is about **recent logs, recent issues, monitoring, or errors in the last N minutes/hours** (e.g., "oracle 114 có vấn đề gì không?", "5p gần đây DB có lỗi?", "xem log oracle") → **STOP. Do NOT proceed. Use `observability-graylog` skill instead.** This skill is ONLY for parsing AWR HTML report files.

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

**Target file resolution**:
- **Parser**: `.claude/skills/database-oracle-awr/scripts/parse_awr.py`
- **AWR file path**:
  1. **Khi người dùng chọn file/truyền đường dẫn trên prompt** (ví dụ `/app/awr/orcl/<file.html>`): Bắt buộc dùng đúng đường dẫn file đó.
  2. **Khi không có đường dẫn file nào trong prompt**: Tự động tìm và phân tích file báo cáo AWR mới nhất trong thư mục `/app/awr/orcl/` (dùng file trả về từ lệnh `ls -t /app/awr/orcl/*.html | head -n 1`).

Choose the correct command based on what the user is asking (replace `<AWR_FILE>` with the target file path):

| User's question | Command |
|---|---|
| query tốn cpu / top CPU | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric cpu` |
| query tốn RAM / buffer gets / memory | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric ram` |
| query tốn I/O / disk reads / physical reads | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric io` |
| phân tích tổng quan / full report / all | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric all` |
| xem SQL ID cụ thể / full sql text | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --sql-id "<SQL_ID>"` |
| query chạy lâu / elapsed time | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric elapsed` |
| wait events / nghẽn hệ thống | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric wait` |
| SGA PGA advisory / tư vấn RAM | `python3 .claude/skills/database-oracle-awr/scripts/parse_awr.py "<AWR_FILE>" --metric advisory` |

Run **exactly one** command from the table above. Replace `<AWR_FILE>` with the target file path. Do not run any other commands.

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
