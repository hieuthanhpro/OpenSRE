import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  DocMetadata,
  CategoryInfo,
  ServiceInfo,
  DatabaseInstanceInfo,
  DatabaseSchemaInfo,
  WikiLayer,
} from '@/components/openwiki/types';

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

  if (clean === 'openwiki') {
    return { name: 'Toàn cảnh Hệ thống (System Overview)', cleanId: 'openwiki' };
  } else if (clean === 'msp') {
    return { name: 'MSP (Merchant Service Provider)', cleanId: clean };
  } else if (clean === 'wsp') {
    return { name: 'WSP (Web Service Provider)', cleanId: clean };
  } else if (clean === 'onesm') {
    return { name: 'OneSM (Security Manager & Crypto)', cleanId: clean };
  } else if (clean === 'tvsp') {
    return { name: 'TVSP (Token Vault Service Provider)', cleanId: clean };
  } else if (clean === 'scsp') {
    return { name: 'SCSP (Smart Card Service Provider)', cleanId: clean };
  } else if (clean.includes('psp-connector')) {
    return {
      name: 'PSP Connector (' + clean.replace('psp-connector-', '').toUpperCase() + ')',
      cleanId: clean,
    };
  }

  const title = clean
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { name: title, cleanId: clean };
}

function formatDatabaseInstance(dirName: string): { name: string; description: string } {
  const map: Record<string, { name: string; description: string }> = {
    prod_112: {
      name: 'Prod 112 (Core Gateway & Portals DB)',
      description:
        'Oracle prod_112: Cổng thanh toán core, Payout, Invoicing, Fraud, Monitoring & Merchant Portals (~600 objects, 24 schemas)',
    },
    prod_114: {
      name: 'Prod 114 (Reporting & Accounting DB)',
      description:
        'Oracle prod_114: PL/SQL packages cho Merchant Portal, Accounting, OneData, OneCrypto, OneFraud, OneCredit, OneCDR, OneFin',
    },
    prod_118: {
      name: 'Prod 118 (Core PL/SQL Schemas & Settlement DB)',
      description:
        'Oracle prod_118: 9 schemas cốt lõi (DISPUTE, IPN, ONECDR, ONEDATA, ONEFIN, ONEFRAUD, ONEMON, ONEPARTNER, ONEREPORT) & phụ thuộc chéo',
    },
    prod_124: {
      name: 'Prod 124 (Billing & Portal PL/SQL DB)',
      description:
        'Oracle prod_124: PL/SQL procedures & packages cho ONEBILL, ONEMON, ONEPORTAL, MERCHANTPORTAL, PAYCOLLECT',
    },
  };

  return (
    map[dirName] || {
      name: dirName.replace(/_/g, ' ').toUpperCase(),
      description: `Oracle Database Instance ${dirName}`,
    }
  );
}

const CATEGORY_NAMES_MAP: Record<string, string> = {
  architecture: 'Kiến trúc (Architecture)',
  concepts: 'Khái niệm & Mô hình (Concepts)',
  integrations: 'Tích hợp kết nối (Integrations)',
  operations: 'Vận hành & Cấu hình (Operations)',
  workflows: 'Luồng nghiệp vụ (Workflows)',
  testing: 'Kiểm thử (Testing)',
  schemas: 'Cấu trúc Schemas (Schemas)',
  functions: 'Hàm & Thủ tục (Functions & Procedures)',
  reference: 'Tham chiếu & Mã khoá (Reference)',
  database: 'Tài liệu Gói PL/SQL (PL/SQL Packages)',
  overview: 'Tổng quan & Phương pháp luận (Overview)',
};

// Scan a single markdown file into DocMetadata
function scanMarkdownDoc(
  filePath: string,
  relativePath: string,
  id: string,
  categoryType: string,
  layer: WikiLayer,
  databaseInstance?: string
): DocMetadata | null {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseYamlFrontmatter(content);
    const mermaidCount = countMermaidDiagrams(content);
    const headings = extractHeadings(body);

    let title = frontmatter.title;
    if (!title) {
      const h1 = headings.find((h) => h.level === 1);
      title = h1 ? h1.text : path.basename(filePath, '.md').replace(/[-_]/g, ' ');
    }

    return {
      id,
      path: relativePath,
      relativePath,
      title,
      description: frontmatter.description || '',
      type: frontmatter.type || categoryType,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      sources: Array.isArray(frontmatter.sources) ? frontmatter.sources : [],
      hasMermaid: mermaidCount > 0,
      mermaidCount,
      layer,
      databaseInstance,
    };
  } catch (err) {
    console.error(`Failed reading doc ${filePath}:`, err);
    return null;
  }
}

