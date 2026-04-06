#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out',
  '__pycache__', '.cache', 'coverage', 'vendor', '.venv', 'venv',
  '.idea', '.vscode', 'target', 'bin', 'obj',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'CODEBASE_INDEX.md',
]);

const SUPPORTED_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.java', '.rb', '.rs',
  '.c', '.cpp', '.h', '.hpp',
  '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.toml', '.env',
  '.sh', '.bash', '.zsh',
  '.md',
]);

const ENTRY_NAMES = new Set([
  'index', 'main', 'app', 'server', 'cli', 'bin',
  '__main__', 'manage', 'wsgi', 'asgi',
]);

const OUTPUT_FILE = 'CODEBASE_INDEX.md';

// ── Flag pattern (all comment styles) ─────────────────────────────────────
// Matches: // @flag: ..., # @flag: ..., <!-- @flag: ... -->, /* @flag: ... */
const FLAG_RE = /(?:\/\/|#|\/\*|<!--)\s*@flag\s*:?\s*(.+?)(?:\s*(?:\*\/|--))?$/i;

// ── Symbol extractors per language ────────────────────────────────────────

const EXTRACTORS = {
  js: extractJS,
  jsx: extractJS,
  ts: extractJS,
  tsx: extractJS,
  mjs: extractJS,
  cjs: extractJS,
  py: extractPython,
  go: extractGo,
  java: extractJava,
  rb: extractRuby,
  rs: extractRust,
};

function extractJS(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t  = line.trim();
    // export function / export async function
    let m = t.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    // export class
    m = t.match(/^export\s+(?:default\s+)?class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    // export const/let/var X = (fn or value)
    m = t.match(/^export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'const', line: ln });
    // export default function (anonymous)
    m = t.match(/^export\s+default\s+(?:async\s+)?function\s*(\w*)/);
    if (m) return symbols.push({ name: m[1] || 'default', kind: 'fn', line: ln });
    // top-level function declaration (not inside a block — indent check)
    m = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    // top-level class
    m = line.match(/^class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    // module.exports
    m = t.match(/^module\.exports\s*=/);
    if (m) return symbols.push({ name: 'module.exports', kind: 'export', line: ln });
  });
  return symbols;
}

function extractPython(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    // Only top-level (no leading spaces)
    let m = line.match(/^def\s+(\w+)\s*\(/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = line.match(/^class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
  });
  return symbols;
}

function extractGo(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    let m = line.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = line.match(/^type\s+(\w+)\s+(?:struct|interface)/);
    if (m) return symbols.push({ name: m[1], kind: 'type', line: ln });
  });
  return symbols;
}

function extractJava(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t  = line.trim();
    let m = t.match(/^(?:public|private|protected|static|\s)+class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    m = t.match(/^(?:public|private|protected|static|final|\s)+\w+\s+(\w+)\s*\(/);
    if (m && m[1] !== 'if' && m[1] !== 'while' && m[1] !== 'for')
      return symbols.push({ name: m[1], kind: 'fn', line: ln });
  });
  return symbols;
}

function extractRuby(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    let m = line.match(/^def\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = line.match(/^class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    m = line.match(/^module\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'module', line: ln });
  });
  return symbols;
}

function extractRust(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t  = line.trim();
    let m = t.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = t.match(/^(?:pub\s+)?struct\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'struct', line: ln });
    m = t.match(/^(?:pub\s+)?enum\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'enum', line: ln });
    m = t.match(/^(?:pub\s+)?trait\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'trait', line: ln });
  });
  return symbols;
}

// ── File walker ───────────────────────────────────────────────────────────

function walk(dir, rootDir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  entries.sort((a, b) => {
    // Dirs first, then files
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const fullPath = path.join(dir, entry.name);
    const relPath  = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, rootDir, results);
    } else {
      if (IGNORE_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext) || entry.name === '.env') {
        results.push({ fullPath, relPath, name: entry.name, ext });
      }
    }
  }
  return results;
}

// ── File analyser ─────────────────────────────────────────────────────────

function analyseFile(file) {
  let content;
  try { content = fs.readFileSync(file.fullPath, 'utf8'); }
  catch { return null; }

  const lines   = content.split('\n');
  const extKey  = file.ext.replace('.', '');
  const extract = EXTRACTORS[extKey];
  const symbols = extract ? extract(lines) : [];

  const flags = [];
  lines.forEach((line, i) => {
    const m = line.match(FLAG_RE);
    if (m) flags.push({ line: i + 1, note: m[1].trim() });
  });

  const baseName = path.basename(file.name, file.ext).toLowerCase();
  const isEntry  = ENTRY_NAMES.has(baseName);

  return { ...file, symbols, flags, isEntry, lineCount: lines.length };
}

// ── Tree builder ──────────────────────────────────────────────────────────

function buildTree(files, rootDir) {
  const tree = {};
  for (const f of files) {
    const parts = f.relPath.split(path.sep);
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null; // leaf
  }
  return renderTree(tree, '');
}

function renderTree(node, prefix) {
  const lines = [];
  const keys  = Object.keys(node).sort((a, b) => {
    const aDir = node[a] !== null;
    const bDir = node[b] !== null;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });
  keys.forEach((key, idx) => {
    const isLast     = idx === keys.length - 1;
    const connector  = isLast ? '└── ' : '├── ';
    const childPfx   = isLast ? '    ' : '│   ';
    lines.push(prefix + connector + key);
    if (node[key] !== null) {
      lines.push(...renderTree(node[key], prefix + childPfx));
    }
  });
  return lines;
}

