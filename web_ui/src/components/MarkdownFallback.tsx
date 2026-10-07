'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { MermaidBlock } from '@/components/openwiki/MermaidBlock';

const MERMAID_START = /^\s*(sequenceDiagram|flowchart(\s+[A-Za-z]+)?|graph(\s+[A-Za-z]+)?|stateDiagram(-v2)?|classDiagram|erDiagram|gantt|pie|gitGraph)\s*$/m;

function isMermaidCode(code: string): boolean {
  if (!code) return false;
  return MERMAID_START.test(code.trim());
}

/**
 * Preprocess markdown content to auto-fence raw Mermaid diagram blocks if the LLM
 * emitted them without triple-backtick markdown fencing.
 */
function preprocessMermaidInMarkdown(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const result: string[] = [];
  let inFencedBlock = false;
  let inAutoMermaid = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inAutoMermaid) {
        result.push('```');
        inAutoMermaid = false;
      }
      inFencedBlock = !inFencedBlock;
      result.push(line);
      continue;
    }

    if (!inFencedBlock && !inAutoMermaid && MERMAID_START.test(trimmed)) {
      result.push('```mermaid');
      result.push(line);
      inAutoMermaid = true;
      continue;
    }

    if (inAutoMermaid) {
      if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('> ') ||
        trimmed.startsWith('- ') ||
        trimmed.startsWith('* ') ||
        trimmed.startsWith('1. ')
      ) {
        result.push('```');
        inAutoMermaid = false;
        result.push(line);
        continue;
      }
    }

    result.push(line);
  }

  if (inAutoMermaid) {
    result.push('```');
  }

  return result.join('\n');
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-stone-900 dark:text-white mb-3 mt-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-stone-900 dark:text-white mb-2 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-stone-800 dark:text-stone-200 mb-1.5 mt-2">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-stone-700 dark:text-stone-300 mb-2 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-stone-700 dark:text-stone-300 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-stone-700 dark:text-stone-300 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-stone-900 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-stone-600 dark:text-stone-400">{children}</em>,
  code: ({ children, className, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1].toLowerCase() : '';
    const codeString = String(children).replace(/\n$/, '');

    // Render Mermaid diagrams directly using interactive MermaidBlock
    if (lang === 'mermaid' || isMermaidCode(codeString)) {
      return (
        <div className="my-3 not-prose w-full">
          <MermaidBlock code={codeString} />
        </div>
      );
    }

    const isBlock = Boolean(className?.includes('language-') || String(children).includes('\n'));
    if (isBlock) {
      return (
        <div className="my-2 rounded-lg bg-stone-100 dark:bg-stone-800 p-3 overflow-x-auto border border-stone-200 dark:border-stone-700">
          <code className="text-xs font-mono text-stone-800 dark:text-stone-200 whitespace-pre">
            {children}
          </code>
        </div>
      );
    }

    return (
      <code className="bg-stone-100 dark:bg-stone-700 rounded px-1.5 py-0.5 text-xs font-mono text-stone-800 dark:text-stone-200">
        {children}
      </code>
    );
  },
  pre: ({ children }: any) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-stone-300 dark:border-stone-600 pl-3 text-sm text-stone-600 dark:text-stone-400 italic mb-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-stone-200 dark:border-stone-600 my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 px-2 py-1 text-left text-xs font-semibold text-stone-700 dark:text-stone-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-stone-200 dark:border-stone-600 px-2 py-1 text-sm text-stone-700 dark:text-stone-300">
      {children}
    </td>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  const processedContent = preprocessMermaidInMarkdown(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {processedContent}
    </ReactMarkdown>
  );
}

export default function MarkdownFallback({
  content,
  bare = false,
}: {
  content: string;
  bare?: boolean;
}) {
  if (bare) {
    return <MarkdownContent content={content} />;
  }

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-stone-600 bg-white dark:bg-stone-800 p-4">
      <MarkdownContent content={content} />
    </div>
  );
}