// 1. Scan Service Layer
function scanServices(serviceRoot: string): ServiceInfo[] {
  if (!fs.existsSync(serviceRoot) || !fs.statSync(serviceRoot).isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(serviceRoot, { withFileTypes: true });
  const serviceDirs = entries
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        e.name !== 'database' &&
        e.name !== 'service'
    )
    .map((e) => e.name)
    .sort();

  const services: ServiceInfo[] = [];

  for (const sDir of serviceDirs) {
    const servicePath = path.join(serviceRoot, sDir);
    const { name, cleanId } = formatServiceName(sDir);

    let serviceDescription = '';
    const quickstartPath = path.join(servicePath, 'quickstart.md');
    const sysOverviewPath = path.join(servicePath, 'system-overview.md');
    const indexPath = path.join(servicePath, 'index.md');

    for (const testPath of [quickstartPath, sysOverviewPath, indexPath]) {
      if (fs.existsSync(testPath)) {
        try {
          const content = fs.readFileSync(testPath, 'utf-8');
          const { frontmatter } = parseYamlFrontmatter(content);
          if (frontmatter.description) {
            serviceDescription = frontmatter.description;
            break;
          }
        } catch {}
      }
    }

    if (!serviceDescription) {
      serviceDescription = `Tài liệu kỹ thuật và kiến trúc cho dịch vụ ${name}`;
    }

    const categories: CategoryInfo[] = [];
    let totalDocs = 0;
    let totalMermaid = 0;
    const allTags = new Set<string>();
    const dependenciesSet = new Map<string, 'internal' | 'external' | 'db'>();

    // Scan root-level markdown files (e.g. quickstart.md, system-overview.md, index.md)
    const rootDocs: DocMetadata[] = [];
    const rootFiles = fs.readdirSync(servicePath, { withFileTypes: true });
    for (const rf of rootFiles) {
      if (
        rf.isFile() &&
        rf.name.endsWith('.md') &&
        !['INSTRUCTIONS.md', 'CLAUDE.md', 'AGENTS.md'].includes(rf.name)
      ) {
        const filePath = path.join(servicePath, rf.name);
        const doc = scanMarkdownDoc(filePath, rf.name, rf.name.replace('.md', ''), 'overview', 'service');
        if (doc) {
          rootDocs.push(doc);
          totalDocs++;
          totalMermaid += doc.mermaidCount;
          doc.tags.forEach((t) => allTags.add(t));
        }
      }
    }

    if (rootDocs.length > 0) {
      categories.push({
        id: 'overview',
        name: CATEGORY_NAMES_MAP['overview'] || 'Tổng quan',
        docCount: rootDocs.length,
        docs: rootDocs,
      });
    }

    // Scan subdirectories (architecture, concepts, workflows, etc.)
    const subDirs = rootFiles
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    for (const catName of subDirs) {
      const catPath = path.join(servicePath, catName);
      let catFiles: string[] = [];
      try {
        catFiles = fs.readdirSync(catPath).filter((f) => f.endsWith('.md')).sort();
      } catch {
        continue;
      }

      const docs: DocMetadata[] = [];

      for (const file of catFiles) {
        const filePath = path.join(catPath, file);
        const relPath = `${catName}/${file}`;
        const doc = scanMarkdownDoc(filePath, relPath, `${catName}/${file.replace('.md', '')}`, catName, 'service');

        if (doc) {
          docs.push(doc);
          totalDocs++;
          totalMermaid += doc.mermaidCount;
          doc.tags.forEach((t) => allTags.add(t));

          // Detect dependencies
          if (catName === 'integrations') {
            if (file.includes('napas')) dependenciesSet.set('NAPAS Gateway', 'external');
            if (file.includes('bank')) dependenciesSet.set('Banking System', 'external');
            if (file.includes('apple')) dependenciesSet.set('Apple Pay', 'external');
            if (file.includes('onecomm')) dependenciesSet.set('OneComm Core', 'external');
            if (file.includes('fraud')) dependenciesSet.set('Fraud Service Provider (FSP)', 'external');
          }
          if (doc.description.includes('Database') || doc.description.includes('Oracle')) {
            dependenciesSet.set('Oracle Database', 'db');
          }
        }
      }

      if (docs.length > 0) {
        categories.push({
          id: catName,
          name: CATEGORY_NAMES_MAP[catName] || catName.charAt(0).toUpperCase() + catName.slice(1),
          docCount: docs.length,
          docs,
        });
      }
    }

    // Default dependency heuristics
    if (sDir.includes('msp')) {
      dependenciesSet.set('Oracle prod_112', 'db');
      dependenciesSet.set('TVSP Vault', 'internal');
      dependenciesSet.set('OneSM Crypto', 'internal');
    }
    if (sDir.includes('wsp')) {
      dependenciesSet.set('MSP Core Engine', 'internal');
      dependenciesSet.set('OneSM Crypto', 'internal');
    }

    const dependencies: Array<{ name: string; type: 'internal' | 'external' | 'db' }> = [];
    dependenciesSet.forEach((type, depName) => {
      dependencies.push({ name: depName, type });
    });

    services.push({
      id: sDir,
      name,
      rawName: sDir,
      description: serviceDescription,
      categories,
      totalDocs,
      totalMermaid,
      tags: Array.from(allTags),
      dependencies,
      layer: 'service',
    });
  }

  return services;
}

