export interface DocMetadata {
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
}

export interface CategoryInfo {
  id: string;
  name: string;
  docCount: number;
  docs: DocMetadata[];
}

export interface ServiceInfo {
  id: string;
  name: string;
  rawName: string;
  description: string;
  categories: CategoryInfo[];
  totalDocs: number;
  totalMermaid: number;
  tags: string[];
  dependencies: Array<{ name: string; type: 'internal' | 'external' | 'db' }>;
}

export interface DocDetail {
  service: string;
  path: string;
  frontmatter: Record<string, any>;
  title: string;
  description: string;
  type: string;
  tags: string[];
  sources: Array<{ id: string; resource: string }>;
  content: string;
  rawContent: string;
  mermaids: Array<{ index: number; code: string; title: string }>;
  headings: Array<{ level: number; text: string; slug: string }>;
  stats: {
    words: number;
    readingTimeMinutes: number;
    lines: number;
    sizeBytes: number;
    lastModified: string;
  };
}

export type OpenWikiTab = 'dashboard' | 'explorer' | 'graph';
