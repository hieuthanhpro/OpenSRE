import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function resolveOpenWikiDir(): string {
  const possiblePaths = [
    process.env.OPENWIKI_DIR,
    path.resolve(process.cwd(), '..', 'open-wiki'),
    path.resolve(process.cwd(), 'open-wiki'),
    '/home/hieudq/Documents/openSRE/OpenSRE/open-wiki',
    '/app/open-wiki',
  ].filter(Boolean) as string[];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), '..', 'open-wiki');
}

function parseYamlFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, any> = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentKey = '';
  let inArray = false;
  let inSources = false;
  let currentSourceItem: Record<string, any> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (inSources && line.startsWith('  - id:')) {
      currentSourceItem = { id: trimmed.replace(/^- id:\s*/, '').replace(/['"]/g, '') };
      if (!frontmatter.sources) frontmatter.sources = [];
      frontmatter.sources.push(currentSourceItem);
      continue;
    }
    if (inSources && currentSourceItem && line.startsWith('    resource:')) {
      currentSourceItem.resource = trimmed.replace(/^resource:\s*/, '').replace(/['"]/g, '');
      continue;
    }

    const inlineArrayMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*\[(.*)\]$/);
    if (inlineArrayMatch) {
      const key = inlineArrayMatch[1];
      const items = inlineArrayMatch[2]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      frontmatter[key] = items;
      inArray = false;
      inSources = false;
      continue;
    }

    const startArrayMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*$/);
    if (startArrayMatch) {
      currentKey = startArrayMatch[1];
      if (currentKey === 'sources') {
        inSources = true;
        inArray = false;
      } else {
        inArray = true;
        inSources = false;
        frontmatter[currentKey] = [];
      }
      continue;
    }

    if (inArray && trimmed.startsWith('- ')) {
      const val = trimmed.replace(/^- /, '').replace(/^['"]|['"]$/g, '');
      if (frontmatter[currentKey]) {
        frontmatter[currentKey].push(val);
      }
      continue;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      inArray = false;
      inSources = false;
      const key = kvMatch[1];
      let val = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

function extractMermaids(content: string): Array<{ index: number; code: string; title: string }> {
  const mermaids: Array<{ index: number; code: string; title: string }> = [];
  const regex = /```mermaid\s*([\s\S]*?)```/g;
  let match;
  let index = 1;

  while ((match = regex.exec(content)) !== null) {
    const code = match[1].trim();
    // Guess diagram type
    let title = `Diagram #${index}`;
    if (code.startsWith('sequenceDiagram')) title = `Sequence Diagram #${index}`;
    else if (code.startsWith('graph') || code.startsWith('flowchart')) title = `Architecture Flow #${index}`;
    else if (code.startsWith('classDiagram')) title = `Class Diagram #${index}`;
    else if (code.startsWith('stateDiagram')) title = `State Diagram #${index}`;

    mermaids.push({
      index,
      code,
      title,
    });
    index++;
  }

  return mermaids;
}

function extractHeadings(content: string): Array<{ level: number; text: string; slug: string }> {
  const headings: Array<{ level: number; text: string; slug: string }> = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim().replace(/[*`_]/g, '');
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      headings.push({ level, text, slug });
    }
  }
  return headings;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const docPath = searchParams.get('path');

    if (!service || !docPath) {
      return NextResponse.json(
        { error: 'Cần cung cấp tham số "service" và "path"' },
        { status: 400 }
      );
    }

    // Prevent directory traversal
    if (service.includes('..') || docPath.includes('..')) {
      return NextResponse.json({ error: 'Đường dẫn không hợp lệ' }, { status: 400 });
    }

    const wikiDir = resolveOpenWikiDir();
    const fullFilePath = path.join(wikiDir, service, docPath);

    if (!fs.existsSync(fullFilePath) || !fs.statSync(fullFilePath).isFile()) {
      return NextResponse.json(
        { error: `Tài liệu không tồn tại: ${service}/${docPath}` },
        { status: 404 }
      );
    }

    const rawContent = fs.readFileSync(fullFilePath, 'utf-8');
    const stat = fs.statSync(fullFilePath);
    const { frontmatter, body } = parseYamlFrontmatter(rawContent);
    const mermaids = extractMermaids(rawContent);
    const headings = extractHeadings(body);

    const words = body.trim().split(/\s+/).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

    return NextResponse.json({
      success: true,
      service,
      path: docPath,
      frontmatter,
      title: frontmatter.title || headings.find((h) => h.level === 1)?.text || path.basename(docPath, '.md'),
      description: frontmatter.description || '',
      type: frontmatter.type || 'document',
      tags: frontmatter.tags || [],
      sources: frontmatter.sources || [],
      content: body,
      rawContent,
      mermaids,
      headings,
      stats: {
        words,
        readingTimeMinutes,
        lines: rawContent.split(/\r?\n/).length,
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching wiki doc:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi đọc tài liệu' },
      { status: 500 }
    );
  }
}
