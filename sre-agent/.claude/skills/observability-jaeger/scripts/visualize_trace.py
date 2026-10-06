#!/usr/bin/env python3
"""Visualize Jaeger Distributed Traces as Interactive Node-based Topology Graphs & Timeline.

Generates:
1. Interactive HTML (default): Service topology graph with clickable edges/nodes and Gantt timeline.
2. Mermaid diagram (--mode mermaid): Text-based flowchart for terminal/markdown.
3. JSON output (--mode json): Structured topology & timeline data.
"""

import argparse
import html
import json
import os
import sys
import webbrowser
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

# Import jaeger client helpers from same directory
try:
    from jaeger_client import extract_span_info, format_duration, get_trace
except ImportError:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, script_dir)
    from jaeger_client import extract_span_info, format_duration, get_trace

# Operations considered internal utility noise to filter out from high-level topology
NOISE_OPERATIONS = {
    "Date.create",
    "Calendar.getInstance",
    "UUID.randomUUID",
    "UUID.fromString",
    "Date.getTime",
    "Instant.now",
    "System.currentTimeMillis",
}


def is_database_span(span_info: Dict[str, Any]) -> bool:
    """Check if a span represents a database query/call."""
    tags = span_info.get("tags", {})
    op = span_info.get("operation", "")

    if "db.statement" in tags or "db.system" in tags or "db.name" in tags or "db.type" in tags:
        return True

    op_upper = op.strip().upper()
    db_verbs = ("SELECT", "CALL", "INSERT", "UPDATE", "DELETE", "EXEC", "EXECUTE", "BEGIN", "COMMIT")
    if any(op_upper.startswith(verb) for verb in db_verbs):
        return True

    return False


