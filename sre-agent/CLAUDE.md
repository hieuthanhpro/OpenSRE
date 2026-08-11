# OpenSRE SRE Agent — Project Routing Rules

## ⚡ Skill Routing (CRITICAL — Read First)

### Oracle DB Monitoring → observability-graylog
When user asks about **recent Oracle DB issues, errors, or logs**:
- "oracle 114 có vấn đề gì không?"
- "xem log oracle 114 5 phút gần đây"
- "DB có lỗi không?"
- "oracle [số] gần đây có gì bất thường?"
- Any question with time range (5m, 15m, 1h) + oracle/DB

→ **ALWAYS use `observability-graylog` skill. NEVER use sqlplus, tnsping, or AWR.**
→ Oracle DB logs are in Graylog `Database Log stream`
→ Query by `source:10.36.88.114` where last octet = oracle number (oracle 114 = source:10.36.88.114)

### Oracle AWR → database-oracle-awr
ONLY when user explicitly mentions: AWR report, AWR file, parse_awr, top SQL CPU/RAM/IO, wait events.

### Naming Convention
- Oracle at IP `10.36.88.114` = **oracle 114** → Graylog query: `source:10.36.88.114`
- Oracle at IP `10.36.88.XXX` = **oracle XXX** → Graylog query: `source:10.36.88.XXX`

### Graylog Query Rules
- Stream: `Database Log stream`
- Keep `--limit` low: max 20–50 entries per query
- Default AWR file (if unspecified): newest `.html` in `/app/awr/orcl/`
