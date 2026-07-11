/**
 * TypeScript / JavaScript structure analyzer built on ts-morph.
 *
 * It never executes repository code — it only parses source files into an AST
 * and counts structural elements (exports, classes, interfaces, components,
 * hooks, routes, services).
 */

import path from "node:path";
import { Project, SyntaxKind, type SourceFile } from "ts-morph";
import type { LanguageAnalyzer, StructureSignals } from "./languageAdapter.js";
import { emptySignals } from "./languageAdapter.js";

const TS_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const MAX_FILES = 4000;

export const tsAnalyzer: LanguageAnalyzer = {
  id: "typescript",
  extensions: TS_EXTENSIONS,
  confidence: 0.8,

  async analyze(repoPath: string, files: string[]): Promise<StructureSignals> {
    const sourceFiles = files
      .filter((f) => TS_EXTENSIONS.includes(ext(f)))
      .filter((f) => !f.includes("node_modules/"))
      .slice(0, MAX_FILES);

    if (sourceFiles.length === 0) return emptySignals();

    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true, noLib: true, skipLibCheck: true },
    });

    const signals = emptySignals();

    for (const rel of sourceFiles) {
      const abs = path.join(repoPath, rel);
      let sf: SourceFile;
      try {
        sf = project.addSourceFileAtPath(abs);
      } catch {
        continue;
      }
      try {
        analyzeSourceFile(sf, rel, signals);
      } catch {
        /* skip unparseable files */
      } finally {
        project.removeSourceFile(sf);
      }
    }

    return signals;
  },
};

function analyzeSourceFile(sf: SourceFile, rel: string, signals: StructureSignals): void {
  const lower = rel.toLowerCase();

  signals.classes += sf.getClasses().length;
  signals.interfaces += sf.getInterfaces().length;

  const exportedFns = sf
    .getFunctions()
    .filter((fn) => fn.isExported()).length;
  signals.exportedFunctions += exportedFns;

  // Arrow-function consts that are exported also count as exported functions.
  const exportedArrowFns = sf
    .getVariableStatements()
    .filter((vs) => vs.isExported())
    .flatMap((vs) => vs.getDeclarations())
    .filter((d) => d.getInitializerIfKind(SyntaxKind.ArrowFunction)).length;
  signals.exportedFunctions += exportedArrowFns;

  // React components: PascalCase exported symbol in a tsx/jsx file returning JSX.
  const isViewFile = lower.endsWith(".tsx") || lower.endsWith(".jsx");
  if (isViewFile) {
    const hasJsx =
      sf.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
      sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
      sf.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0;
    if (hasJsx) signals.components += 1;
  }

  // Custom hooks: exported functions named useXxx.
  const hookCount = sf
    .getFunctions()
    .filter((fn) => /^use[A-Z]/.test(fn.getName() ?? "")).length;
  signals.hooks += hookCount;

  // Route / service heuristics by path and content.
  if (/(^|\/)(routes?|pages|api|controllers?)(\/|\.)/.test(lower)) signals.routes += 1;
  if (/(^|\/)(services?|providers?|repositories?)(\/|\.)/.test(lower)) signals.services += 1;
}

function ext(file: string): string {
  const idx = file.lastIndexOf(".");
  return idx >= 0 ? file.slice(idx + 1).toLowerCase() : "";
}
