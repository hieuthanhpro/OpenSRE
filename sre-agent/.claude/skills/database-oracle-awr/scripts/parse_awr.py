#!/usr/bin/env python3
"""
Oracle AWR Report Parser & Extractor (OpenSRE Skill - Master Tran Van Binh Edition)
-----------------------------------------------------------------------------------
Parses large Oracle AWR HTML reports and extracts targeted SQL & IO metrics:
- System Header & Host CPU / Core ratio
- Top Timed Foreground Wait Events
- Executions = 0 Long-running Query Warnings
- CPU Consumption (SQL ordered by CPU Time)
- RAM / Memory Consumption (SQL ordered by Buffer Gets & Sharable Memory)
- I/O Consumption (SQL ordered by Physical Reads & User I/O Time)
- Tablespace & File I/O Latency (Avg Read/Write ms)
- SGA / PGA Memory Advisory

Usage:
    python parse_awr.py <file.html> [--metric all|cpu|ram|io|elapsed|advisory] [--sql-id <ID>] [--json] [--output <file>]
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class AWRParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.current_table = []
        self.current_row = []
        self.current_cell = []
        self.tables = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.in_table = True
            self.current_table = []
        elif tag == "tr" and self.in_table:
            self.in_row = True
            self.current_row = []
        elif tag in ("td", "th") and self.in_row:
            self.in_cell = True
            self.current_cell = []

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
            if self.current_table:
                self.tables.append(self.current_table)
        elif tag == "tr" and self.in_row:
            self.in_row = False
            if self.current_row:
                self.current_table.append(self.current_row)
        elif tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            cell_text = " ".join("".join(self.current_cell).split())
            self.current_row.append(cell_text)

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell.append(data)


def parse_awr_file(file_path: Path) -> dict:
    """Parse AWR HTML file and extract metric categories."""
    content = file_path.read_text(encoding="utf-8", errors="ignore")
    parser = AWRParser()
    parser.feed(content)

    extracted = {
        "header": {},
        "host": {},
        "top_wait_events": [],
        "sql_elapsed": [],
        "sql_cpu": [],
        "sql_user_io": [],
        "sql_buffer_gets": [],
        "sql_physical_reads": [],
        "sql_sharable_mem": [],
        "sga_advisory": [],
        "pga_advisory": [],
        "tablespace_io": [],
        "sql_texts": {},
    }

    # Extract tables by matching header signatures
    for t in parser.tables:
        if not t:
            continue
        hdr = " ".join(t[0]).lower()

        if "db name" in hdr and len(t) >= 2:
            extracted["header"] = dict(zip(t[0], t[1]))
        elif "host name" in hdr and len(t) >= 2:
            extracted["host"] = dict(zip(t[0], t[1]))
        elif "event" in hdr and ("% db time" in hdr or "%time -outs" in hdr):
            if not extracted["top_wait_events"]:
                extracted["top_wait_events"] = t[:15]
        elif "elapsed time (s)" in hdr and "executions" in hdr and not extracted["sql_elapsed"]:
            extracted["sql_elapsed"] = t[:11]
        elif "cpu time (s)" in hdr and "executions" in hdr and not extracted["sql_cpu"]:
            extracted["sql_cpu"] = t[:11]
        elif "user i/o time (s)" in hdr and "executions" in hdr and not extracted["sql_user_io"]:
            extracted["sql_user_io"] = t[:11]
        elif "buffer gets" in hdr and "executions" in hdr and not extracted["sql_buffer_gets"]:
            extracted["sql_buffer_gets"] = t[:11]
        elif "physical reads" in hdr and "executions" in hdr and not extracted["sql_physical_reads"]:
            extracted["sql_physical_reads"] = t[:11]
        elif "sharable mem (b)" in hdr and not extracted["sql_sharable_mem"]:
            extracted["sql_sharable_mem"] = t[:11]
        elif "sga target size" in hdr and not extracted["sga_advisory"]:
            extracted["sga_advisory"] = t[:10]
        elif "pga target" in hdr and "est physical" in hdr and not extracted["pga_advisory"]:
            extracted["pga_advisory"] = t[:10]
        elif ("tablespace name" in hdr or "file name" in hdr) and ("av rd(ms)" in hdr or "avg tm (ms)" in hdr):
            if not extracted["tablespace_io"]:
                extracted["tablespace_io"] = t[:15]
        elif "sql id" in hdr and "sql text" in hdr:
            for row in t[1:]:
                if len(row) >= 2:
                    extracted["sql_texts"][row[0].strip()] = row[1].strip()

    # If target SQL ID has complete text in a <pre> tag or near the SQL ID anchor in raw HTML, extract it
    # Oracle AWR reports place complete SQL text inside <pre> tags or after anchors named like #sql_id
    for sql_id in list(extracted["sql_texts"].keys()):
        # Find raw blocks matching the sql_id
        pattern = re.compile(rf'<a\s+name="{sql_id}">.*?<pre>(.*?)</pre>', re.DOTALL | re.IGNORECASE)
        m = pattern.search(content)
        if m:
            full_sql = m.group(1).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").strip()
            extracted["sql_texts"][sql_id] = full_sql
        else:
            # Alternative: Search for <pre> block directly following SQL ID string
            alt_pattern = re.compile(rf'sql_id\s*=\s*{sql_id}.*?<pre>(.*?)</pre>', re.DOTALL | re.IGNORECASE)
            m_alt = alt_pattern.search(content)
            if m_alt:
                full_sql = m_alt.group(1).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").strip()
                extracted["sql_texts"][sql_id] = full_sql

    return extracted


def render_table(table_rows: list) -> str:
    """Render a table as Markdown."""
    if not table_rows or len(table_rows) < 2:
        return "_No data extracted_\n"
    lines = []
    lines.append("| " + " | ".join(table_rows[0]) + " |")
    lines.append("| " + " | ".join(["---"] * len(table_rows[0])) + " |")
    for r in table_rows[1:]:
        lines.append("| " + " | ".join(r) + " |")
    return "\n".join(lines) + "\n"


def find_exec_zero_queries(sql_table: list) -> list:
    """Find long-running queries with Executions = 0 (still running during AWR snapshot)."""
    warnings = []
    if not sql_table or len(sql_table) < 2:
        return warnings

    headers = [h.lower() for h in sql_table[0]]
    exec_idx = -1
    for i, h in enumerate(headers):
        if "executions" in h or "execs" in h:
            exec_idx = i
            break

    if exec_idx != -1:
        for row in sql_table[1:]:
            if len(row) > exec_idx and row[exec_idx].strip() in ("0", "0.0"):
                warnings.append(row)
    return warnings


def format_markdown(data: dict, metric_filter: str, target_sql_id: str | None) -> str:
    """Format extracted metrics into Markdown according to Master Tran Van Binh rules."""
    lines = ["# Oracle AWR Performance & SQL Resource Report\n"]
    lines.append("> **Phương pháp phân tích**: Dựa trên quy tắc Trần Văn Bình Master (Tập trung Top 3-5 SQL đứng đầu & Executions=0).\n")

    # 1. System Overview
    if data["header"] or data["host"]:
        lines.append("## 1. System Overview")
        if data["header"]:
            h = data["header"]
            lines.append(f"- **DB Name**: {h.get('DB Name', 'N/A')} | **Instance**: {h.get('Instance', 'N/A')} | **Startup**: {h.get('Startup Time', 'N/A')}")
        if data["host"]:
            hst = data["host"]
            lines.append(f"- **Host**: {hst.get('Host Name', 'N/A')} | **Platform**: {hst.get('Platform', 'N/A')} | **CPUs**: {hst.get('CPUs', 'N/A')} | **Cores**: {hst.get('Cores', 'N/A')}")
        lines.append("")

    # Filter specific SQL ID
    if target_sql_id:
        lines.append(f"## Target SQL ID Analysis: `{target_sql_id}`")
        sql_text = data["sql_texts"].get(target_sql_id, "_SQL Text not found in report summary_")
        lines.append(f"**SQL Text**:\n```sql\n{sql_text}\n```\n")

    # ⚠️ Executions = 0 Long-running Queries Warning
    exec_zero_elapsed = find_exec_zero_queries(data["sql_elapsed"])
    exec_zero_cpu = find_exec_zero_queries(data["sql_cpu"])
    if exec_zero_elapsed or exec_zero_cpu:
        lines.append("## ⚠️ CẢNH BÁO: CÂU LỆNH ĐANG CHẠY DỞ (Executions = 0)")
        lines.append("_Đây là các câu lệnh SQL đang thực thi dở trong lúc lấy mẫu AWR (Elapsed Time rất lớn). **BẮT BUỘC ƯU TIÊN TỐI ƯU ĐẦU TIÊN**._\n")
        if exec_zero_elapsed:
            lines.append(render_table([data["sql_elapsed"][0]] + exec_zero_elapsed))

    # Top Wait Events
    if metric_filter in ("all", "events"):
        lines.append("## 2. Top Foreground Wait Events (Điểm nghẽn hệ thống)")
        lines.append("_Quy tắc: Tập trung xử lý Top 3-5 Wait Events hàng đầu chiếm % DB Time lớn nhất._\n")
        lines.append(render_table(data["top_wait_events"]))

    # Top CPU SQLs
    if metric_filter in ("all", "cpu"):
        lines.append("## 3. Top SQL ordered by CPU Time (Tốn CPU)")
        lines.append("_Quy tắc: Tối ưu 2 câu đầu tiên chiếm % Total lớn nhất._\n")
        lines.append(render_table(data["sql_cpu"]))

    # Top RAM / Memory SQLs
    if metric_filter in ("all", "ram"):
        lines.append("## 4. Top SQL ordered by Buffer Gets & Shared Pool (Tốn RAM)")
        lines.append("### A. SQL ordered by Buffer Gets (Buffer Cache Usage - Tối ưu 2 câu đầu tiên)")
        lines.append(render_table(data["sql_buffer_gets"]))
        if data["sql_sharable_mem"]:
            lines.append("### B. SQL ordered by Sharable Memory (Shared Pool Usage - Tối ưu câu đầu tiên)")
            lines.append(render_table(data["sql_sharable_mem"]))

    # Top I/O SQLs
    if metric_filter in ("all", "io"):
        lines.append("## 5. Top SQL ordered by Physical Reads & User I/O Time (Tốn Disk I/O)")
        lines.append("### A. SQL ordered by Physical Reads (Tối ưu Top 5 câu đầu tiên)")
        lines.append(render_table(data["sql_physical_reads"]))
        if data["sql_user_io"]:
            lines.append("### B. SQL ordered by User I/O Time (Tối ưu 2 câu đầu tiên)")
            lines.append(render_table(data["sql_user_io"]))

    # Top Elapsed Time SQLs
    if metric_filter in ("all", "elapsed"):
        lines.append("## 6. Top SQL ordered by Elapsed Time (Chạy lâu nhất - Tối ưu 2-3 câu đầu tiên)")
        lines.append(render_table(data["sql_elapsed"]))

    # Advisory Section
    if metric_filter in ("all", "advisory"):
        if data["sga_advisory"] or data["pga_advisory"]:
            lines.append("## 7. Memory Advisory (Khuyên dùng cấp phát RAM SGA / PGA)")
            if data["sga_advisory"]:
                lines.append("### SGA Target Advisory")
                lines.append(render_table(data["sga_advisory"]))
            if data["pga_advisory"]:
                lines.append("### PGA Aggregate Target Advisory")
                lines.append(render_table(data["pga_advisory"]))

    # SQL Text Mapping for Top SQL IDs
    if data["sql_texts"] and metric_filter == "all":
        lines.append("## 8. SQL Text Mapping cho các SQL ID tiêu tốn tài nguyên")
        count = 0
        for sql_id, text in list(data["sql_texts"].items())[:10]:
            lines.append(f"- **`{sql_id}`**: `{text[:120]}`")
            count += 1
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Oracle AWR SQL Resource Extractor (Tran Van Binh Rules)")
    parser.add_argument("file", help="Path to AWR HTML report file")
    parser.add_argument("--metric", choices=["all", "cpu", "ram", "io", "elapsed", "advisory"], default="all", help="Filter specific resource category")
    parser.add_argument("--sql-id", help="Search specific SQL ID text and stats")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--output", "-o", help="Save output to file")
    args = parser.parse_args()

    awr_path = Path(args.file)
    if not awr_path.exists():
        print(f"Error: File '{args.file}' not found.", file=sys.stderr)
        sys.exit(1)

    data = parse_awr_file(awr_path)

    if args.json:
        out = json.dumps(data, indent=2, ensure_ascii=False)
    else:
        out = format_markdown(data, args.metric, args.sql_id)

    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
        print(f"Extraction saved to {args.output}")
    else:
        print(out)


if __name__ == "__main__":
    main()