def build_trace_analysis(trace: Dict[str, Any]) -> Dict[str, Any]:
    """Parse raw Jaeger trace and build service topology, edges, DB summaries, and timeline."""
    spans = trace.get("spans", [])
    processes = trace.get("processes", {})

    if not spans:
        raise ValueError("Trace contains no spans")

    # Map span_id -> span_info
    span_map: Dict[str, Dict[str, Any]] = {}
    for span in spans:
        info = extract_span_info(span, processes)
        info["raw_span"] = span
        info["parent_id"] = None
        info["child_ids"] = []
        for ref in span.get("references", []):
            if ref.get("refType") == "CHILD_OF":
                info["parent_id"] = ref.get("spanID")
                break
        span_map[info["span_id"]] = info

    # Populate children references
    for span_id, info in span_map.items():
        parent_id = info["parent_id"]
        if parent_id and parent_id in span_map:
            span_map[parent_id]["child_ids"].append(span_id)

    # Calculate global trace start and end
    root_span = min(spans, key=lambda s: s.get("startTime", float("inf")))
    trace_start_us = root_span.get("startTime", 0)
    trace_end_us = max(s.get("startTime", 0) + s.get("duration", 0) for s in spans)
    total_trace_duration_us = max(trace_end_us - trace_start_us, 1)

    start_dt = datetime.fromtimestamp(trace_start_us / 1_000_000, tz=timezone.utc)
    time_iso = start_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

    # Group spans by service
    service_spans: Dict[str, List[Dict[str, Any]]] = {}
    service_db_calls: Dict[str, List[Dict[str, Any]]] = {}
    service_servers: Dict[str, Set[str]] = {}
    service_errors: Dict[str, List[Dict[str, Any]]] = {}

    def extract_error_detail(info: Dict[str, Any]) -> Dict[str, Any]:
        tags = info.get("tags", {})
        logs = info.get("logs", [])

        status_code = str(
            tags.get("http.response.status_code")
            or tags.get("http.status_code")
            or tags.get("error.type")
            or tags.get("rpc.grpc.status_code")
            or ""
        )

        method = str(tags.get("http.request.method") or tags.get("http.method") or info.get("operation") or "HTTP")
        full_url = str(tags.get("url.full") or tags.get("http.url") or "")
        endpoint = str(tags.get("http.route") or tags.get("url.path") or "")
        if not endpoint and full_url:
            try:
                from urllib.parse import urlparse
                u = urlparse(full_url)
                endpoint = u.path or full_url
            except Exception:
                endpoint = full_url
        if not endpoint:
            endpoint = info.get("operation", "")

        error_msg = ""
        error_details = ""
        stack_trace = str(tags.get("exception.stacktrace") or tags.get("exception.stack") or "")

        # 1. Response body inspection
        resp_body = str(tags.get("http.response.body") or "")
        if resp_body:
            try:
                parsed = json.loads(resp_body)
                if isinstance(parsed, dict):
                    title = parsed.get("title") or parsed.get("name") or parsed.get("error") or parsed.get("code") or ""
                    msg = parsed.get("message") or parsed.get("description") or parsed.get("detail") or ""
                    det = parsed.get("details") or parsed.get("errors") or parsed.get("information_link") or ""
                    if title or msg:
                        error_msg = " - ".join(filter(None, [str(title), str(msg)]))
                    if det:
                        error_details = det if isinstance(det, str) else json.dumps(det)
            except Exception:
                if len(resp_body) < 300 and not resp_body.strip().startswith("<"):
                    error_msg = resp_body

        # 2. Tags
        if not error_msg:
            error_msg = str(
                tags.get("error.message")
                or tags.get("message")
                or tags.get("exception.message")
                or tags.get("status.message")
                or ""
            )

        # 3. Logs
        for log_item in logs:
            for f in log_item.get("fields", []):
                k = f.get("key")
                v = f.get("value")
                if k in ("message", "error.message", "exception.message") and not error_msg:
                    error_msg = str(v)
                if k in ("stack", "exception.stacktrace") and not stack_trace:
                    stack_trace = str(v)
                if k in ("error.kind", "error.type") and not error_details:
                    error_details = f"Type: {v}"

        # 4. Status map
        if not error_msg and status_code:
            status_map = {
                "400": "Bad Request (400)",
                "401": "Unauthorized (401)",
                "403": "Forbidden (403)",
                "404": "Not Found (404)",
                "405": "Method Not Allowed (405)",
                "408": "Request Timeout (408)",
                "409": "Conflict (409)",
                "422": "Unprocessable Entity (422)",
                "429": "Too Many Requests (429)",
                "500": "Internal Server Error (500)",
                "502": "Bad Gateway (502)",
                "503": "Service Unavailable (503)",
                "504": "Gateway Timeout (504)",
            }
            error_msg = status_map.get(status_code, f"HTTP Error {status_code}")

        if not error_msg:
            error_msg = "Operation failed with ERROR status" if tags.get("otel.status_code") == "ERROR" else "Unknown Error"

        return {
            "span_id": info.get("span_id", ""),
            "operation": info.get("operation", ""),
            "service": info.get("service", ""),
            "method": method,
            "endpoint": endpoint,
            "full_url": full_url,
            "status_code": status_code,
            "error_type": str(tags.get("error.type") or tags.get("exception.type") or ""),
            "message": error_msg,
            "details": error_details,
            "request_body": str(tags.get("http.request.body") or ""),
            "response_body": resp_body,
            "request_headers": str(tags.get("http.request.headers") or ""),
            "response_headers": str(tags.get("http.response.headers") or ""),
            "stack_trace": stack_trace,
            "duration_us": info.get("duration_us", 0),
            "duration_str": info.get("duration", ""),
        }

    for sid, info in span_map.items():
        svc = info["service"]
        service_spans.setdefault(svc, []).append(info)

        # Track servers/IPs
        tags = info.get("tags", {})
        for s_tag in ("server.address", "network.peer.address", "client.address", "peer.hostname"):
            if s_tag in tags and str(tags[s_tag]).strip():
                service_servers.setdefault(svc, set()).add(str(tags[s_tag]))

        # Track errors
        if info.get("has_error"):
            service_errors.setdefault(svc, []).append(extract_error_detail(info))

        # Check DB calls
        if is_database_span(info):
            service_db_calls.setdefault(svc, []).append(info)

    # Find inter-service calls (Edges)
    edges: List[Dict[str, Any]] = []
    edge_counter = 0

    # 1. Entry call (Client -> Root Service)
    root_info = span_map[root_span.get("spanID")]
    root_tags = root_info.get("tags", {})
    client_ip = root_tags.get("client.address") or root_tags.get("network.peer.address") or "Client"
    client_node_id = "client_entry"
    client_node_label = f"👤 Client\n{client_ip}" if client_ip != "Client" else "👤 Client"

    edge_counter += 1
    edges.append({
        "id": f"edge_{edge_counter}",
        "from": client_node_id,
        "from_label": client_node_label,
        "to": root_info["service"],
        "to_label": root_info["service"],
        "method": str(root_tags.get("http.request.method") or root_tags.get("http.method") or "REQ"),
        "endpoint": str(root_tags.get("http.route") or root_tags.get("url.path") or root_tags.get("http.url") or root_info["operation"]),
        "full_url": str(root_tags.get("url.full") or root_tags.get("http.url") or ""),
        "duration_us": root_info["duration_us"],
        "duration_str": root_info["duration"],
        "status_code": str(root_tags.get("http.response.status_code") or root_tags.get("http.status_code") or (500 if root_info["has_error"] else 200)),
        "has_error": root_info["has_error"],
        "server_address": str(root_tags.get("server.address") or root_tags.get("network.peer.address") or "N/A"),
        "server_port": str(root_tags.get("server.port") or root_tags.get("network.peer.port") or ""),
        "request_headers": root_tags.get("http.request.headers") or "",
        "response_headers": root_tags.get("http.response.headers") or "",
        "request_body": root_tags.get("http.request.body") or "",
        "response_body": root_tags.get("http.response.body") or "",
        "span_id": root_info["span_id"],
        "breakdown": [],
    })

    # Helper to calculate response time breakdown inside a span
    def compute_span_breakdown(span_id: str) -> List[Dict[str, Any]]:
        breakdown = []
        info = span_map.get(span_id)
        if not info:
            return breakdown
        parent_svc = info["service"]

        # Traverse descendants to find DB queries and outgoing calls
        stack = list(info.get("child_ids", []))
        visited = set()
        while stack:
            cid = stack.pop()
            if cid in visited:
                continue
            visited.add(cid)
            cinfo = span_map.get(cid)
            if not cinfo:
                continue

            cop = cinfo["operation"]
            if cop in NOISE_OPERATIONS:
                continue

            if is_database_span(cinfo):
                stmt = cinfo["tags"].get("db.statement") or cop
                breakdown.append({
                    "name": cop,
                    "detail": stmt[:100],
                    "type": "database",
                    "duration_us": cinfo["duration_us"],
                    "duration_str": cinfo["duration"],
                })
            elif cinfo["service"] != parent_svc:
                # Downstream call
                m = cinfo["tags"].get("http.request.method") or cinfo["tags"].get("http.method") or "HTTP"
                breakdown.append({
                    "name": f"→ {cinfo['service']}",
                    "detail": f"{m} {cop}",
                    "type": "downstream",
                    "duration_us": cinfo["duration_us"],
                    "duration_str": cinfo["duration"],
                })
                # Don't recurse into child service for breakdown of this call
                continue
            else:
                # Same service internal span, keep descending
                stack.extend(cinfo.get("child_ids", []))

        # Sort breakdown by duration desc
        breakdown.sort(key=lambda x: x["duration_us"], reverse=True)
        return breakdown[:8]

    edges[0]["breakdown"] = compute_span_breakdown(root_info["span_id"])

    # 2. Inter-service spans
    for sid, info in span_map.items():
        if sid == root_info["span_id"]:
            continue

        parent_id = info.get("parent_id")
        if not parent_id or parent_id not in span_map:
            continue

        parent = span_map[parent_id]
        if parent["service"] == info["service"]:
            continue

        # Skip noise spans
        if info["operation"] in NOISE_OPERATIONS:
            continue

        # Skip DB spans as graph edges (DBs are aggregated inside service nodes)
        if is_database_span(info):
            continue

        tags = info.get("tags", {})
        p_tags = parent.get("tags", {})

        method = str(
            tags.get("http.request.method")
            or tags.get("http.method")
            or p_tags.get("http.request.method")
            or p_tags.get("http.method")
            or "CALL"
        )
        endpoint = str(
            tags.get("http.route")
            or tags.get("url.path")
            or tags.get("http.url")
            or info["operation"]
        )
        full_url = str(tags.get("url.full") or tags.get("http.url") or p_tags.get("url.full") or "")
        status = str(
            tags.get("http.response.status_code")
            or tags.get("http.status_code")
            or p_tags.get("http.response.status_code")
            or p_tags.get("http.status_code")
            or ("500" if (info["has_error"] or parent["has_error"]) else "200")
        )
        has_err = info["has_error"] or parent["has_error"] or (status.isdigit() and int(status) >= 400)

        server_addr = str(
            tags.get("server.address")
            or tags.get("network.peer.address")
            or p_tags.get("server.address")
            or p_tags.get("network.peer.address")
            or "Internal"
        )
        server_port = str(
            tags.get("server.port")
            or tags.get("network.peer.port")
            or p_tags.get("server.port")
            or p_tags.get("network.peer.port")
            or ""
        )

        edge_counter += 1
        edges.append({
            "id": f"edge_{edge_counter}",
            "from": parent["service"],
            "from_label": parent["service"],
            "to": info["service"],
            "to_label": info["service"],
            "method": method,
            "endpoint": endpoint,
            "full_url": full_url,
            "duration_us": info["duration_us"],
            "duration_str": info["duration"],
            "status_code": status,
            "has_error": has_err,
            "server_address": server_addr,
            "server_port": server_port,
            "request_headers": tags.get("http.request.headers") or p_tags.get("http.request.headers") or "",
            "response_headers": tags.get("http.response.headers") or p_tags.get("http.response.headers") or "",
            "request_body": tags.get("http.request.body") or p_tags.get("http.request.body") or "",
            "response_body": tags.get("http.response.body") or p_tags.get("http.response.body") or "",
            "span_id": sid,
            "breakdown": compute_span_breakdown(sid),
        })

    # Build Service Nodes data
    services_data: Dict[str, Dict[str, Any]] = {}
    for svc, s_list in service_spans.items():
        total_time_us = sum(s["duration_us"] for s in s_list if s["operation"] not in NOISE_OPERATIONS)
        # Max span duration in service
        max_span_us = max(s["duration_us"] for s in s_list)
        err_count = sum(1 for s in s_list if s["has_error"])

        db_calls = service_db_calls.get(svc, [])
        db_count = len(db_calls)
        total_db_time_us = sum(d["duration_us"] for d in db_calls)
        slowest_db = None
        if db_calls:
            s_db = max(db_calls, key=lambda x: x["duration_us"])
            slowest_db = {
                "operation": s_db["operation"],
                "duration_us": s_db["duration_us"],
                "duration_str": s_db["duration"],
                "statement": s_db.get("tags", {}).get("db.statement") or s_db["operation"],
                "db_system": s_db.get("tags", {}).get("db.system", "DB"),
            }

        # Format DB list for modal
        formatted_db_calls = []
        for d in sorted(db_calls, key=lambda x: x["duration_us"], reverse=True):
            formatted_db_calls.append({
                "operation": d["operation"],
                "duration_us": d["duration_us"],
                "duration_str": d["duration"],
                "statement": d.get("tags", {}).get("db.statement") or d["operation"],
                "db_system": d.get("tags", {}).get("db.system", "DB"),
                "span_id": d["span_id"],
            })

        # Outgoing calls from this service
        outgoing = [e for e in edges if e["from"] == svc]

        services_data[svc] = {
            "name": svc,
            "span_count": len(s_list),
            "max_duration_us": max_span_us,
            "max_duration_str": format_duration(max_span_us),
            "total_time_us": total_time_us,
            "total_time_str": format_duration(total_time_us),
            "has_error": err_count > 0,
            "error_count": err_count,
            "errors": service_errors.get(svc, []),
            "servers": list(service_servers.get(svc, [])),
            "db_summary": {
                "count": db_count,
                "total_duration_us": total_db_time_us,
                "total_duration_str": format_duration(total_db_time_us),
                "slowest": slowest_db,
                "calls": formatted_db_calls,
            },
            "outgoing_count": len(outgoing),
        }

    # Build Timeline Items (Gantt)
    timeline_items: List[Dict[str, Any]] = []

    # Sort spans by startTime
    sorted_spans = sorted(
        [s for s in span_map.values() if s["operation"] not in NOISE_OPERATIONS],
        key=lambda s: s["start_time"],
    )

    # Keep track of DB calls added to timeline: ONLY 1 representative DB call per service (the slowest)
    db_services_rendered: Set[str] = set()

    for s in sorted_spans:
        is_db = is_database_span(s)
        svc = s["service"]

        if is_db:
            # Only render the slowest DB call for this service
            if svc in db_services_rendered:
                continue
            slowest_db = services_data.get(svc, {}).get("db_summary", {}).get("slowest")
            if not slowest_db or s["operation"] != slowest_db["operation"]:
                continue
            db_services_rendered.add(svc)

        start_offset_us = s["start_time"] - trace_start_us
        start_pct = max(0.0, min(100.0, (start_offset_us / total_trace_duration_us) * 100.0))
        width_pct = max(0.6, min(100.0 - start_pct, (s["duration_us"] / total_trace_duration_us) * 100.0))

        # Associate with edge if matching
        matched_edge_id = None
        for e in edges:
            if e["span_id"] == s["span_id"]:
                matched_edge_id = e["id"]
                break

        timeline_items.append({
            "span_id": s["span_id"],
            "service": svc,
            "operation": s["operation"],
            "type": "database" if is_db else "service",
            "is_db": is_db,
            "start_pct": round(start_pct, 2),
            "width_pct": round(width_pct, 2),
            "start_offset_str": f"+{format_duration(start_offset_us)}",
            "duration_str": s["duration"],
            "duration_us": s["duration_us"],
            "has_error": s["has_error"],
            "edge_id": matched_edge_id,
        })

    return {
        "trace_id": trace.get("traceID", root_span.get("traceID", "")),
        "start_time_iso": time_iso,
        "total_duration_us": total_trace_duration_us,
        "total_duration_str": format_duration(total_trace_duration_us),
        "span_count": len(spans),
        "client_node": {
            "id": client_node_id,
            "label": client_node_label,
            "ip": client_ip,
        },
        "services": services_data,
        "edges": edges,
        "timeline": timeline_items,
    }