// ── Markdown generator ────────────────────────────────────────────────────

function kindIcon(kind) {
  return { fn: 'ƒ', class: '◈', const: '■', export: '⇒', type: '◇', struct: '◇', enum: '◆', trait: '◉', module: '⬡' }[kind] || '·';
}

function generateMarkdown(analysed, targetDir) {
  const projectName = path.basename(targetDir);
  const now         = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const totalFiles  = analysed.length;
  const totalFlags  = analysed.reduce((n, f) => n + f.flags.length, 0);
  const totalSyms   = analysed.reduce((n, f) => n + f.symbols.length, 0);
  const entries     = analysed.filter(f => f.isEntry);
  const flagged     = analysed.filter(f => f.flags.length > 0);

  const lines = [];

  // ── Header
  lines.push(`# Codebase Index — ${projectName}`);
  lines.push(`> Generated ${now}  ·  ${totalFiles} files  ·  ${totalSyms} symbols  ·  ${totalFlags} flags`);
  lines.push(`> Re-generate: \`node <path-to-codebase-index>/index.js ${targetDir}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Entry Points
  lines.push('## Entry Points');
  lines.push('');
  if (entries.length === 0) {
    lines.push('_No standard entry points detected._');
  } else {
    lines.push('| File | Symbols | Lines |');
    lines.push('|------|---------|-------|');
    entries.forEach(f => {
      const syms = f.symbols.map(s => `\`${s.name}\``).join(', ') || '—';
      lines.push(`| \`${f.relPath}\` | ${syms} | ${f.lineCount} |`);
    });
  }
  lines.push('');

  // ── Flagged Sections
  lines.push('## Flagged Sections');
  lines.push('');
  if (totalFlags === 0) {
    lines.push('_No `@flag` annotations found. Add `// @flag: description` to any line to register it here._');
  } else {
    lines.push('| File | Line | Description |');
    lines.push('|------|------|-------------|');
    flagged.forEach(f => {
      f.flags.forEach(fl => {
        lines.push(`| \`${f.relPath}\` | ${fl.line} | ${fl.note} |`);
      });
    });
  }
  lines.push('');

  // ── Public Symbols
  lines.push('## Public Symbols');
  lines.push('');
  const symFiles = analysed.filter(f => f.symbols.length > 0);
  if (symFiles.length === 0) {
    lines.push('_No extractable symbols found._');
  } else {
    lines.push('| Symbol | Kind | File | Line |');
    lines.push('|--------|------|------|------|');
    symFiles.forEach(f => {
      f.symbols.forEach(s => {
        lines.push(`| \`${s.name}\` | ${kindIcon(s.kind)} ${s.kind} | \`${f.relPath}\` | ${s.line} |`);
      });
    });
  }
  lines.push('');

  // ── File Tree
  lines.push('## File Tree');
  lines.push('');
  lines.push('```');
  lines.push(projectName + '/');
  buildTree(analysed, targetDir).forEach(l => lines.push(l));
  lines.push('```');
  lines.push('');

  // ── File Details
  lines.push('## File Details');
  lines.push('');
  lines.push('_Symbols and flags per file, with line numbers for direct navigation._');
  lines.push('');

  // Group by directory
  const byDir = {};
  analysed.forEach(f => {
    const dir = path.dirname(f.relPath);
    (byDir[dir] = byDir[dir] || []).push(f);
  });

  Object.keys(byDir).sort().forEach(dir => {
    const label = dir === '.' ? `\`${projectName}/\`` : `\`${dir}/\``;
    lines.push(`### ${label}`);
    lines.push('');

    byDir[dir].forEach(f => {
      const fname   = path.basename(f.relPath);
      const entryBadge = f.isEntry ? ' `[entry]`' : '';
      lines.push(`#### \`${fname}\`${entryBadge}  ·  ${f.lineCount} lines`);

      if (f.symbols.length > 0) {
        const symList = f.symbols
          .map(s => `\`${s.name}\` *(${s.kind}·L${s.line})*`)
          .join(', ');
        lines.push(`**Symbols:** ${symList}`);
        lines.push('');
      }
      if (f.flags.length > 0) {
        lines.push('**Flags:**');
        f.flags.forEach(fl => lines.push(`- L${fl.line} — ${fl.note}`));
        lines.push('');
      }
      if (f.symbols.length === 0 && f.flags.length === 0) {
        lines.push('');
      }
    });
  });

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by [codebase-index](https://github.com/amitdu6ey/experiments/tree/main/codebase-index)*`);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const targetDir = path.resolve(process.argv[2] || process.cwd());

  if (!fs.existsSync(targetDir)) {
    console.error(`Error: directory not found — ${targetDir}`);
    process.exit(1);
  }

  console.log(`\n  codebase-index\n`);
  console.log(`  Scanning: ${targetDir}`);

  const files    = walk(targetDir, targetDir);
  const analysed = files.map(f => analyseFile(f)).filter(Boolean);

  const totalFlags = analysed.reduce((n, f) => n + f.flags.length, 0);
  const totalSyms  = analysed.reduce((n, f) => n + f.symbols.length, 0);

  console.log(`  Found:    ${analysed.length} files · ${totalSyms} symbols · ${totalFlags} flags`);
  console.log(`  Writing:  ${OUTPUT_FILE}`);

  const markdown   = generateMarkdown(analysed, targetDir);
  const outputPath = path.join(targetDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, markdown, 'utf8');

  console.log(`\n  Done → ${outputPath}\n`);
}

main();
