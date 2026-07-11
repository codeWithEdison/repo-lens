/**
 * Generic repository structure analysis. Walks the working tree (never .git),
 * detects languages by extension, infers frameworks from manifests WITHOUT
 * executing any code, and delegates deeper structural signals to registered
 * language analyzers.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type { StructureAnalysis } from "../types.js";
import {
  languageRegistry,
  mergeSignals,
  emptySignals,
  createTreeSitterAnalyzer,
  type StructureSignals,
} from "./languageAdapter.js";
import { tsAnalyzer } from "./tsAnalyzer.js";

// Register analyzers once. ts-morph handles TS/JS; others are tree-sitter-ready
// stubs so unsupported languages degrade to generic analysis instead of failing.
languageRegistry.register(tsAnalyzer);
languageRegistry.register(createTreeSitterAnalyzer("python", ["py"]));
languageRegistry.register(createTreeSitterAnalyzer("go", ["go"]));
languageRegistry.register(createTreeSitterAnalyzer("rust", ["rs"]));
languageRegistry.register(createTreeSitterAnalyzer("java", ["java"]));

const EXT_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  cpp: "C++",
  c: "C",
  swift: "Swift",
  scala: "Scala",
  sql: "SQL",
  sh: "Shell",
  css: "CSS",
  scss: "CSS",
  html: "HTML",
  vue: "Vue",
  svelte: "Svelte",
};

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage",
  "vendor",
  "__pycache__",
  ".venv",
  "target",
]);

const SOURCE_EXTS = new Set(Object.keys(EXT_LANGUAGE));

export async function analyzeStructure(repoPath: string): Promise<StructureAnalysis> {
  const languageFiles = new Map<string, number>();
  const analyzableFiles: string[] = [];
  const topDirs = new Set<string>();
  let fileCount = 0;
  let hasTests = false;
  let hasCi = false;
  let hasDocker = false;
  let hasDocs = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoPath, full);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (depth === 0) topDirs.add(entry.name);
        if (/^(tests?|__tests__|spec)$/i.test(entry.name)) hasTests = true;
        if (entry.name === ".github") hasCi = true;
        if (entry.name === "docs") hasDocs = true;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      fileCount++;
      const lowerName = entry.name.toLowerCase();
      const e = ext(entry.name);

      if (SOURCE_EXTS.has(e)) {
        const lang = EXT_LANGUAGE[e];
        languageFiles.set(lang, (languageFiles.get(lang) ?? 0) + 1);
        analyzableFiles.push(rel);
      }

      if (/\.(test|spec)\.[jt]sx?$/.test(lowerName)) hasTests = true;
      if (lowerName === "dockerfile" || lowerName.endsWith(".dockerfile")) hasDocker = true;
      if (lowerName === "docker-compose.yml" || lowerName === "docker-compose.yaml") hasDocker = true;
      if (/^(readme|contributing|changelog)/i.test(lowerName)) hasDocs = true;
      if (
        lowerName.endsWith(".yml") &&
        (rel.includes(".github/workflows") || rel.includes(".gitlab-ci"))
      ) {
        hasCi = true;
      }
      if (lowerName === ".gitlab-ci.yml" || lowerName === ".travis.yml") hasCi = true;
    }
  };

  await walk(repoPath, 0);

  const frameworks = await detectFrameworks(repoPath);

  // Run language analyzers for deeper signals.
  let signals: StructureSignals = emptySignals();
  const filesByAnalyzer = new Map<string, string[]>();
  for (const file of analyzableFiles) {
    const analyzer = languageRegistry.forExtension(ext(file));
    if (!analyzer) continue;
    const list = filesByAnalyzer.get(analyzer.id) ?? [];
    list.push(file);
    filesByAnalyzer.set(analyzer.id, list);
  }
  for (const analyzer of languageRegistry.all()) {
    const files = filesByAnalyzer.get(analyzer.id);
    if (!files || files.length === 0) continue;
    try {
      const s = await analyzer.analyze(repoPath, files);
      signals = mergeSignals(signals, s);
    } catch {
      /* analyzer failures never block the pipeline */
    }
  }

  const languages = [...languageFiles.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files);

  return {
    fileCount,
    languages,
    frameworks,
    hasTests,
    hasCi,
    hasDocker,
    hasDocs,
    mainDirectories: [...topDirs].sort(),
    ...signals,
  };
}

/** Infer frameworks from manifest files without executing anything. */
async function detectFrameworks(repoPath: string): Promise<string[]> {
  const frameworks = new Set<string>();

  const pkgPath = path.join(repoPath, "package.json");
  try {
    const raw = await fsp.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const map: Record<string, string> = {
      react: "React",
      next: "Next.js",
      vue: "Vue",
      "@angular/core": "Angular",
      svelte: "Svelte",
      express: "Express",
      "@nestjs/core": "NestJS",
      fastify: "Fastify",
      "@tanstack/react-router": "TanStack Router",
      "@trpc/server": "tRPC",
      tailwindcss: "Tailwind CSS",
      vite: "Vite",
      webpack: "Webpack",
      jest: "Jest",
      vitest: "Vitest",
    };
    for (const [dep, label] of Object.entries(map)) {
      if (deps[dep]) frameworks.add(label);
    }
  } catch {
    /* no package.json */
  }

  await addIfExists(repoPath, "requirements.txt", frameworks, "Python");
  await addIfExists(repoPath, "pyproject.toml", frameworks, "Python");
  await addIfExists(repoPath, "go.mod", frameworks, "Go modules");
  await addIfExists(repoPath, "Cargo.toml", frameworks, "Cargo");
  await addIfExists(repoPath, "pom.xml", frameworks, "Maven");
  await addIfExists(repoPath, "build.gradle", frameworks, "Gradle");

  return [...frameworks];
}

async function addIfExists(
  repoPath: string,
  file: string,
  set: Set<string>,
  label: string,
): Promise<void> {
  try {
    await fsp.access(path.join(repoPath, file));
    set.add(label);
  } catch {
    /* not present */
  }
}

function ext(file: string): string {
  const idx = file.lastIndexOf(".");
  return idx >= 0 ? file.slice(idx + 1).toLowerCase() : "";
}
