/**
 * Language analyzer abstraction.
 *
 * This is the extension point for adding deeper, per-language structural
 * analysis (e.g. via tree-sitter grammars). The MVP ships a TypeScript/
 * JavaScript analyzer (ts-morph) and a generic fallback. New languages can be
 * added by implementing LanguageAnalyzer and registering it, without touching
 * the pipeline.
 */

export interface StructureSignals {
  exportedFunctions: number;
  classes: number;
  interfaces: number;
  components: number;
  routes: number;
  services: number;
  hooks: number;
}

export interface LanguageAnalyzer {
  /** Human-readable id, e.g. "typescript". */
  readonly id: string;
  /** File extensions this analyzer handles (without dot), lowercase. */
  readonly extensions: string[];
  /** Confidence 0..1 of the structural signals this analyzer produces. */
  readonly confidence: number;
  analyze(repoPath: string, files: string[]): Promise<StructureSignals>;
}

const emptySignals = (): StructureSignals => ({
  exportedFunctions: 0,
  classes: 0,
  interfaces: 0,
  components: 0,
  routes: 0,
  services: 0,
  hooks: 0,
});

export function mergeSignals(a: StructureSignals, b: StructureSignals): StructureSignals {
  return {
    exportedFunctions: a.exportedFunctions + b.exportedFunctions,
    classes: a.classes + b.classes,
    interfaces: a.interfaces + b.interfaces,
    components: a.components + b.components,
    routes: a.routes + b.routes,
    services: a.services + b.services,
    hooks: a.hooks + b.hooks,
  };
}

export { emptySignals };

class LanguageRegistry {
  private analyzers: LanguageAnalyzer[] = [];

  register(analyzer: LanguageAnalyzer): void {
    this.analyzers.push(analyzer);
  }

  all(): LanguageAnalyzer[] {
    return [...this.analyzers];
  }

  forExtension(ext: string): LanguageAnalyzer | undefined {
    const lower = ext.toLowerCase();
    return this.analyzers.find((a) => a.extensions.includes(lower));
  }
}

export const languageRegistry = new LanguageRegistry();

/**
 * Placeholder for a future tree-sitter backed analyzer. Implementations should
 * lazily load the appropriate grammar and map syntax nodes to StructureSignals.
 * Kept as a documented stub so unsupported languages degrade gracefully rather
 * than blocking the pipeline.
 */
export function createTreeSitterAnalyzer(
  id: string,
  extensions: string[],
): LanguageAnalyzer {
  return {
    id,
    extensions,
    confidence: 0.3,
    async analyze(): Promise<StructureSignals> {
      // No grammar bundled yet — return neutral signals.
      return emptySignals();
    },
  };
}
