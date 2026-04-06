#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out',
  '__pycache__', '.cache', 'coverage', 'vendor', '.venv', 'venv',
  '.idea', '.vscode', 'target', 'bin', 'obj', '.mvn',
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
  '.sh', '.bash', '.zsh', '.xml', '.gradle',
  '.md', '.properties',
]);

const ENTRY_NAMES = new Set([
  'index', 'main', 'app', 'server', 'cli', 'bin',
  '__main__', 'manage', 'wsgi', 'asgi', 'application',
]);

const OUTPUT_FILE = 'CODEBASE_INDEX.md';

// Chars-per-token approximation (conservative, works for most LLMs)
const CHARS_PER_TOKEN = 4;

// ── Flag pattern ──────────────────────────────────────────────────────────
const FLAG_RE = /(?:\/\/|#|\/\*|<!--)\s*@flag\s*:?\s*(.+?)(?:\s*(?:\*\/|--))?$/i;

// ── Spring Boot annotation constants ─────────────────────────────────────

const SPRING_LAYER_ANNOTATIONS = {
  RestController: 'controller',
  Controller:     'controller',
  Service:        'service',
  Repository:     'repository',
  Component:      'component',
  Entity:         'entity',
  Configuration:  'configuration',
  SpringBootApplication: 'entry',
  ControllerAdvice: 'advice',
  RestControllerAdvice: 'advice',
  EventListener:  'listener',
  Scheduled:      'scheduled',
};

const HTTP_METHODS = {
  GetMapping:     'GET',
  PostMapping:    'POST',
  PutMapping:     'PUT',
  DeleteMapping:  'DELETE',
  PatchMapping:   'PATCH',
  RequestMapping: 'ALL',
};

// ── Java / Spring Boot extractor ──────────────────────────────────────────

function extractJavaSpring(lines) {
  const symbols   = [];
  const endpoints = [];

  let pendingAnnotations   = []; // method-level HTTP annotations waiting for a method
  let currentClassLayer    = null;
  let currentClassBasePath = '';
  let currentClassName     = null;
  let classAnnotationBuf   = []; // spring annotations seen before next class decl

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t   = raw.trim();
    const ln  = i + 1;

    // ── Class-level Spring annotations
    for (const [ann, layer] of Object.entries(SPRING_LAYER_ANNOTATIONS)) {
      if (t.includes(`@${ann}`)) classAnnotationBuf.push({ ann, layer });
    }

    // ── Class-level @RequestMapping path
    let rm = t.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
    if (rm) currentClassBasePath = rm[1];

    // ── Class / interface declaration
    let cm = t.match(/(?:^|\s)(?:class|interface)\s+(\w+)/);
    if (cm) {
      currentClassName  = cm[1];
      currentClassLayer = classAnnotationBuf.length
        ? classAnnotationBuf[classAnnotationBuf.length - 1].layer
        : null;
      const annNames = classAnnotationBuf.map(a => `@${a.ann}`).join(' ');
      symbols.push({
        name:        cm[1],
        kind:        'class',
        layer:       currentClassLayer,
        annotations: annNames,
        line:        ln,
      });
      classAnnotationBuf = [];
      pendingAnnotations = []; // class-level @RequestMapping is base path only, not an endpoint
    }

    // ── Method-level HTTP mapping annotations
    for (const [ann, method] of Object.entries(HTTP_METHODS)) {
      if (!t.includes(`@${ann}`)) continue;
      // Extract path from annotation: @GetMapping("/path") or @GetMapping(value="/path")
      const pathMatch = t.match(new RegExp(`@${ann}\\s*\\(\\s*(?:value\\s*=\\s*)?["']([^"']*)`));
      pendingAnnotations.push({ method, path: pathMatch ? pathMatch[1] : '' });
    }

    // ── Method declaration (flush pending HTTP annotations)
    if (pendingAnnotations.length > 0) {
      // Match: [modifiers] ReturnType methodName(
      const mm = t.match(/(?:public|private|protected)\s+(?:[\w<>\[\],\s]+)\s+(\w+)\s*\(/);
      if (mm && !['if', 'while', 'for', 'switch', 'catch'].includes(mm[1])) {
        pendingAnnotations.forEach(pa => {
          const fullPath = normalisePath(currentClassBasePath + '/' + pa.path);
          endpoints.push({
            method:  pa.method,
            path:    fullPath,
            handler: `${currentClassName || '?'}.${mm[1]}`,
            file:    null, // filled in by caller
            line:    ln,
          });
        });
        pendingAnnotations = [];
      }
    }

    // ── Regular method symbols (public methods only, not constructors)
    const methMatch = raw.match(/^\s{4,}(public|protected)\s+(?!class\s)(?!static\s+class\s)([\w<>\[\],\s?]+)\s+(\w+)\s*\(/);
    if (methMatch) {
      const mName = methMatch[3];
      if (!['if', 'while', 'for', 'switch', 'return', 'new'].includes(mName)) {
        symbols.push({ name: mName, kind: 'method', layer: currentClassLayer, line: ln });
      }
    }
  }

  return { symbols, endpoints };
}

function normalisePath(p) {
  return ('/' + p).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

// ── pom.xml parser ────────────────────────────────────────────────────────

function parsePom(content) {
  const info = { springBootVersion: null, javaVersion: null, dependencies: [] };

  const sbv = content.match(/<parent>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/parent>/);
  if (sbv) info.springBootVersion = sbv[1].trim();

  const jv = content.match(/<java\.version>([^<]+)<\/java\.version>/);
  if (jv) info.javaVersion = jv[1].trim();

  const depRe = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g;
  let m;
  while ((m = depRe.exec(content)) !== null) {
    info.dependencies.push(`${m[1].trim()}:${m[2].trim()}`);
  }

  return info;
}

// ── application.properties / yml parser ──────────────────────────────────

function parseAppProperties(content, isYml) {
  const props = {};
  const INTERESTING = ['server.port', 'spring.datasource', 'spring.jpa', 'spring.application.name',
                       'management.endpoints', 'spring.security', 'spring.kafka', 'spring.redis',
                       'spring.mail', 'spring.profiles'];
  if (isYml) {
    // Very lightweight YAML key extraction
    content.split('\n').forEach(line => {
      const kv = line.match(/^(\s*[\w.]+[\w-]*):\s*(.+)/);
      if (kv) {
        const key = kv[1].trim();
        if (INTERESTING.some(k => key.startsWith(k.replace('.', '.')))) {
          props[key] = kv[2].trim();
        }
      }
    });
  } else {
    content.split('\n').forEach(line => {
      const kv = line.match(/^([^#=]+)=(.*)$/);
      if (kv) {
        const key = kv[1].trim();
        if (INTERESTING.some(k => key.startsWith(k))) props[key] = kv[2].trim();
      }
    });
  }
  return props;
}

// ── Generic extractors ────────────────────────────────────────────────────

function extractJS(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t  = line.trim();
    let m;
    m = t.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = t.match(/^export\s+(?:default\s+)?class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    m = t.match(/^export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'const', line: ln });
    m = t.match(/^export\s+default\s+(?:async\s+)?function\s*(\w*)/);
    if (m) return symbols.push({ name: m[1] || 'default', kind: 'fn', line: ln });
    m = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'fn', line: ln });
    m = line.match(/^class\s+(\w+)/);
    if (m) return symbols.push({ name: m[1], kind: 'class', line: ln });
    m = t.match(/^module\.exports\s*=/);
    if (m) return symbols.push({ name: 'module.exports', kind: 'export', line: ln });
  });
  return symbols;
}

function extractPython(lines) {
  const symbols = [];
  lines.forEach((line, i) => {
    const ln = i + 1;
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
    let m;
    m = t.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
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

  const lines  = content.split('\n');
  const extKey = file.ext.replace('.', '');

  let symbols   = [];
  let endpoints = [];
  let springMeta = null;
  let pomMeta    = null;
  let appConfig  = null;

  if (extKey === 'java') {
    const result = extractJavaSpring(lines);
    symbols   = result.symbols;
    endpoints = result.endpoints.map(ep => ({ ...ep, file: file.relPath }));
    // Detect Spring layer from class annotations
    const layerAnnotation = symbols.find(s => s.kind === 'class' && s.layer);
    if (layerAnnotation) springMeta = layerAnnotation.layer;
  } else if (file.name === 'pom.xml') {
    pomMeta = parsePom(content);
  } else if (file.name === 'application.properties') {
    appConfig = parseAppProperties(content, false);
  } else if (file.name === 'application.yml' || file.name === 'application.yaml') {
    appConfig = parseAppProperties(content, true);
  } else {
    const extractors = { js: extractJS, jsx: extractJS, ts: extractJS, tsx: extractJS,
                         mjs: extractJS, cjs: extractJS, py: extractPython, go: extractGo,
                         rb: extractRuby, rs: extractRust };
    const fn = extractors[extKey];
    if (fn) symbols = fn(lines);
  }

  const flags = [];
  lines.forEach((line, i) => {
    const m = line.match(FLAG_RE);
    if (m) flags.push({ line: i + 1, note: m[1].trim() });
  });

  const baseName = path.basename(file.name, file.ext).toLowerCase();
  const isEntry  = ENTRY_NAMES.has(baseName);

  return {
    ...file,
    symbols, endpoints, flags,
    isEntry, springMeta, pomMeta, appConfig,
    lineCount: lines.length,
    charCount: content.length,
  };
}

// ── Token estimation ──────────────────────────────────────────────────────

function estimateTokens(str) {
  return Math.ceil(str.length / CHARS_PER_TOKEN);
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
    node[parts[parts.length - 1]] = null;
  }
  return renderTree(tree, '');
}

function renderTree(node, prefix) {
  const lines = [];
  const keys  = Object.keys(node).sort((a, b) => {
    if (node[a] !== null && node[b] === null) return -1;
    if (node[a] === null && node[b] !== null) return 1;
    return a.localeCompare(b);
  });
  keys.forEach((key, idx) => {
    const isLast    = idx === keys.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPfx  = isLast ? '    ' : '│   ';
    lines.push(prefix + connector + key);
    if (node[key] !== null) lines.push(...renderTree(node[key], prefix + childPfx));
  });
  return lines;
}

// ── Markdown generator ────────────────────────────────────────────────────

function kindIcon(kind) {
  return { fn: 'ƒ', method: 'ƒ', class: '◈', const: '■', export: '⇒',
           type: '◇', struct: '◇', enum: '◆', trait: '◉', module: '⬡' }[kind] || '·';
}

function httpBadge(method) {
  return { GET: '`GET `', POST: '`POST`', PUT: '`PUT `', DELETE: '`DEL `',
           PATCH: '`PTCH`', ALL: '`ALL `' }[method] || `\`${method}\``;
}

function layerEmoji(layer) {
  return { controller: '🌐', service: '⚙️', repository: '🗄️', entity: '📦',
           component: '🔧', configuration: '⚡', entry: '🚀', advice: '🛡️',
           listener: '👂', scheduled: '⏰' }[layer] || '·';
}

function fmt(n) {
  return n.toLocaleString();
}

function generateMarkdown(analysed, targetDir, fullProjectTokens) {
  const projectName = path.basename(targetDir);
  const now         = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const totalFiles  = analysed.length;
  const totalFlags  = analysed.reduce((n, f) => n + f.flags.length, 0);
  const totalSyms   = analysed.reduce((n, f) => n + f.symbols.length, 0);
  const allEndpoints = analysed.flatMap(f => f.endpoints || []);
  const entries     = analysed.filter(f => f.isEntry);
  const flagged     = analysed.filter(f => f.flags.length > 0);
  const isSpring    = analysed.some(f => f.endpoints?.length > 0 || f.springMeta);
  const pomFile     = analysed.find(f => f.pomMeta);
  const appCfgFile  = analysed.find(f => f.appConfig);

  const lines = [];

  // ── Header
  lines.push(`# Codebase Index — ${projectName}`);
  lines.push(`> Generated ${now}  ·  ${totalFiles} files  ·  ${totalSyms} symbols  ·  ${totalFlags} flags  ·  ${allEndpoints.length} endpoints`);
  lines.push(`> Re-generate: \`node <path-to>/codebase-index/index.js ${targetDir}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Token Cost Estimate (always shown)
  lines.push('## Token Cost Estimate');
  lines.push('');
  const indexContent   = ''; // placeholder — filled after generation
  const fullTokens     = fullProjectTokens;
  const PLACEHOLDER    = '__INDEX_TOKENS__'; // we'll replace after generation
  lines.push('| | Tokens (est.) | Cost reduction |');
  lines.push('|---|---|---|');
  lines.push(`| Full project scan | ~${fmt(fullTokens)} | baseline |`);
  lines.push(`| **This index** | ~${PLACEHOLDER} | ${PLACEHOLDER}% saved |`);
  lines.push('');
  lines.push('> Estimate: ~4 chars/token. Actual savings depend on model context window.');
  lines.push('');

  // ── Spring Boot Info
  if (isSpring) {
    lines.push('## Spring Boot Project');
    lines.push('');

    if (pomFile?.pomMeta) {
      const pom = pomFile.pomMeta;
      lines.push('### Build Info');
      lines.push('');
      if (pom.springBootVersion) lines.push(`- **Spring Boot:** ${pom.springBootVersion}`);
      if (pom.javaVersion)       lines.push(`- **Java:** ${pom.javaVersion}`);
      if (pom.dependencies.length) {
        const deps = pom.dependencies
          .filter(d => d.includes('spring') || d.includes('lombok') || d.includes('hibernate'))
          .slice(0, 12);
        if (deps.length) {
          lines.push(`- **Key deps:** ${deps.map(d => `\`${d.split(':')[1]}\``).join(', ')}`);
        }
      }
      lines.push('');
    }

    if (appCfgFile?.appConfig) {
      const cfg = appCfgFile.appConfig;
      const keys = Object.keys(cfg);
      if (keys.length) {
        lines.push('### Application Config');
        lines.push('');
        lines.push('| Property | Value |');
        lines.push('|----------|-------|');
        keys.slice(0, 20).forEach(k => {
          const val = cfg[k].replace(/password.*/i, '***');
          lines.push(`| \`${k}\` | \`${val}\` |`);
        });
        lines.push('');
      }
    }

    // REST API Routes
    if (allEndpoints.length > 0) {
      lines.push('### REST API Routes');
      lines.push('');
      lines.push('| Method | Path | Handler | File | Line |');
      lines.push('|--------|------|---------|------|------|');
      allEndpoints
        .sort((a, b) => a.path.localeCompare(b.path))
        .forEach(ep => {
          lines.push(`| ${httpBadge(ep.method)} | \`${ep.path}\` | \`${ep.handler}\` | \`${ep.file}\` | ${ep.line} |`);
        });
      lines.push('');
    }

    // Components by Layer
    const byLayer = {};
    analysed.forEach(f => {
      if (!f.springMeta) return;
      (byLayer[f.springMeta] = byLayer[f.springMeta] || []).push(f);
    });

    const layerOrder = ['entry', 'controller', 'service', 'repository', 'entity', 'configuration', 'component', 'advice', 'listener', 'scheduled'];
    const presentLayers = layerOrder.filter(l => byLayer[l]);

    if (presentLayers.length) {
      lines.push('### Components by Layer');
      lines.push('');
      presentLayers.forEach(layer => {
        const icon = layerEmoji(layer);
        lines.push(`#### ${icon} ${layer.charAt(0).toUpperCase() + layer.slice(1)}`);
        lines.push('');
        byLayer[layer].forEach(f => {
          const classSymbol = f.symbols.find(s => s.kind === 'class');
          const methods = f.symbols.filter(s => s.kind === 'method').map(s => `\`${s.name}\``).join(', ');
          lines.push(`- \`${f.relPath}\` — **${classSymbol?.name || path.basename(f.relPath)}**`);
          if (methods) lines.push(`  - Methods: ${methods}`);
        });
        lines.push('');
      });
    }
  }

  // ── Entry Points
  lines.push('## Entry Points');
  lines.push('');
  if (entries.length === 0) {
    lines.push('_No standard entry points detected._');
  } else {
    lines.push('| File | Symbols | Lines |');
    lines.push('|------|---------|-------|');
    entries.forEach(f => {
      const syms = f.symbols.slice(0, 6).map(s => `\`${s.name}\``).join(', ') || '—';
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
        if (s.kind === 'method') return; // methods listed in layer view for Spring
        lines.push(`| \`${s.name}\` | ${kindIcon(s.kind)} ${s.kind}${s.layer ? ` · ${s.layer}` : ''} | \`${f.relPath}\` | ${s.line} |`);
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
      const fname      = path.basename(f.relPath);
      const badge      = f.isEntry ? ' `[entry]`' : '';
      const layerBadge = f.springMeta ? ` \`[${f.springMeta}]\`` : '';
      lines.push(`#### \`${fname}\`${badge}${layerBadge}  ·  ${f.lineCount} lines`);
      if (f.symbols.length > 0) {
        const top = f.symbols.filter(s => s.kind !== 'method').slice(0, 8);
        if (top.length) {
          lines.push(`**Symbols:** ${top.map(s => `\`${s.name}\` *(${s.kind}·L${s.line})*`).join(', ')}`);
          lines.push('');
        }
      }
      if (f.endpoints?.length > 0) {
        lines.push(`**Endpoints:** ${f.endpoints.map(ep => `\`${ep.method} ${ep.path}\``).join(', ')}`);
        lines.push('');
      }
      if (f.flags.length > 0) {
        lines.push('**Flags:**');
        f.flags.forEach(fl => lines.push(`- L${fl.line} — ${fl.note}`));
        lines.push('');
      }
      if (f.symbols.length === 0 && !f.endpoints?.length && f.flags.length === 0) {
        lines.push('');
      }
    });
  });

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by [codebase-index](https://github.com/amitdu6ey/experiments/tree/main/codebase-index)*`);

  // ── Resolve token placeholders
  const rawMarkdown = lines.join('\n');
  const indexTokens = estimateTokens(rawMarkdown);
  const savings     = fullTokens > 0
    ? ((1 - indexTokens / fullTokens) * 100).toFixed(1)
    : '0.0';

  return rawMarkdown
    .replace(PLACEHOLDER, fmt(indexTokens))
    .replace(`${PLACEHOLDER}%`, `${savings}%`);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const targetDir = path.resolve(process.argv[2] || process.cwd());

  if (!fs.existsSync(targetDir)) {
    console.error(`\n  Error: directory not found — ${targetDir}\n`);
    process.exit(1);
  }

  console.log(`\n  codebase-index\n`);
  console.log(`  Scanning : ${targetDir}`);

  const files    = walk(targetDir, targetDir);
  const analysed = files.map(f => analyseFile(f)).filter(Boolean);

  const totalFlags     = analysed.reduce((n, f) => n + f.flags.length, 0);
  const totalSyms      = analysed.reduce((n, f) => n + f.symbols.length, 0);
  const allEndpoints   = analysed.flatMap(f => f.endpoints || []);
  const fullCharCount  = analysed.reduce((n, f) => n + f.charCount, 0);
  const fullTokens     = estimateTokens(fullCharCount.toString().repeat(1) && fullCharCount / CHARS_PER_TOKEN > 0 ? 'x'.repeat(fullCharCount) : '');
  // Simpler: just divide
  const fullTokensEst  = Math.ceil(fullCharCount / CHARS_PER_TOKEN);

  const isSpring = analysed.some(f => f.endpoints?.length > 0 || f.springMeta);

  console.log(`  Files    : ${analysed.length}`);
  console.log(`  Symbols  : ${totalSyms}`);
  console.log(`  Endpoints: ${allEndpoints.length}${isSpring ? ' (Spring Boot detected)' : ''}`);
  console.log(`  Flags    : ${totalFlags}`);
  console.log(`  Tokens   : ~${fmt(fullTokensEst)} (full scan)`);
  console.log(`  Writing  : ${OUTPUT_FILE}`);

  const markdown   = generateMarkdown(analysed, targetDir, fullTokensEst);
  const indexTokens = estimateTokens(markdown);
  const savings    = fullTokensEst > 0
    ? ((1 - indexTokens / fullTokensEst) * 100).toFixed(1)
    : '0.0';

  const outputPath = path.join(targetDir, OUTPUT_FILE);
  fs.writeFileSync(outputPath, markdown, 'utf8');

  console.log(`\n  Token savings: ${savings}% — index is ~${fmt(indexTokens)} tokens vs ~${fmt(fullTokensEst)} for full scan`);
  console.log(`  Output: ${outputPath}\n`);
}

main();