// 2. Scan Database Layer
function scanDatabases(dbRoot: string): DatabaseInstanceInfo[] {
  if (!fs.existsSync(dbRoot) || !fs.statSync(dbRoot).isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(dbRoot, { withFileTypes: true });
  const dbDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();

  const instances: DatabaseInstanceInfo[] = [];

  for (const dbDir of dbDirs) {
    const rawPath = path.join(dbRoot, dbDir);
    // If there's an inner `openwiki` folder, that is the root of the wiki docs
    const instWikiDir = fs.existsSync(path.join(rawPath, 'openwiki'))
      ? path.join(rawPath, 'openwiki')
      : rawPath;

    const { name, description } = formatDatabaseInstance(dbDir);

    const categories: CategoryInfo[] = [];
    let totalDocs = 0;
    let totalMermaid = 0;
    const allTags = new Set<string>();

    // 1. Root files in instWikiDir (e.g. index.md, cross-schema-dependencies.md, methodology.md)
    const rootFiles = fs.readdirSync(instWikiDir, { withFileTypes: true });
    const rootDocs: DocMetadata[] = [];

    for (const rf of rootFiles) {
      if (
        rf.isFile() &&
        rf.name.endsWith('.md') &&
        !['INSTRUCTIONS.md', 'CLAUDE.md', 'AGENTS.md'].includes(rf.name)
      ) {
        const filePath = path.join(instWikiDir, rf.name);
        const doc = scanMarkdownDoc(
          filePath,
          rf.name,
          `${dbDir}/${rf.name.replace('.md', '')}`,
          'overview',
          'database',
          dbDir
        );
        if (doc) {
          rootDocs.push(doc);
          totalDocs++;
          totalMermaid += doc.mermaidCount;
          doc.tags.forEach((t) => allTags.add(t));
        }
      }
    }

    if (rootDocs.length > 0) {
      categories.push({
        id: 'overview',
        name: CATEGORY_NAMES_MAP['overview'] || 'Tổng quan',
        docCount: rootDocs.length,
        docs: rootDocs,
      });
    }

    // 2. Subdirectories in instWikiDir (architecture, schemas, functions, database, workflows, reference)
    const subDirs = rootFiles
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '.claims')
      .map((e) => e.name)
      .sort();

    for (const catName of subDirs) {
      const catPath = path.join(instWikiDir, catName);
      let catFiles: string[] = [];
      try {
        catFiles = fs.readdirSync(catPath).filter((f) => f.endsWith('.md')).sort();
      } catch {
        continue;
      }

      const docs: DocMetadata[] = [];

      for (const file of catFiles) {
        const filePath = path.join(catPath, file);
        const relPath = `${catName}/${file}`;
        const doc = scanMarkdownDoc(
          filePath,
          relPath,
          `${dbDir}/${catName}/${file.replace('.md', '')}`,
          catName,
          'database',
          dbDir
        );
        if (doc) {
          docs.push(doc);
          totalDocs++;
          totalMermaid += doc.mermaidCount;
          doc.tags.forEach((t) => allTags.add(t));
        }
      }

      if (docs.length > 0) {
        categories.push({
          id: catName,
          name: CATEGORY_NAMES_MAP[catName] || catName.charAt(0).toUpperCase() + catName.slice(1),
          docCount: docs.length,
          docs,
        });
      }
    }

    // Build Schema Inventory for this DB instance
    const schemas: DatabaseSchemaInfo[] = [];
    const schemaMap: Record<string, { docs: DocMetadata[]; tags: Set<string> }> = {};

    // Group docs by schema where identifiable
    categories.forEach((cat) => {
      cat.docs.forEach((doc) => {
        // e.g. msp-schema.md, msp-functions.md -> MSP
        const base = path.basename(doc.path, '.md').toLowerCase();
        let schemaKey = '';
        if (base.includes('msp')) schemaKey = 'MSP';
        else if (base.includes('payment2')) schemaKey = 'PAYMENT2';
        else if (base.includes('onecredit')) schemaKey = 'ONECREDIT';
        else if (base.includes('onefraud')) schemaKey = 'ONEFRAUD';
        else if (base.includes('onemon')) schemaKey = 'ONEMON';
        else if (base.includes('onepayout')) schemaKey = 'ONEPAYOUT';
        else if (base.includes('oneportal')) schemaKey = 'ONEPORTAL';
        else if (base.includes('onedata')) schemaKey = 'ONEDATA';
        else if (base.includes('onefin')) schemaKey = 'ONEFIN';
        else if (base.includes('onecdr')) schemaKey = 'ONECDR';
        else if (base.includes('dispute')) schemaKey = 'DISPUTE';
        else if (base.includes('ipn')) schemaKey = 'IPN';
        else if (base.includes('invoice')) schemaKey = 'ONEINVOICE';
        else if (base.includes('onepartner')) schemaKey = 'ONEPARTNER';
        else if (base.includes('merchantportal')) schemaKey = 'MERCHANTPORTAL';
        else if (base.includes('onebill')) schemaKey = 'ONEBILL';
        else if (base.includes('paycollect')) schemaKey = 'PAYCOLLECT';

        if (schemaKey) {
          if (!schemaMap[schemaKey]) {
            schemaMap[schemaKey] = { docs: [], tags: new Set() };
          }
          schemaMap[schemaKey].docs.push(doc);
          doc.tags.forEach((t) => schemaMap[schemaKey].tags.add(t));
        }
      });
    });

    Object.entries(schemaMap).forEach(([schemaName, data]) => {
      let schemaMermaid = 0;
      data.docs.forEach((d) => (schemaMermaid += d.mermaidCount));

      schemas.push({
        id: schemaName.toLowerCase(),
        name: schemaName,
        instanceId: dbDir,
        categories: [
          {
            id: 'docs',
            name: `Tài liệu schema ${schemaName}`,
            docCount: data.docs.length,
            docs: data.docs,
          },
        ],
        totalDocs: data.docs.length,
        totalMermaid: schemaMermaid,
        tags: Array.from(data.tags),
      });
    });

    instances.push({
      id: dbDir,
      name,
      rawName: dbDir,
      description,
      path: instWikiDir,
      schemas,
      categories,
      totalDocs,
      totalMermaid,
      tags: Array.from(allTags),
    });
  }

  return instances;
}

export async function GET() {
  try {
    const wikiDir = resolveOpenWikiDir();
    if (!fs.existsSync(wikiDir)) {
      return NextResponse.json(
        { error: `Thư mục open-wiki không tồn tại tại: ${wikiDir}`, services: [], dbInstances: [], wikiDir },
        { status: 404 }
      );
    }

    // Determine roots
    const serviceRoot = fs.existsSync(path.join(wikiDir, 'service'))
      ? path.join(wikiDir, 'service')
      : wikiDir;
    const databaseRoot = path.join(wikiDir, 'database');

    const services = scanServices(serviceRoot);
    const dbInstances = scanDatabases(databaseRoot);

    return NextResponse.json({
      success: true,
      wikiDir,
      totalServices: services.length,
      totalDatabases: dbInstances.length,
      scannedAt: new Date().toISOString(),
      // Backward compatible arrays
      services,
      dbInstances,
      // Layer-oriented format
      layers: {
        service: {
          totalServices: services.length,
          services,
        },
        database: {
          totalInstances: dbInstances.length,
          instances: dbInstances,
        },
      },
    });
  } catch (error: any) {
    console.error('Error scanning open-wiki directory:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi quét thư mục open-wiki' },
      { status: 500 }
    );
  }
}
