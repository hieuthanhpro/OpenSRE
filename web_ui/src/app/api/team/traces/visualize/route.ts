import { NextResponse } from 'next/server';

const NOISE_OPERATIONS = new Set([
  'Date.create',
  'Calendar.getInstance',
  'UUID.randomUUID',
  'UUID.fromString',
  'Date.getTime',
  'Instant.now',
  'System.currentTimeMillis',
]);

function formatDuration(microseconds: number): string {
  if (microseconds < 1000) {
    return `${microseconds}µs`;
  } else if (microseconds < 1_000_000) {
    return `${(microseconds / 1000).toFixed(1)}ms`;
  } else {
    return `${(microseconds / 1_000_000).toFixed(2)}s`;
  }
}

function isDatabaseSpan(span: { operation: string; tags: Record<string, any> }): boolean {
  const { operation, tags } = span;
  if (tags['db.statement'] || tags['db.system'] || tags['db.name'] || tags['db.type']) {
    return true;
  }
  const opUpper = (operation || '').trim().toUpperCase();
  const dbVerbs = ['SELECT', 'CALL', 'INSERT', 'UPDATE', 'DELETE', 'EXEC', 'EXECUTE', 'BEGIN', 'COMMIT'];
  return dbVerbs.some((v) => opUpper.startsWith(v));
}

function extractRequestBody(tags: Record<string, any> = {}, logs: any[] = []): string {
  const bodyKeys = [
    'http.request.body',
    'http.request_body',
    'http.body',
    'request.body',
    'request_body',
    'http.payload',
    'request.payload',
    'rpc.request.payload',
    'http.request_payload',
    'payload',
  ];
  for (const k of bodyKeys) {
    if (tags[k] !== undefined && tags[k] !== null && String(tags[k]).trim() !== '') {
      const val = tags[k];
      return typeof val === 'string' ? val : JSON.stringify(val);
    }
  }

  for (const logItem of logs) {
    const fields = logItem.fields || [];
    for (const f of fields) {
      if (
        f.key === 'http.request.body' ||
        f.key === 'request.body' ||
        f.key === 'request_body' ||
        f.key === 'request' ||
        f.key === 'payload'
      ) {
        if (f.value !== undefined && f.value !== null && String(f.value).trim() !== '') {
          return typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
        }
      }
    }
  }

  return '';
}

function extractResponseBody(tags: Record<string, any> = {}, logs: any[] = []): string {
  const bodyKeys = [
    'http.response.body',
    'http.response_body',
    'response.body',
    'response_body',
    'http.response.payload',
    'response.payload',
    'rpc.response.payload',
  ];
  for (const k of bodyKeys) {
    if (tags[k] !== undefined && tags[k] !== null && String(tags[k]).trim() !== '') {
      const val = tags[k];
      return typeof val === 'string' ? val : JSON.stringify(val);
    }
  }

  for (const logItem of logs) {
    const fields = logItem.fields || [];
    for (const f of fields) {
      if (
        f.key === 'http.response.body' ||
        f.key === 'response.body' ||
        f.key === 'response_body' ||
        f.key === 'response'
      ) {
        if (f.value !== undefined && f.value !== null && String(f.value).trim() !== '') {
          return typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
        }
      }
    }
  }

  return '';
}