def generate_mermaid(analysis: Dict[str, Any]) -> str:
    """Generate Mermaid flowchart markdown from trace analysis."""
    lines = ["```mermaid", "graph TD"]

    client = analysis["client_node"]
    lines.append(f'    {client["id"]}["{client["label"]}"]')

    # Service nodes
    for svc_name, svc in analysis["services"].items():
        dur = svc["max_duration_str"]
        db_badge = f"<br/>🗄️ {svc['db_summary']['count']} DB calls" if svc["db_summary"]["count"] > 0 else ""
        err_badge = " ❌" if svc["has_error"] else ""
        node_id = svc_name.replace("-", "_").replace(".", "_")
        lines.append(f'    {node_id}["{svc_name}{err_badge}<br/>⏱ {dur}{db_badge}"]')

    lines.append("")

    # Edges
    for edge in analysis["edges"]:
        from_id = edge["from"].replace("-", "_").replace(".", "_")
        to_id = edge["to"].replace("-", "_").replace(".", "_")
        method = edge["method"]
        endpoint = edge["endpoint"]
        if len(endpoint) > 28:
            endpoint = endpoint[:25] + ".."
        dur = edge["duration_str"]
        err_icon = " ❌" if edge["has_error"] else ""
        label = f"{method} {endpoint}{err_icon}<br/>{dur}"
        lines.append(f'    {from_id} -->|"{label}"| {to_id}')

    lines.append("")

    # Error styles
    for svc_name, svc in analysis["services"].items():
        if svc["has_error"]:
            node_id = svc_name.replace("-", "_").replace(".", "_")
            lines.append(f"    style {node_id} fill:#ef4444,stroke:#dc2626,color:#ffffff")

    lines.append("```")
    return "\n".join(lines)


