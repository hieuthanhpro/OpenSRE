import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface DocMetadata {
  id: string;
  path: string;
  relativePath: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  sources: Array<{ id: string; resource: string }>;
  hasMermaid: boolean;
  mermaidCount: number;
  headings: Array<{ level: number; text: string; slug: string }>;
  verified?: Array<{ by: string; at: string }>;
  generated?: { by: string; at: string };
  sizeBytes: number;
  lastModified: string;
}

interface CategoryInfo {
  id: string;
  name: string;
  docCount: number;
  docs: DocMetadata[];
}

interface ServiceInfo {
  id: string;
  name: string;
  rawName: string;
  description: string;
  path: string;
  categories: CategoryInfo[];
  totalDocs: number;
  totalMermaid: number;
  hasQuickstart: boolean;
  tags: string[];
  dependencies: Array<{ name: string; type: 'internal' | 'external' | 'db' }>;
}

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

    // Source list item handling
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

    // Array inline: tags: [a, b, c]
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

    // Start of block array
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

    // Key-value pair
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

function countMermaidDiagrams(content: string): number {
  const matches = content.match(/```mermaid/g);
  return matches ? matches.length : 0;
}

function formatServiceName(dirName: string): { name: string; cleanId: string } {
  let clean = dirName;
  if (clean.startsWith('openwiki-')) {
    clean = clean.replace(/^openwiki-/, '');
  }

  const upper = clean.toUpperCase();
  if (clean === 'msp') {
    return { name: 'MSP (Merchant Service Provider)', cleanId: clean };
  } else if (clean === 'wsp') {
    return { name: 'WSP (Web Service Provider)', cleanId: clean };
  } else if (clean.includes('psp-connector')) {
    return { name: 'PSP Connector (' + clean.replace('psp-connector-', '').toUpperCase() + ')', cleanId: clean };
  }

  // Capitalize hyphenated words
  const title = clean
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { name: title, cleanId: clean };
}

export async function GET(request: Request) {
  try {
    const wikiDir = resolveOpenWikiDir();
    if (!fs.existsSync(wikiDir)) {
      return NextResponse.json(
        { error: `Thư mục open-wiki không tồn tại tại: ${wikiDir}`, services: [], wikiDir },
        { status: 404 }
      );
    }

    const entries = fs.readdirSync(wikiDir, { withFileTypes: true });
    // Filter directories, ignore hidden dirs (.git, .cache, etc.)
    const serviceDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    const services: ServiceInfo[] = [];

    for (const sDir of serviceDirs) {
      const servicePath = path.join(wikiDir, sDir);
      const { name, cleanId } = formatServiceName(sDir);

      let serviceDescription = '';
      let quickstartPath = path.join(servicePath, 'quickstart.md');
      let hasQuickstart = false;

      if (fs.existsSync(quickstartPath)) {
        hasQuickstart = true;
        try {
          const qsContent = fs.readFileSync(quickstartPath, 'utf-8');
          const { frontmatter } = parseYamlFrontmatter(qsContent);
          if (frontmatter.description) {
            serviceDescription = frontmatter.description;
          }
        } catch {}
      }

      if (!serviceDescription) {
        // Try index.md
        const indexPath = path.join(servicePath, 'index.md');
        if (fs.existsSync(indexPath)) {
          try {
            const idxContent = fs.readFileSync(indexPath, 'utf-8');
            const lines = idxContent.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
            if (lines.length > 0) serviceDescription = lines[0].trim();
          } catch {}
        }
      }

      if (!serviceDescription) {
        serviceDescription = `Tài liệu kỹ thuật và kiến trúc cho dịch vụ ${name}`;
      }

      // Scan categories
      const subEntries = fs.readdirSync(servicePath, { withFileTypes: true });
      const categoryDirs = subEntries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();

      const categories: CategoryInfo[] = [];
      let totalDocs = 0;
      let totalMermaid = 0;
      const allTags = new Set<string>();
      const dependenciesSet = new Map<string, 'internal' | 'external' | 'db'>();

      // Check root level quickstart or standalone files
      const rootDocs: DocMetadata[] = [];
      if (hasQuickstart) {
        try {
          const content = fs.readFileSync(quickstartPath, 'utf-8');
          const stat = fs.statSync(quickstartPath);
          const { frontmatter, body } = parseYamlFrontmatter(content);
          const mermaidCount = countMermaidDiagrams(content);
          const headings = extractHeadings(body);

          if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
            frontmatter.tags.forEach((t: string) => allTags.add(t));
          }

          rootDocs.push({
            id: 'quickstart',
            path: 'quickstart.md',
            relativePath: `${sDir}/quickstart.md`,
            title: frontmatter.title || 'Quickstart',
            description: frontmatter.description || 'Tổng quan nhanh về dịch vụ và điều hướng tác vụ.',
            type: frontmatter.type || 'guide',
            tags: frontmatter.tags || [],
            sources: frontmatter.sources || [],
            hasMermaid: mermaidCount > 0,
            mermaidCount,
            headings,
            verified: frontmatter.verified,
            generated: frontmatter.generated,
            sizeBytes: stat.size,
            lastModified: stat.mtime.toISOString(),
          });
          totalDocs++;
          totalMermaid += mermaidCount;
        } catch {}
      }

      if (rootDocs.length > 0) {
        categories.push({
          id: 'overview',
          name: 'Tổng quan (Overview)',
          docCount: rootDocs.length,
          docs: rootDocs,
        });
      }

      for (const catName of categoryDirs) {
        const catPath = path.join(servicePath, catName);
        const files = fs
          .readdirSync(catPath)
          .filter((f) => f.endsWith('.md'))
          .sort();

        const docs: DocMetadata[] = [];

        for (const file of files) {
          const filePath = path.join(catPath, file);
          try {
            const stat = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const { frontmatter, body } = parseYamlFrontmatter(content);
            const mermaidCount = countMermaidDiagrams(content);
            const headings = extractHeadings(body);

            let title = frontmatter.title;
            if (!title) {
              const h1 = headings.find((h) => h.level === 1);
              title = h1 ? h1.text : file.replace('.md', '').replace(/[-_]/g, ' ');
            }

            if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
              frontmatter.tags.forEach((t: string) => allTags.add(t));
            }

            // Detect dependencies from integrations & concepts
            if (catName === 'integrations') {
              if (file.includes('napas')) dependenciesSet.set('NAPAS Gateway', 'external');
              if (file.includes('bank')) dependenciesSet.set('Banking System', 'external');
              if (file.includes('apple')) dependenciesSet.set('Apple Pay', 'external');
              if (file.includes('onecomm')) dependenciesSet.set('OneComm Core', 'external');
              if (file.includes('fraud')) dependenciesSet.set('Fraud Service Provider (FSP)', 'external');
            }
            if (content.includes('Database') || content.includes('Oracle') || content.includes('Postgres')) {
              dependenciesSet.set('Database Storage', 'db');
            }
            if (content.includes('PSPConnector') || content.includes('PSP Connector')) {
              dependenciesSet.set('PSP Connector', 'internal');
            }
            if (content.includes('MSP') && sDir !== 'openwiki-msp') {
              dependenciesSet.set('MSP Core Engine', 'internal');
            }

            docs.push({
              id: `${catName}/${file.replace('.md', '')}`,
              path: `${catName}/${file}`,
              relativePath: `${sDir}/${catName}/${file}`,
              title,
              description: frontmatter.description || '',
              type: frontmatter.type || catName,
              tags: frontmatter.tags || [],
              sources: frontmatter.sources || [],
              hasMermaid: mermaidCount > 0,
              mermaidCount,
              headings,
              verified: frontmatter.verified,
              generated: frontmatter.generated,
              sizeBytes: stat.size,
              lastModified: stat.mtime.toISOString(),
            });

            totalDocs++;
            totalMermaid += mermaidCount;
          } catch {}
        }

        if (docs.length > 0) {
          const catDisplayName =
            {
              architecture: 'Kiến trúc (Architecture)',
              concepts: 'Khái niệm & Mô hình (Concepts)',
              integrations: 'Tích hợp kết nối (Integrations)',
              operations: 'Vận hành & Cấu hình (Operations)',
              workflows: 'Luồng nghiệp vụ (Workflows)',
              testing: 'Kiểm thử (Testing)',
            }[catName] || catName.charAt(0).toUpperCase() + catName.slice(1);

          categories.push({
            id: catName,
            name: catDisplayName,
            docCount: docs.length,
            docs,
          });
        }
      }

      // Convert dependencies
      const dependencies: Array<{ name: string; type: 'internal' | 'external' | 'db' }> = [];
      dependenciesSet.forEach((type, depName) => {
        dependencies.push({ name: depName, type });
      });

      services.push({
        id: sDir,
        name,
        rawName: sDir,
        description: serviceDescription,
        path: servicePath,
        categories,
        totalDocs,
        totalMermaid,
        hasQuickstart,
        tags: Array.from(allTags),
        dependencies,
      });
    }

    return NextResponse.json({
      success: true,
      wikiDir,
      totalServices: services.length,
      scannedAt: new Date().toISOString(),
      services,
    });
  } catch (error: any) {
    console.error('Error scanning open-wiki directory:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi quét thư mục open-wiki' },
      { status: 500 }
    );
  }
}