function generateMermaid(analysis: any): string {
  const lines: string[] = ['graph TD'];
  const client = analysis.client_node;
  lines.push(`    ${client.id}["${client.label.replace(/\n/g, '<br/>')}"]`);

  for (const [svcName, svc] of Object.entries<any>(analysis.services)) {
    const dur = svc.max_duration_str;
    const dbBadge = svc.db_summary.count > 0 ? `<br/>🗄️ ${svc.db_summary.count} DB calls` : '';
    const errBadge = svc.has_error ? ' ❌' : '';
    const nodeId = svcName.replace(/[-.]/g, '_');
    lines.push(`    ${nodeId}["${svcName}${errBadge}<br/>⏱ ${dur}${dbBadge}"]`);
  }

  lines.push('');

  for (const edge of analysis.edges) {
    const fromId = edge.from.replace(/[-.]/g, '_');
    const toId = edge.to.replace(/[-.]/g, '_');
    let ep = edge.endpoint;
    if (ep.length > 28) ep = ep.slice(0, 25) + '..';
    const errIcon = edge.has_error ? ' ❌' : '';
    const label = `${edge.method} ${ep}${errIcon}<br/>${edge.duration_str}`;
    lines.push(`    ${fromId} -->|"${label}"| ${toId}`);
  }

  lines.push('');
  for (const [svcName, svc] of Object.entries<any>(analysis.services)) {
    if (svc.has_error) {
      const nodeId = svcName.replace(/[-.]/g, '_');
      lines.push(`    style ${nodeId} fill:#ef4444,stroke:#dc2626,color:#ffffff`);
    }
  }

  return lines.join('\n');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get('trace_id');

  if (!traceId) {
    return NextResponse.json({ success: false, error: 'Missing trace_id parameter' }, { status: 400 });
  }

  let configuredUrl = (process.env.JAEGER_URL || 'https://jaeger.opvn.vn').trim().replace(/\/$/, '');
  if (!configuredUrl.startsWith('http://') && !configuredUrl.startsWith('https://')) {
    configuredUrl = `http://${configuredUrl}`;
  }

  const jaegerCandidates = [configuredUrl];
  if (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost')) {
    jaegerCandidates.push(configuredUrl.replace('127.0.0.1', 'host.docker.internal').replace('localhost', 'host.docker.internal'));
    jaegerCandidates.push(configuredUrl.replace('127.0.0.1', '10.38.131.121').replace('localhost', '10.38.131.121'));
  }

  let response: Response | null = null;
  let lastFetchError: Error | null = null;

  for (const candidateBase of jaegerCandidates) {
    const candidateUrl = `${candidateBase}/api/traces/${encodeURIComponent(traceId)}`;
    try {
      const res = await fetch(candidateUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok || res.status === 404) {
        response = res;
        break;
      }
      response = res;
    } catch (err: any) {
      lastFetchError = err;
    }
  }

  try {
    if (!response) {
      throw lastFetchError || new Error('Failed to connect to Jaeger');
    }

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ success: false, error: `Trace '${traceId}' not found on Jaeger` }, { status: 404 });
      }
      return NextResponse.json(
        { success: false, error: `Jaeger API returned status ${response.status}` },
        { status: response.status }
      );
    }

    const json = await response.json();
    const traces = json.data || [];
    if (!traces.length) {
      return NextResponse.json({ success: false, error: `Trace '${traceId}' contains no data` }, { status: 404 });
    }

    const rawTrace = traces[0];
    const rawSpans = rawTrace.spans || [];
    const processes = rawTrace.processes || {};

    if (!rawSpans.length) {
      return NextResponse.json({ success: false, error: `Trace '${traceId}' contains 0 spans` }, { status: 404 });
    }

    // Build span map
    const spanMap = new Map<string, any>();
    for (const span of rawSpans) {
      const proc = processes[span.processID] || {};
      const serviceName = proc.serviceName || 'unknown';

      const tags: Record<string, any> = {};
      for (const t of span.tags || []) {
        tags[t.key] = t.value;
      }

      const hasError = tags['error'] === true || tags['error'] === 'true' || tags['otel.status_code'] === 'ERROR';

      let parentId: string | null = null;
      for (const ref of span.references || []) {
        if (ref.refType === 'CHILD_OF') {
          parentId = ref.spanID;
          break;
        }
      }

      spanMap.set(span.spanID, {
        span_id: span.spanID,
        trace_id: span.traceID,
        operation: span.operationName || '',
        service: serviceName,
        duration_us: span.duration || 0,
        duration: formatDuration(span.duration || 0),
        start_time: span.startTime || 0,
        tags,
        has_error: hasError,
        logs: span.logs || [],
        parent_id: parentId,
        child_ids: [] as string[],
      });
    }

    // Link children
    for (const [, info] of spanMap.entries()) {
      if (info.parent_id && spanMap.has(info.parent_id)) {
        spanMap.get(info.parent_id).child_ids.push(info.span_id);
      }
    }

    // Root span & duration bounds
    let rootSpan = rawSpans[0];
    let minStart = rootSpan.startTime || Infinity;
    let maxEnd = 0;

    for (const s of rawSpans) {
      const st = s.startTime || 0;
      const end = st + (s.duration || 0);
      if (st < minStart) {
        minStart = st;
        rootSpan = s;
      }
      if (end > maxEnd) maxEnd = end;
    }

    const traceStartUs = minStart;
    const totalTraceDurationUs = Math.max(maxEnd - traceStartUs, 1);
    const startDt = new Date(traceStartUs / 1000);
    const timeIso = startDt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    // Group spans by service
    const serviceSpans = new Map<string, any[]>();
    const serviceDbCalls = new Map<string, any[]>();
    const serviceServers = new Map<string, Set<string>>();
    const serviceErrors = new Map<string, any[]>();

    function extractErrorInfo(info: any) {
      const tags = info.tags || {};
      const logs = info.logs || [];

      const statusCode = String(
        tags['http.response.status_code'] ||
        tags['http.status_code'] ||
        tags['error.type'] ||
        tags['rpc.grpc.status_code'] ||
        ''
      );

      const method = String(tags['http.request.method'] || tags['http.method'] || info.operation || 'HTTP');
      const fullUrl = String(tags['url.full'] || tags['http.url'] || '');
      let endpoint = String(tags['http.route'] || tags['url.path'] || '');
      if (!endpoint && fullUrl) {
        try {
          const u = new URL(fullUrl);
          endpoint = u.pathname;
        } catch {
          endpoint = fullUrl;
        }
      }
      if (!endpoint) {
        endpoint = info.operation;
      }

      let errorMsg = '';
      let errorDetails = '';
      let stackTrace = String(tags['exception.stacktrace'] || tags['exception.stack'] || '');

      // 1. Response body inspection
      const respBody = String(tags['http.response.body'] || '');
      if (respBody) {
        try {
          const parsed = JSON.parse(respBody);
          if (parsed && typeof parsed === 'object') {
            const title = parsed.title || parsed.name || parsed.error || parsed.code || '';
            const msg = parsed.message || parsed.description || parsed.detail || '';
            const det = parsed.details || parsed.errors || parsed.information_link || '';
            if (title || msg) {
              errorMsg = [title, msg].filter(Boolean).join(' - ');
            }
            if (det) {
              errorDetails = typeof det === 'string' ? det : JSON.stringify(det);
            }
          }
        } catch {
          if (respBody.length < 300 && !respBody.trim().startsWith('<')) {
            errorMsg = respBody;
          }
        }
      }

      // 2. Explicit tags
      if (!errorMsg) {
        errorMsg = String(tags['error.message'] || tags['message'] || tags['exception.message'] || tags['status.message'] || '');
      }

      // 3. Span logs
      for (const logItem of logs) {
        const fields = logItem.fields || [];
        for (const f of fields) {
          if ((f.key === 'message' || f.key === 'error.message' || f.key === 'exception.message') && !errorMsg) {
            errorMsg = String(f.value);
          }
          if ((f.key === 'stack' || f.key === 'exception.stacktrace') && !stackTrace) {
            stackTrace = String(f.value);
          }
          if ((f.key === 'error.kind' || f.key === 'error.type') && !errorDetails) {
            errorDetails = `Type: ${f.value}`;
          }
        }
      }

      // 4. HTTP status fallbacks
      if (!errorMsg && statusCode) {
        const codeNum = parseInt(statusCode, 10);
        const STATUS_MAP: Record<number, string> = {
          400: 'Bad Request (400)',
          401: 'Unauthorized (401)',
          403: 'Forbidden (403)',
          404: 'Not Found (404)',
          405: 'Method Not Allowed (405)',
          408: 'Request Timeout (408)',
          409: 'Conflict (409)',
          422: 'Unprocessable Entity (422)',
          429: 'Too Many Requests (429)',
          500: 'Internal Server Error (500)',
          502: 'Bad Gateway (502)',
          503: 'Service Unavailable (503)',
          504: 'Gateway Timeout (504)',
        };
        errorMsg = STATUS_MAP[codeNum] || `HTTP Error ${statusCode}`;
      }

      if (!errorMsg) {
        errorMsg = tags['otel.status_code'] === 'ERROR' ? 'Operation failed with ERROR status' : 'Unknown Error';
      }

      return {
        span_id: info.span_id,
        operation: info.operation,
        service: info.service,
        method,
        endpoint,
        full_url: fullUrl,
        status_code: statusCode,
        error_type: String(tags['error.type'] || tags['exception.type'] || ''),
        message: errorMsg,
        details: errorDetails,
        request_body: String(tags['http.request.body'] || ''),
        response_body: respBody,
        request_headers: String(tags['http.request.headers'] || ''),
        response_headers: String(tags['http.response.headers'] || ''),
        stack_trace: stackTrace,
        duration_us: info.duration_us,
        duration_str: info.duration,
      };
    }

    for (const [, info] of spanMap.entries()) {
      const svc = info.service;
      if (!serviceSpans.has(svc)) serviceSpans.set(svc, []);
      serviceSpans.get(svc)!.push(info);

      for (const sTag of ['server.address', 'network.peer.address', 'client.address', 'peer.hostname']) {
        if (info.tags[sTag]) {
          if (!serviceServers.has(svc)) serviceServers.set(svc, new Set());
          serviceServers.get(svc)!.add(String(info.tags[sTag]));
        }
      }

      if (info.has_error) {
        if (!serviceErrors.has(svc)) serviceErrors.set(svc, []);
        serviceErrors.get(svc)!.push(extractErrorInfo(info));
      }

      if (isDatabaseSpan(info)) {
        if (!serviceDbCalls.has(svc)) serviceDbCalls.set(svc, []);
        serviceDbCalls.get(svc)!.push(info);
      }
    }

    // Helper: compute breakdown
    function computeSpanBreakdown(spanId: string) {
      const breakdown: any[] = [];
      const info = spanMap.get(spanId);
      if (!info) return breakdown;
      const parentSvc = info.service;

      const stack = [...info.child_ids];
      const visited = new Set<string>();

      while (stack.length > 0) {
        const cid = stack.pop()!;
        if (visited.has(cid)) continue;
        visited.add(cid);

        const cinfo = spanMap.get(cid);
        if (!cinfo) continue;
        if (NOISE_OPERATIONS.has(cinfo.operation)) continue;

        if (isDatabaseSpan(cinfo)) {
          const stmt = cinfo.tags['db.statement'] || cinfo.operation;
          breakdown.push({
            name: cinfo.operation,
            detail: stmt.slice(0, 100),
            type: 'database',
            duration_us: cinfo.duration_us,
            duration_str: cinfo.duration,
          });
        } else if (cinfo.service !== parentSvc) {
          const m = cinfo.tags['http.request.method'] || cinfo.tags['http.method'] || 'HTTP';
          breakdown.push({
            name: `→ ${cinfo.service}`,
            detail: `${m} ${cinfo.operation}`,
            type: 'downstream',
            duration_us: cinfo.duration_us,
            duration_str: cinfo.duration,
          });
        } else {
          stack.push(...cinfo.child_ids);
        }
      }

      breakdown.sort((a, b) => b.duration_us - a.duration_us);
      return breakdown.slice(0, 8);
    }

    // Edges
    const edges: any[] = [];
    let edgeCounter = 0;

    const rootInfo = spanMap.get(rootSpan.spanID);
    const rootTags = rootInfo?.tags || {};
    const clientIp = rootTags['client.address'] || rootTags['network.peer.address'] || 'Client';
    const clientNodeId = 'client_entry';
    const clientNodeLabel = clientIp !== 'Client' ? `👤 Client\n${clientIp}` : '👤 Client';

    edgeCounter++;
    edges.push({
      id: `edge_${edgeCounter}`,
      from: clientNodeId,
      from_label: clientNodeLabel,
      to: rootInfo.service,
      to_label: rootInfo.service,
      method: String(rootTags['http.request.method'] || rootTags['http.method'] || 'REQ'),
      endpoint: String(rootTags['http.route'] || rootTags['url.path'] || rootTags['http.url'] || rootInfo.operation),
      full_url: String(rootTags['url.full'] || rootTags['http.url'] || ''),
      duration_us: rootInfo.duration_us,
      duration_str: rootInfo.duration,
      status_code: String(rootTags['http.response.status_code'] || rootTags['http.status_code'] || (rootInfo.has_error ? 500 : 200)),
      has_error: rootInfo.has_error,
      server_address: String(rootTags['server.address'] || rootTags['network.peer.address'] || 'N/A'),
      server_port: String(rootTags['server.port'] || rootTags['network.peer.port'] || ''),
      request_headers: rootTags['http.request.headers'] || '',
      response_headers: rootTags['http.response.headers'] || '',
      request_body: extractRequestBody(rootTags, rootInfo.logs),
      response_body: extractResponseBody(rootTags, rootInfo.logs),
      span_id: rootInfo.span_id,
      breakdown: computeSpanBreakdown(rootInfo.span_id),
      error_info: rootInfo.has_error ? extractErrorInfo(rootInfo) : null,
    });

    for (const [sid, info] of spanMap.entries()) {
      if (sid === rootInfo.span_id) continue;
      if (!info.parent_id || !spanMap.has(info.parent_id)) continue;

      const parent = spanMap.get(info.parent_id);
      if (parent.service === info.service) continue;
      if (NOISE_OPERATIONS.has(info.operation)) continue;
      if (isDatabaseSpan(info)) continue;

      const tags = info.tags;
      const pTags = parent.tags;

      const method = String(tags['http.request.method'] || tags['http.method'] || pTags['http.request.method'] || pTags['http.method'] || 'CALL');
      const endpoint = String(tags['http.route'] || tags['url.path'] || tags['http.url'] || info.operation);
      const fullUrl = String(tags['url.full'] || tags['http.url'] || pTags['url.full'] || '');
      const statusCode = String(tags['http.response.status_code'] || tags['http.status_code'] || pTags['http.response.status_code'] || pTags['http.status_code'] || (info.has_error ? '500' : '200'));
      const hasErr = info.has_error || parent.has_error || (Number(statusCode) >= 400);

      const serverAddress = String(tags['server.address'] || tags['network.peer.address'] || pTags['server.address'] || pTags['network.peer.address'] || 'Internal');
      const serverPort = String(tags['server.port'] || tags['network.peer.port'] || pTags['server.port'] || pTags['network.peer.port'] || '');

      edgeCounter++;
      edges.push({
        id: `edge_${edgeCounter}`,
        from: parent.service,
        from_label: parent.service,
        to: info.service,
        to_label: info.service,
        method,
        endpoint,
        full_url: fullUrl,
        duration_us: info.duration_us,
        duration_str: info.duration,
        status_code: statusCode,
        has_error: hasErr,
        server_address: serverAddress,
        server_port: serverPort,
        request_headers: tags['http.request.headers'] || pTags['http.request.headers'] || '',
        response_headers: tags['http.response.headers'] || pTags['http.response.headers'] || '',
        request_body: extractRequestBody(tags, info.logs) || extractRequestBody(pTags, parent.logs),
        response_body: extractResponseBody(tags, info.logs) || extractResponseBody(pTags, parent.logs),
        span_id: sid,
        breakdown: computeSpanBreakdown(sid),
        error_info: hasErr ? (info.has_error ? extractErrorInfo(info) : extractErrorInfo(parent)) : null,
      });
    }

    // Build services data
    const servicesData: Record<string, any> = {};
    for (const [svc, sList] of serviceSpans.entries()) {
      const totalTimeUs = sList.filter((s) => !NOISE_OPERATIONS.has(s.operation)).reduce((acc, s) => acc + s.duration_us, 0);
      const maxSpanUs = Math.max(...sList.map((s) => s.duration_us));
      const errCount = sList.filter((s) => s.has_error).length;

      const dbCalls = serviceDbCalls.get(svc) || [];
      const totalDbTimeUs = dbCalls.reduce((acc, d) => acc + d.duration_us, 0);
      let slowestDb: any = null;
      if (dbCalls.length > 0) {
        const sDb = dbCalls.reduce((prev, curr) => (curr.duration_us > prev.duration_us ? curr : prev), dbCalls[0]);
        slowestDb = {
          operation: sDb.operation,
          duration_us: sDb.duration_us,
          duration_str: sDb.duration,
          statement: sDb.tags['db.statement'] || sDb.operation,
          db_system: sDb.tags['db.system'] || 'DB',
        };
      }

      const formattedDbCalls = [...dbCalls]
        .sort((a, b) => b.duration_us - a.duration_us)
        .map((d) => ({
          operation: d.operation,
          duration_us: d.duration_us,
          duration_str: d.duration,
          statement: d.tags['db.statement'] || d.operation,
          db_system: d.tags['db.system'] || 'DB',
          span_id: d.span_id,
        }));

      const outgoing = edges.filter((e) => e.from === svc);

      servicesData[svc] = {
        name: svc,
        span_count: sList.length,
        max_duration_us: maxSpanUs,
        max_duration_str: formatDuration(maxSpanUs),
        total_time_us: totalTimeUs,
        total_time_str: formatDuration(totalTimeUs),
        has_error: errCount > 0,
        error_count: errCount,
        errors: serviceErrors.get(svc) || [],
        servers: Array.from(serviceServers.get(svc) || []),
        db_summary: {
          count: dbCalls.length,
          total_duration_us: totalDbTimeUs,
          total_duration_str: formatDuration(totalDbTimeUs),
          slowest: slowestDb,
          calls: formattedDbCalls,
        },
        outgoing_count: outgoing.length,
      };
    }

    // Build timeline items (with ONLY 1 representative DB call per service)
    const timelineItems: any[] = [];
    const sortedSpans = Array.from(spanMap.values())
      .filter((s) => !NOISE_OPERATIONS.has(s.operation))
      .sort((a, b) => a.start_time - b.start_time);

    const dbServicesRendered = new Set<string>();

    for (const s of sortedSpans) {
      const isDb = isDatabaseSpan(s);
      const svc = s.service;

      if (isDb) {
        if (dbServicesRendered.has(svc)) continue;
        const slowest = servicesData[svc]?.db_summary?.slowest;
        if (!slowest || s.operation !== slowest.operation) continue;
        dbServicesRendered.add(svc);
      }

      const startOffsetUs = s.start_time - traceStartUs;
      const startPct = Math.max(0.0, Math.min(100.0, (startOffsetUs / totalTraceDurationUs) * 100.0));
      const widthPct = Math.max(0.6, Math.min(100.0 - startPct, (s.duration_us / totalTraceDurationUs) * 100.0));

      const matchedEdge = edges.find((e) => e.span_id === s.span_id);

      timelineItems.push({
        span_id: s.span_id,
        service: svc,
        operation: s.operation,
        type: isDb ? 'database' : 'service',
        is_db: isDb,
        start_pct: Number(startPct.toFixed(2)),
        width_pct: Number(widthPct.toFixed(2)),
        start_offset_str: `+${formatDuration(startOffsetUs)}`,
        duration_str: s.duration,
        duration_us: s.duration_us,
        has_error: s.has_error,
        edge_id: matchedEdge ? matchedEdge.id : null,
      });
    }

    const analysis = {
      trace_id: rawTrace.traceID || rootSpan.traceID || traceId,
      start_time_iso: timeIso,
      total_duration_us: totalTraceDurationUs,
      total_duration_str: formatDuration(totalTraceDurationUs),
      span_count: rawSpans.length,
      client_node: {
        id: clientNodeId,
        label: clientNodeLabel,
        ip: clientIp,
      },
      services: servicesData,
      edges,
      timeline: timelineItems,
    };

    const mermaid = generateMermaid(analysis);

    return NextResponse.json({
      success: true,
      data: {
        ...analysis,
        mermaid,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Failed to fetch or parse trace: ${error.message}` },
      { status: 500 }
    );
  }
}