def generate_html(analysis: Dict[str, Any]) -> str:
    """Generate self-contained interactive HTML visualization with service topology and timeline."""
    data_json = json.dumps(analysis)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trace Visualization - {analysis['trace_id']}</title>
  <!-- Load Dagre layout engine with fallback -->
  <script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
  <style>
    :root {{
      --bg: #0b0f19;
      --surface: #111827;
      --surface-hover: #1f2937;
      --border: #374151;
      --border-focus: #38bdf8;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --accent-blue: #38bdf8;
      --accent-green: #34d399;
      --accent-amber: #fbbf24;
      --accent-red: #f87171;
      --accent-purple: #c084fc;
      --card-client: #1e1b4b;
      --card-service: #1e293b;
      --card-error: #450a0a;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }}

    /* Header Bar */
    header {{
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 10;
      flex-shrink: 0;
    }}

    .header-left {{
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }}

    .logo-badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #0284c7;
      color: #fff;
      font-weight: 700;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}

    .trace-title {{
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      font-family: monospace;
    }}

    .stat-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 3px 10px;
      font-size: 12px;
      color: var(--text-muted);
    }}

    .stat-pill strong {{
      color: var(--text);
    }}

    .stat-pill.error {{
      border-color: var(--accent-red);
      background: rgba(248, 113, 113, 0.1);
      color: var(--accent-red);
    }}

    .header-right {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .btn {{
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }}

    .btn:hover {{
      background: rgba(255, 255, 255, 0.16);
      border-color: var(--accent-blue);
    }}

    /* Main Container */
    .main-container {{
      flex: 1;
      display: flex;
      position: relative;
      overflow: hidden;
    }}

    /* Center Content Area (Graph + Timeline) */
    .center-pane {{
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }}

    /* Graph Canvas Area */
    .graph-viewport {{
      flex: 1;
      position: relative;
      background: radial-gradient(circle at 50% 50%, #172133 0%, #0b0f19 100%);
      overflow: hidden;
      cursor: grab;
    }}

    .graph-viewport:active {{
      cursor: grabbing;
    }}

    svg#graph-canvas {{
      width: 100%;
      height: 100%;
      user-select: none;
    }}

    /* Controls Overlay */
    .graph-controls {{
      position: absolute;
      top: 14px;
      left: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 5;
    }}

    .icon-btn {{
      width: 32px;
      height: 32px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      transition: 0.15s;
    }}

    .icon-btn:hover {{
      background: var(--border);
      color: var(--accent-blue);
    }}

    .hint-chip {{
      position: absolute;
      top: 14px;
      right: 14px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-muted);
      pointer-events: none;
      z-index: 5;
    }}

    /* Timeline Area */
    .timeline-pane {{
      height: 230px;
      background: var(--surface);
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 5;
    }}

    .timeline-header {{
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }}

    .timeline-ruler {{
      display: flex;
      justify-content: space-between;
      padding: 4px 16px 4px 200px;
      font-size: 10px;
      color: var(--text-muted);
      border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
      position: relative;
    }}

    .timeline-scroll {{
      flex: 1;
      overflow-y: auto;
      padding: 6px 16px;
    }}

    .timeline-row {{
      display: flex;
      align-items: center;
      height: 26px;
      border-radius: 4px;
      transition: background 0.15s;
      cursor: pointer;
    }}

    .timeline-row:hover {{
      background: rgba(255, 255, 255, 0.05);
    }}

    .timeline-label {{
      width: 190px;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 6px;
      padding-right: 10px;
      flex-shrink: 0;
    }}

    .timeline-label.db-label {{
      padding-left: 18px;
      color: var(--accent-amber);
    }}

    .timeline-track {{
      flex: 1;
      height: 100%;
      position: relative;
      display: flex;
      align-items: center;
    }}

    .timeline-bar {{
      position: absolute;
      height: 14px;
      border-radius: 3px;
      background: #3b82f6;
      display: flex;
      align-items: center;
      padding: 0 4px;
      font-size: 10px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: filter 0.15s, transform 0.1s;
    }}

    .timeline-bar:hover {{
      filter: brightness(1.25);
      transform: scaleY(1.15);
      z-index: 10;
    }}

    .timeline-bar.db {{
      background: #d97706;
      border: 1px solid #f59e0b;
    }}

    .timeline-bar.error {{
      background: #dc2626;
      border: 1px solid #ef4444;
    }}

    /* Tooltip */
    #tooltip {{
      position: fixed;
      display: none;
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      z-index: 1000;
      max-width: 320px;
    }}

    /* Slide-out Inspector Drawer */
    .drawer {{
      width: 440px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 20;
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.6);
    }}

    .drawer.open {{
      transform: translateX(0);
    }}

    .drawer-header {{
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.2);
    }}

    .drawer-title {{
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .drawer-body {{
      flex: 1;
      overflow-y: auto;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }}

    .section-card {{
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}

    .section-title {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      color: var(--text-muted);
    }}

    .key-value-grid {{
      display: grid;
      grid-template-columns: 110px 1fr;
      row-gap: 8px;
      font-size: 12px;
    }}

    .key-value-grid .key {{
      color: var(--text-muted);
    }}

    .key-value-grid .val {{
      color: var(--text);
      word-break: break-all;
      font-family: monospace;
    }}

    .badge {{
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      font-family: monospace;
    }}

    .badge-get {{ background: #0369a1; color: #fff; }}
    .badge-post {{ background: #15803d; color: #fff; }}
    .badge-patch {{ background: #b45309; color: #fff; }}
    .badge-delete {{ background: #b91c1c; color: #fff; }}
    .badge-call {{ background: #475569; color: #fff; }}

    .badge-2xx {{ background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }}
    .badge-4xx {{ background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }}
    .badge-5xx {{ background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }}

    /* Breakdown Bar */
    .breakdown-row {{
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
    }}

    .breakdown-info {{
      display: flex;
      justify-content: space-between;
    }}

    .breakdown-track {{
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }}

    .breakdown-fill {{
      height: 100%;
      border-radius: 3px;
    }}

    .code-block {{
      background: #080c14;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 11px;
      color: #94a3b8;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }}

    /* SVG Graph Node & Edge Styles */
    .graph-node {{
      cursor: pointer;
      transition: filter 0.15s;
    }}

    .graph-node:hover {{
      filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.6));
    }}

    .graph-node.selected rect {{
      stroke: var(--accent-blue) !important;
      stroke-width: 2.5px !important;
    }}

    .graph-edge {{
      cursor: pointer;
    }}

    .graph-edge path.edge-line {{
      transition: stroke 0.15s, stroke-width 0.15s;
    }}

    .graph-edge:hover path.edge-line {{
      stroke: var(--accent-blue) !important;
      stroke-width: 3px !important;
      filter: drop-shadow(0 0 4px var(--accent-blue));
    }}

    .graph-edge.selected path.edge-line {{
      stroke: var(--accent-amber) !important;
      stroke-width: 3.5px !important;
      filter: drop-shadow(0 0 6px var(--accent-amber));
    }}
  </style>
</head>
<body>

  <!-- Top Header -->
  <header>
    <div class="header-left">
      <div class="logo-badge">⚡ OpenSRE Trace Flow</div>
      <div class="trace-title" title="{analysis['trace_id']}">{analysis['trace_id'][:16]}...</div>
      <div class="stat-pill">⏱ Total: <strong>{analysis['total_duration_str']}</strong></div>
      <div class="stat-pill">📦 Spans: <strong>{analysis['span_count']}</strong></div>
      <div class="stat-pill">🏛️ Services: <strong>{len(analysis['services'])}</strong></div>
      <div class="stat-pill">🕒 {analysis['start_time_iso']}</div>
    </div>
    <div class="header-right">
      <button class="btn" id="btn-fit-view">🔍 Fit Graph</button>
      <button class="btn" id="btn-reset-view">↺ Reset</button>
    </div>
  </header>

  <!-- Main View -->
  <div class="main-container">
    <div class="center-pane">
      <!-- SVG Graph Viewport -->
      <div class="graph-viewport" id="viewport">
        <div class="graph-controls">
          <button class="icon-btn" id="btn-zoom-in" title="Zoom in">+</button>
          <button class="icon-btn" id="btn-zoom-out" title="Zoom out">−</button>
          <button class="icon-btn" id="btn-zoom-reset" title="Reset Zoom">⌂</button>
        </div>
        <div class="hint-chip">💡 Click on any <strong>Edge</strong> or <strong>Node</strong> for full inspection</div>
        <svg id="graph-canvas">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker id="arrow-error" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
            <marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
            </marker>
          </defs>
          <g id="graph-root"></g>
        </svg>
      </div>

      <!-- Bottom Timeline Pane -->
      <div class="timeline-pane">
        <div class="timeline-header">
          <span>INTERACTIVE TIMELINE & EXECUTION WATERFALL</span>
          <span>Slowest DB call displayed per service</span>
        </div>
        <div class="timeline-ruler">
          <span>0ms</span>
          <span>{format_duration(analysis['total_duration_us'] // 4)}</span>
          <span>{format_duration(analysis['total_duration_us'] // 2)}</span>
          <span>{format_duration(analysis['total_duration_us'] * 3 // 4)}</span>
          <span>{analysis['total_duration_str']}</span>
        </div>
        <div class="timeline-scroll" id="timeline-scroll-container">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>

    <!-- Inspector Slide-out Drawer -->
    <div class="drawer" id="inspector-drawer">
      <div class="drawer-header">
        <div class="drawer-title" id="drawer-title">Details</div>
        <button class="btn" id="btn-close-drawer">✕</button>
      </div>
      <div class="drawer-body" id="drawer-body">
        <!-- Dynamic content inserted by JS -->
      </div>
    </div>
  </div>

  <!-- Floating Tooltip -->
  <div id="tooltip"></div>

  <script>
    const TRACE_DATA = {data_json};

    // Viewport transform state
    let scale = 1.0;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    let currentPositions = {{}};
    let activeDragNode = null;
    let allEdgesData = [];

    const viewport = document.getElementById('viewport');
    const svgRoot = document.getElementById('graph-root');
    const drawer = document.getElementById('inspector-drawer');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerBody = document.getElementById('drawer-body');
    const tooltip = document.getElementById('tooltip');

    // Pan & Zoom handlers
    viewport.addEventListener('mousedown', (e) => {{
      if (e.target.closest('.graph-node') || e.target.closest('.graph-edge') || e.target.closest('.graph-controls')) {{
        return;
      }}
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    }});

    window.addEventListener('mousemove', (e) => {{
      if (activeDragNode) {{
        const dx = (e.clientX - activeDragNode.startX) / scale;
        const dy = (e.clientY - activeDragNode.startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) activeDragNode.moved = true;
        currentPositions[activeDragNode.id].x = Math.round(activeDragNode.initX + dx);
        currentPositions[activeDragNode.id].y = Math.round(activeDragNode.initY + dy);
        updateNodeAndEdges(activeDragNode.id);
        return;
      }}
      if (!isPanning) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    }});

    window.addEventListener('mouseup', () => {{
      if (activeDragNode) {{
        setTimeout(() => {{ activeDragNode = null; }}, 50);
      }}
      isPanning = false;
    }});

    viewport.addEventListener('wheel', (e) => {{
      e.preventDefault();
      const zoomFactor = 1.1;
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
      if (newScale < 0.2 || newScale > 4.0) return;

      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;
      updateTransform();
    }});

    function updateTransform() {{
      svgRoot.setAttribute('transform', `translate(${{panX}}, ${{panY}}) scale(${{scale}})`);
    }}

    document.getElementById('btn-zoom-in').addEventListener('click', () => {{
      scale = Math.min(4.0, scale * 1.2);
      updateTransform();
    }});

    document.getElementById('btn-zoom-out').addEventListener('click', () => {{
      scale = Math.max(0.2, scale / 1.2);
      updateTransform();
    }});

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {{
      resetView();
    }});

    document.getElementById('btn-reset-view').addEventListener('click', () => {{
      resetView();
    }});

    document.getElementById('btn-close-drawer').addEventListener('click', () => {{
      closeDrawer();
    }});

    function resetView() {{
      scale = 1.0;
      panX = 80;
      panY = 60;
      updateTransform();
    }}

    function closeDrawer() {{
      drawer.classList.remove('open');
      document.querySelectorAll('.graph-node.selected').forEach(n => n.classList.remove('selected'));
      document.querySelectorAll('.graph-edge.selected').forEach(e => e.classList.remove('selected'));
    }}

    // Render Graph
    function layoutAndRenderGraph() {{
      const nodes = [];
      const edges = [];

      // Add Client node
      const client = TRACE_DATA.client_node;
      nodes.push({{
        id: client.id,
        label: client.label,
        type: 'client',
        width: 170,
        height: 64,
        data: client
      }});

      // Add Service nodes
      for (const [svcName, svc] of Object.entries(TRACE_DATA.services)) {{
        nodes.push({{
          id: svcName,
          label: svcName,
          type: 'service',
          width: 200,
          height: 84,
          data: svc
        }});
      }}

      // Add Edges
      TRACE_DATA.edges.forEach(e => {{
        edges.push({{
          id: e.id,
          from: e.from === client.id ? client.id : e.from,
          to: e.to,
          data: e
        }});
      }});

      let nodePositions = {{}};

      // Try layout with Dagre
      if (typeof dagre !== 'undefined') {{
        try {{
          const g = new dagre.graphlib.Graph();
          g.setGraph({{ rankdir: 'TB', nodesep: 70, ranksep: 90 }});
          g.setDefaultEdgeLabel(() => ({{}}));

          nodes.forEach(n => g.setNode(n.id, {{ width: n.width, height: n.height }}));
          edges.forEach(e => g.setEdge(e.from, e.to));

          dagre.layout(g);

          g.nodes().forEach(v => {{
            const n = g.node(v);
            nodePositions[v] = {{ x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height }};
          }});
        }} catch (err) {{
          console.warn('Dagre layout failed, using fallback layout:', err);
          nodePositions = computeFallbackLayout(nodes, edges);
        }}
      }} else {{
        nodePositions = computeFallbackLayout(nodes, edges);
      }}

      renderSVGGraph(nodes, edges, nodePositions);
    }}

    // Fallback layered layout if Dagre CDN is unavailable
    function computeFallbackLayout(nodes, edges) {{
      const pos = {{}};
      const layers = [];
      const visited = new Set();

      // Layer 0: Client
      layers.push(['client_entry']);
      visited.add('client_entry');

      // Layer by layer BFS
      while (visited.size < nodes.length) {{
        const nextLayer = [];
        const currentLayer = layers[layers.length - 1];

        currentLayer.forEach(parentId => {{
          edges.filter(e => e.from === parentId).forEach(e => {{
            if (!visited.has(e.to)) {{
              visited.add(e.to);
              nextLayer.push(e.to);
            }}
          }});
        }});

        if (nextLayer.length === 0) {{
          // Add remaining disconnected nodes
          nodes.forEach(n => {{
            if (!visited.has(n.id)) {{
              visited.add(n.id);
              nextLayer.push(n.id);
            }}
          }});
        }}
        layers.push(nextLayer);
      }}

      // Compute (x, y) coordinates
      layers.forEach((layer, layerIdx) => {{
        const y = 80 + layerIdx * 140;
        const totalWidth = layer.length * 240;
        const startX = Math.max(80, 500 - totalWidth / 2);

        layer.forEach((nodeId, idx) => {{
          pos[nodeId] = {{
            x: startX + idx * 240,
            y: y,
            width: nodeId === 'client_entry' ? 170 : 200,
            height: nodeId === 'client_entry' ? 64 : 84
          }};
        }});
      }});

      return pos;
    }}

    function renderSVGGraph(nodes, edges, pos) {{
      svgRoot.innerHTML = `
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
          </marker>
          <marker id="arrow-error" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
          </marker>
        </defs>
      `;

      // Render Edges
      edges.forEach(e => {{
        const src = pos[e.from];
        const dst = pos[e.to];
        if (!src || !dst) return;

        const x1 = src.x + src.width / 2;
        const y1 = src.y + src.height;
        const x2 = dst.x + dst.width / 2;
        const y2 = dst.y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const cx1 = x1;
        const cy1 = y1 + Math.max(30, dy * 0.45);
        const cx2 = x2;
        const cy2 = y2 - Math.max(30, dy * 0.45);

        const pathD = `M ${{x1}} ${{y1}} C ${{cx1}} ${{cy1}}, ${{cx2}} ${{cy2}}, ${{x2}} ${{y2}}`;

        const isError = e.data.has_error;
        const strokeColor = isError ? '#ef4444' : '#64748b';
        const marker = isError ? 'url(#arrow-error)' : 'url(#arrow)';

        // Midpoint for label
        const midX = (x1 + 2 * (cx1 + cx2) / 2 + x2) / 4;
        const midY = (y1 + 2 * (cy1 + cy2) / 2 + y2) / 4;

        const gEdge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gEdge.setAttribute('class', 'graph-edge');
        gEdge.setAttribute('id', `svg-${{e.id}}`);

        gEdge.innerHTML = `
          <!-- Invisible thick stroke for easy click -->
          <path d="${{pathD}}" fill="none" stroke="transparent" stroke-width="18" />
          <!-- Visible line -->
          <path class="edge-line" d="${{pathD}}" fill="none" stroke="${{strokeColor}}" stroke-width="2" marker-end="${{marker}}" />
          <!-- Edge Label Pill -->
          <g transform="translate(${{midX}}, ${{midY}})">
            <rect x="-65" y="-12" width="130" height="24" rx="12" fill="#1e293b" stroke="${{strokeColor}}" stroke-width="1.2" />
            <text x="0" y="4" text-anchor="middle" font-size="10" font-family="monospace" fill="${{isError ? '#f87171' : '#f8fafc'}}" font-weight="600">
              ${{e.data.method}} ${{e.data.duration_str}}
            </text>
          </g>
        `;

        gEdge.addEventListener('click', (ev) => {{
          ev.stopPropagation();
          selectEdge(e.data);
        }});

        svgRoot.appendChild(gEdge);
      }});

      currentPositions = Object.assign({{}}, pos);
      allEdgesData = edges;

      // Render Nodes
      nodes.forEach(n => {{
        const p = currentPositions[n.id];
        if (!p) return;

        const gNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gNode.setAttribute('class', 'graph-node');
        gNode.setAttribute('id', `node-${{n.id}}`);
        gNode.setAttribute('transform', `translate(${{p.x}}, ${{p.y}})`);
        gNode.style.cursor = 'grab';

        if (n.type === 'client') {{
          gNode.innerHTML = `
            <rect width="${{p.width}}" height="${{p.height}}" rx="10" fill="#1e1b4b" stroke="#6366f1" stroke-width="1.5" />
            <text x="${{p.width / 2}}" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#e0e7ff" pointer-events="none">👤 Client</text>
            <text x="${{p.width / 2}}" y="46" text-anchor="middle" font-size="11" font-family="monospace" fill="#a5b4fc" pointer-events="none">${{n.data.ip}}</text>
          `;
          gNode.addEventListener('mousedown', (ev) => {{
            ev.stopPropagation();
            activeDragNode = {{
              id: n.id,
              startX: ev.clientX,
              startY: ev.clientY,
              initX: currentPositions[n.id].x,
              initY: currentPositions[n.id].y,
              moved: false
            }};
          }});
          gNode.addEventListener('click', (ev) => {{
            if (activeDragNode && activeDragNode.moved) return;
            ev.stopPropagation();
            selectClientNode(n.data);
          }});
        }} else {{
          const svc = n.data;
          const isError = svc.has_error;
          const borderColor = isError ? '#ef4444' : '#334155';
          const bgColor = isError ? '#2c0b0e' : '#1e293b';

          let dbText = '';
          if (svc.db_summary.count > 0) {{
            dbText = `<text x="14" y="66" font-size="10" fill="#fbbf24" pointer-events="none">🗄️ ${{svc.db_summary.count}} DB calls (${{svc.db_summary.slowest.duration_str}})</text>`;
          }} else {{
            dbText = `<text x="14" y="66" font-size="10" fill="#94a3b8" pointer-events="none">Spans: ${{svc.span_count}}</text>`;
          }}

          gNode.innerHTML = `
            <rect width="${{p.width}}" height="${{p.height}}" rx="10" fill="${{bgColor}}" stroke="${{borderColor}}" stroke-width="1.5" />
            <circle cx="22" cy="24" r="5" fill="${{isError ? '#ef4444' : '#22c55e'}}" pointer-events="none" />
            <text x="34" y="28" font-size="13" font-weight="700" fill="#f8fafc" pointer-events="none">${{svc.name}}</text>
            <text x="${{p.width - 14}}" y="28" text-anchor="end" font-size="11" font-weight="600" font-family="monospace" fill="${{isError ? '#f87171' : '#38bdf8'}}" pointer-events="none">
              ⏱ ${{svc.max_duration_str}}
            </text>
            <line x1="12" y1="42" x2="${{p.width - 12}}" y2="42" stroke="rgba(255,255,255,0.08)" pointer-events="none" />
            ${{dbText}}
          `;

          gNode.addEventListener('mousedown', (ev) => {{
            ev.stopPropagation();
            activeDragNode = {{
              id: n.id,
              startX: ev.clientX,
              startY: ev.clientY,
              initX: currentPositions[n.id].x,
              initY: currentPositions[n.id].y,
              moved: false
            }};
          }});

          gNode.addEventListener('click', (ev) => {{
            if (activeDragNode && activeDragNode.moved) return;
            ev.stopPropagation();
            selectServiceNode(svc);
          }});
        }}

        svgRoot.appendChild(gNode);
      }});

      // Auto fit initial view
      fitGraphToView(pos);
    }}

    function updateNodeAndEdges(nodeId) {{
      const p = currentPositions[nodeId];
      const gNode = document.getElementById(`node-${{nodeId}}`);
      if (gNode && p) {{
        gNode.setAttribute('transform', `translate(${{p.x}}, ${{p.y}})`);
      }}

      allEdgesData.forEach(e => {{
        if (e.from === nodeId || e.to === nodeId) {{
          const src = currentPositions[e.from];
          const dst = currentPositions[e.to];
          if (!src || !dst) return;

          const x1 = src.x + src.width / 2;
          const y1 = src.y + src.height;
          const x2 = dst.x + dst.width / 2;
          const y2 = dst.y;

          const dy = y2 - y1;
          const cx1 = x1;
          const cy1 = y1 + Math.max(30, dy * 0.45);
          const cx2 = x2;
          const cy2 = y2 - Math.max(30, dy * 0.45);

          const pathD = `M ${{x1}} ${{y1}} C ${{cx1}} ${{cy1}}, ${{cx2}} ${{cy2}}, ${{x2}} ${{y2}}`;
          const midX = (x1 + 2 * ((cx1 + cx2) / 2) + x2) / 4;
          const midY = (y1 + 2 * ((cy1 + cy2) / 2) + y2) / 4;

          const gEdge = document.getElementById(`svg-${{e.id}}`);
          if (gEdge) {{
            const paths = gEdge.querySelectorAll('path');
            paths.forEach(pth => pth.setAttribute('d', pathD));
            const lblG = gEdge.querySelector('g');
            if (lblG) lblG.setAttribute('transform', `translate(${{midX}}, ${{midY}})`);
          }}
        }}
      }});
    }}

    function fitGraphToView(pos) {{
      const values = Object.values(pos);
      if (values.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      values.forEach(p => {{
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.width);
        maxY = Math.max(maxY, p.y + p.height);
      }});

      const rect = viewport.getBoundingClientRect();
      const graphW = (maxX - minX) + 120;
      const graphH = (maxY - minY) + 120;

      const scaleX = rect.width / graphW;
      const scaleY = rect.height / graphH;
      scale = Math.min(1.4, Math.max(0.4, Math.min(scaleX, scaleY)));

      panX = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
      panY = Math.max(30, (rect.height - (maxY - minY) * scale) / 2 - minY * scale);

      updateTransform();
    }}

    document.getElementById('btn-fit-view').addEventListener('click', () => {{
      layoutAndRenderGraph();
    }});

    // Selection handlers
    function selectEdge(edge) {{
      closeDrawer();
      const el = document.getElementById(`svg-${{edge.id}}`);
      if (el) el.classList.add('selected');

      drawerTitle.innerHTML = `🔗 Call: <span style="color:var(--accent-blue)">${{edge.from}} → ${{edge.to}}</span>`;

      const statusBadgeClass = edge.status_code.startsWith('2') ? 'badge-2xx' : (edge.status_code.startsWith('4') ? 'badge-4xx' : 'badge-5xx');
      const methodBadgeClass = `badge-${{edge.method.toLowerCase()}}`;

      let breakdownHtml = '';
      if (edge.breakdown && edge.breakdown.length > 0) {{
        const maxSubUs = edge.breakdown[0].duration_us || 1;
        breakdownHtml = `
          <div class="section-card">
            <div class="section-title">⏱️ Response Time Breakdown Inside Call</div>
            ${{edge.breakdown.map(b => `
              <div class="breakdown-row">
                <div class="breakdown-info">
                  <span style="color: ${{b.type === 'database' ? 'var(--accent-amber)' : 'var(--accent-blue)'}}">
                    ${{b.type === 'database' ? '🗄️' : '🌐'}} ${{escapeHtml(b.name)}}
                  </span>
                  <span style="font-family:monospace">${{b.duration_str}}</span>
                </div>
                <div class="breakdown-track">
                  <div class="breakdown-fill" style="width: ${{Math.max(2, (b.duration_us / maxSubUs) * 100)}}%; background: ${{b.type === 'database' ? 'var(--accent-amber)' : 'var(--accent-blue)'}}"></div>
                </div>
                <div style="font-size:10px; color:var(--text-muted); font-family:monospace">${{escapeHtml(b.detail)}}</div>
              </div>
            `).join('')}}
          </div>
        `;
      }}

      let headersHtml = '';
      if (edge.request_headers) {{
        headersHtml += `
          <div class="section-card">
            <div class="section-title">📤 Request Headers</div>
            <div class="code-block">${{escapeHtml(edge.request_headers)}}</div>
          </div>
        `;
      }}
      if (edge.response_headers) {{
        headersHtml += `
          <div class="section-card">
            <div class="section-title">📥 Response Headers</div>
            <div class="code-block">${{escapeHtml(edge.response_headers)}}</div>
          </div>
        `;
      }}

      let bodyHtml = '';
      if (edge.response_body) {{
        bodyHtml += `
          <div class="section-card">
            <div class="section-title">📦 Response Body</div>
            <div class="code-block">${{formatMaybeJson(edge.response_body)}}</div>
          </div>
        `;
      }}
      if (edge.request_body) {{
        bodyHtml += `
          <div class="section-card">
            <div class="section-title">📦 Request Body</div>
            <div class="code-block">${{formatMaybeJson(edge.request_body)}}</div>
          </div>
        `;
      }}

      drawerBody.innerHTML = `
        <div class="section-card">
          <div class="section-title">Overview</div>
          <div class="key-value-grid">
            <div class="key">Method:</div>
            <div class="val"><span class="badge ${{methodBadgeClass}}">${{edge.method}}</span></div>
            <div class="key">Endpoint:</div>
            <div class="val">${{escapeHtml(edge.endpoint)}}</div>
            <div class="key">Duration:</div>
            <div class="val" style="color:var(--accent-blue); font-weight:700">${{edge.duration_str}}</div>
            <div class="key">Status:</div>
            <div class="val"><span class="badge ${{statusBadgeClass}}">${{edge.status_code}}</span></div>
            <div class="key">Server:</div>
            <div class="val">${{escapeHtml(edge.server_address)}}${{edge.server_port ? ':' + edge.server_port : ''}}</div>
            <div class="key">Span ID:</div>
            <div class="val">${{edge.span_id}}</div>
          </div>
        </div>
        ${{breakdownHtml}}
        ${{headersHtml}}
        ${{bodyHtml}}
      `;

      drawer.classList.add('open');
    }}

    function selectServiceNode(svc) {{
      closeDrawer();
      const el = document.getElementById(`node-${{svc.name}}`);
      if (el) el.classList.add('selected');

      drawerTitle.innerHTML = `📦 Service: <span style="color:var(--accent-blue)">${{svc.name}}</span>`;

      let dbCallsHtml = '';
      if (svc.db_summary.count > 0) {{
        dbCallsHtml = `
          <div class="section-card">
            <div class="section-title">🗄️ Database Calls (${{svc.db_summary.count}} total, ${{svc.db_summary.total_duration_str}})</div>
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px">
              Slowest: <strong>${{svc.db_summary.slowest.duration_str}}</strong> (${{escapeHtml(svc.db_summary.slowest.operation)}})
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto">
              ${{svc.db_summary.calls.map(c => `
                <div style="background:rgba(0,0,0,0.3); border-radius:6px; padding:8px; border:1px solid rgba(255,255,255,0.05)">
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px">
                    <span style="color:var(--accent-amber); font-weight:600">${{escapeHtml(c.operation)}}</span>
                    <span style="font-family:monospace; color:#fff">${{c.duration_str}}</span>
                  </div>
                  <div style="font-size:10px; font-family:monospace; color:#94a3b8; word-break:break-all">${{escapeHtml(c.statement)}}</div>
                </div>
              `).join('')}}
            </div>
          </div>
        `;
      }}

      let errorsHtml = '';
      if (svc.has_error) {{
        errorsHtml = `
          <div class="section-card" style="border-color:var(--accent-red); background:rgba(239, 68, 68, 0.05)">
            <div class="section-title" style="color:var(--accent-red)">⚠️ Errors (${{svc.error_count}})</div>
            <div style="display:flex; flex-direction:column; gap:8px">
              ${{svc.errors.map(err => typeof err === 'string' ? `
                <div style="font-size:11px; color:#fca5a5; font-family:monospace; background:rgba(0,0,0,0.3); padding:6px; border-radius:4px">
                  ${{escapeHtml(err)}}
                </div>
              ` : `
                <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px">
                  <div style="display:flex; justify-content:space-between; align-items:center">
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
                      ${{err.status_code ? `<span style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); border-radius:4px; padding:1px 6px; font-size:10px; font-weight:700; font-family:monospace">${{escapeHtml(err.status_code)}}</span>` : ''}}
                      <span style="background:#1e293b; color:#cbd5e1; border-radius:4px; padding:1px 6px; font-size:10px; font-family:monospace; font-weight:600">${{escapeHtml(err.method || 'CALL')}}</span>
                      <span style="color:#fff; font-size:11px; font-weight:600; font-family:monospace">${{escapeHtml(err.endpoint || err.operation)}}</span>
                    </div>
                    <span style="color:#f87171; font-size:10px; font-family:monospace">${{escapeHtml(err.duration_str || '')}}</span>
                  </div>
                  <div style="color:#fca5a5; font-size:11px; font-weight:600">
                    ⚠️ ${{escapeHtml(err.message)}}
                  </div>
                  ${{err.details ? `<div style="color:#cbd5e1; font-size:10px; background:rgba(0,0,0,0.3); padding:6px; border-radius:4px">${{escapeHtml(err.details)}}</div>` : ''}}
                  ${{err.full_url && err.full_url !== err.endpoint ? `<div style="color:#94a3b8; font-size:10px; font-family:monospace; word-break:break-all">Target: ${{escapeHtml(err.full_url)}}</div>` : ''}}
                  ${{err.response_body ? `
                    <details style="margin-top:4px; font-size:10px">
                      <summary style="cursor:pointer; color:#94a3b8; font-weight:600">📦 Response Body</summary>
                      <pre style="margin-top:4px; max-height:160px; overflow-y:auto; background:rgba(0,0,0,0.6); padding:6px; border-radius:4px; color:#fca5a5; font-family:monospace; white-space:pre-wrap; word-break:break-all">${{formatMaybeJson(err.response_body)}}</pre>
                    </details>
                  ` : ''}}
                  ${{err.request_body ? `
                    <details style="margin-top:4px; font-size:10px">
                      <summary style="cursor:pointer; color:#94a3b8; font-weight:600">📤 Request Payload</summary>
                      <pre style="margin-top:4px; max-height:160px; overflow-y:auto; background:rgba(0,0,0,0.6); padding:6px; border-radius:4px; color:#e2e8f0; font-family:monospace; white-space:pre-wrap; word-break:break-all">${{formatMaybeJson(err.request_body)}}</pre>
                    </details>
                  ` : ''}}
                  ${{err.stack_trace ? `
                    <details style="margin-top:4px; font-size:10px">
                      <summary style="cursor:pointer; color:#f87171; font-weight:600">💥 Exception Stack Trace</summary>
                      <pre style="margin-top:4px; max-height:180px; overflow-y:auto; background:rgba(0,0,0,0.7); padding:6px; border-radius:4px; color:#fca5a5; font-family:monospace; white-space:pre-wrap; word-break:break-all">${{escapeHtml(err.stack_trace)}}</pre>
                    </details>
                  ` : ''}}
                  <div style="font-size:9px; color:#64748b; font-family:monospace; margin-top:2px">
                    Span ID: ${{escapeHtml(err.span_id)}}
                  </div>
                </div>
              `).join('')}}
            </div>
          </div>
        `;
      }}

      drawerBody.innerHTML = `
        <div class="section-card">
          <div class="section-title">Service Metrics</div>
          <div class="key-value-grid">
            <div class="key">Service:</div>
            <div class="val" style="font-weight:700">${{svc.name}}</div>
            <div class="key">Max Span Time:</div>
            <div class="val" style="color:var(--accent-blue); font-weight:700">${{svc.max_duration_str}}</div>
            <div class="key">Active Time:</div>
            <div class="val">${{svc.total_time_str}}</div>
            <div class="key">Total Spans:</div>
            <div class="val">${{svc.span_count}}</div>
            <div class="key">DB Calls:</div>
            <div class="val">${{svc.db_summary.count}}</div>
            <div class="key">Servers/IPs:</div>
            <div class="val">${{svc.servers.join(', ') || 'N/A'}}</div>
          </div>
        </div>
        ${{errorsHtml}}
        ${{dbCallsHtml}}
      `;

      drawer.classList.add('open');
    }}

    function selectClientNode(client) {{
      closeDrawer();
      drawerTitle.innerHTML = `👤 Client Details`;
      drawerBody.innerHTML = `
        <div class="section-card">
          <div class="section-title">Client Information</div>
          <div class="key-value-grid">
            <div class="key">IP / Host:</div>
            <div class="val" style="font-weight:700; color:var(--accent-blue)">${{client.ip}}</div>
            <div class="key">Initial Entry:</div>
            <div class="val">${{TRACE_DATA.edges[0].method}} ${{escapeHtml(TRACE_DATA.edges[0].endpoint)}}</div>
            <div class="key">Duration:</div>
            <div class="val">${{TRACE_DATA.edges[0].duration_str}}</div>
          </div>
        </div>
      `;
      drawer.classList.add('open');
    }}

    // Render Timeline Pane
    function renderTimeline() {{
      const container = document.getElementById('timeline-scroll-container');
      container.innerHTML = '';

      TRACE_DATA.timeline.forEach(item => {{
        const row = document.createElement('div');
        row.className = 'timeline-row';

        const isDb = item.is_db;
        const barClass = isDb ? 'timeline-bar db' : (item.has_error ? 'timeline-bar error' : 'timeline-bar');

        const labelText = isDb ? `🗄️ ${{item.operation}}` : `${{item.service}}: ${{item.operation}}`;
        const labelClass = isDb ? 'timeline-label db-label' : 'timeline-label';

        row.innerHTML = `
          <div class="${{labelClass}}" title="${{escapeHtml(labelText)}}">${{escapeHtml(labelText)}}</div>
          <div class="timeline-track">
            <div class="${{barClass}}" style="left: ${{item.start_pct}}%; width: ${{item.width_pct}}%">
              ${{item.duration_str}}
            </div>
          </div>
        `;

        // Tooltip handlers
        const bar = row.querySelector('.timeline-bar');
        bar.addEventListener('mouseenter', (e) => {{
          tooltip.innerHTML = `
            <strong>${{escapeHtml(item.operation)}}</strong><br/>
            Service: <strong>${{item.service}}</strong><br/>
            Duration: <strong style="color:var(--accent-blue)">${{item.duration_str}}</strong><br/>
            Offset: ${{item.start_offset_str}}
          `;
          tooltip.style.display = 'block';
        }});

        bar.addEventListener('mousemove', (e) => {{
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY + 14) + 'px';
        }});

        bar.addEventListener('mouseleave', () => {{
          tooltip.style.display = 'none';
        }});

        // Click on timeline bar -> highlight graph & open detail
        row.addEventListener('click', () => {{
          if (item.edge_id) {{
            const edge = TRACE_DATA.edges.find(e => e.id === item.edge_id);
            if (edge) selectEdge(edge);
          }} else {{
            const svc = TRACE_DATA.services[item.service];
            if (svc) selectServiceNode(svc);
          }}
        }});

        container.appendChild(row);
      }});
    }}

    function escapeHtml(str) {{
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }}

    function formatMaybeJson(str) {{
      if (!str) return '';
      try {{
        const parsed = JSON.parse(str);
        return escapeHtml(JSON.stringify(parsed, null, 2));
      }} catch (e) {{
        return escapeHtml(str);
      }}
    }}

    // Init
    window.addEventListener('DOMContentLoaded', () => {{
      layoutAndRenderGraph();
      renderTimeline();
    }});
  </script>
</body>
</html>
"""
    return html_content


def main():
    parser = argparse.ArgumentParser(
        description="Visualize Jaeger Distributed Traces as Interactive Topology Graphs and Timeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("trace_id", help="Jaeger Trace ID to visualize")
    parser.add_argument(
        "--mode",
        choices=["html", "mermaid", "json"],
        default="html",
        help="Visualization mode (default: html)",
    )
    parser.add_argument(
        "--mermaid",
        action="store_true",
        help="Shortcut for --mode mermaid (prints Mermaid markdown)",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output HTML file path (default: /tmp/trace_<trace_id>.html)",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Automatically open the generated HTML file in web browser",
    )

    args = parser.parse_args()

    mode = "mermaid" if args.mermaid else args.mode

    try:
        trace_data = get_trace(args.trace_id)
        if not trace_data:
            print(f"Error: Trace '{args.trace_id}' not found.", file=sys.stderr)
            sys.exit(1)

        analysis = build_trace_analysis(trace_data)

        if mode == "mermaid":
            mermaid_code = generate_mermaid(analysis)
            print(mermaid_code)
        elif mode == "json":
            print(json.dumps(analysis, indent=2, default=str))
        else:
            # HTML mode
            html_content = generate_html(analysis)
            output_path = args.output
            if not output_path:
                output_path = f"/tmp/trace_{args.trace_id}.html"

            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            print(f"✓ Interactive Trace Visualization generated successfully:")
            print(f"  File: {output_path}")
            print(f"  URL:  file://{os.path.abspath(output_path)}")
            print(f"  Trace: {args.trace_id} ({analysis['total_duration_str']}, {analysis['span_count']} spans, {len(analysis['services'])} services)")

            if args.open:
                webbrowser.open(f"file://{os.path.abspath(output_path)}")

    except Exception as e:
        print(f"Error processing trace {args.trace_id}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
