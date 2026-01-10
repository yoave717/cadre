import type { Symbol } from './types.js';

/**
 * Extract symbols from code using regex patterns
 * This is a lightweight approach that works for most common cases
 */

interface LanguagePatterns {
  functions: RegExp[];
  classes: RegExp[];
  interfaces: RegExp[];
  types: RegExp[];
  variables: RegExp[];
  constants: RegExp[];
  methods: RegExp[];
  imports: RegExp[];
  exports: RegExp[];
}

const TYPESCRIPT_PATTERNS: LanguagePatterns = {
  functions: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
    /^(?:export\s+)?const\s+(\w+)\s*:\s*\([^)]*\)\s*=>/gm,
  ],
  classes: [/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm],
  interfaces: [/^(?:export\s+)?interface\s+(\w+)/gm],
  types: [/^(?:export\s+)?type\s+(\w+)\s*=/gm],
  variables: [/^(?:export\s+)?(?:let|var)\s+(\w+)/gm],
  constants: [/^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/gm],
  methods: [/^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?{/gm],
  imports: [/^import\s+.*from\s+['"]([^'"]+)['"]/gm],
  exports: [/^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/gm],
};

const JAVASCRIPT_PATTERNS: LanguagePatterns = {
  functions: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
  ],
  classes: [/^(?:export\s+)?class\s+(\w+)/gm],
  interfaces: [],
  types: [],
  variables: [/^(?:export\s+)?(?:let|var)\s+(\w+)/gm],
  constants: [/^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/gm],
  methods: [/^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/gm],
  imports: [
    /^(?:import|require)\s+.*from\s+['"]([^'"]+)['"]/gm,
    /^const\s+.*=\s*require\(['"]([^'"]+)['"]\)/gm,
  ],
  exports: [
    /^(?:module\.)?exports?\s*=/,
    /^export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/gm,
  ],
};

const PYTHON_PATTERNS: LanguagePatterns = {
  functions: [/^(?:async\s+)?def\s+(\w+)\s*\(/gm],
  classes: [/^class\s+(\w+)/gm],
  interfaces: [],
  types: [],
  variables: [/^(\w+)\s*=\s*(?!lambda)/gm],
  constants: [/^([A-Z_][A-Z0-9_]*)\s*=/gm],
  methods: [/^\s+(?:async\s+)?def\s+(\w+)\s*\(/gm],
  imports: [/^(?:from\s+[\w.]+\s+)?import\s+([\w,\s]+)/gm],
  exports: [/^__all__\s*=\s*\[(.*)\]/gm],
};

const GO_PATTERNS: LanguagePatterns = {
  functions: [/^func\s+(\w+)\s*\(/gm],
  classes: [],
  interfaces: [/^type\s+(\w+)\s+interface/gm],
  types: [/^type\s+(\w+)\s+struct/gm, /^type\s+(\w+)\s+(?!interface|struct)/gm],
  variables: [/^var\s+(\w+)/gm],
  constants: [/^const\s+(\w+)/gm],
  methods: [/^func\s+\([^)]+\)\s+(\w+)\s*\(/gm],
  imports: [/^import\s+(?:\(|")(.*?)(?:\)|")/gms],
  exports: [],
};

const RUST_PATTERNS: LanguagePatterns = {
  functions: [/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm],
  classes: [],
  interfaces: [/^(?:pub\s+)?trait\s+(\w+)/gm],
  types: [
    /^(?:pub\s+)?struct\s+(\w+)/gm,
    /^(?:pub\s+)?enum\s+(\w+)/gm,
    /^(?:pub\s+)?type\s+(\w+)\s*=/gm,
  ],
  variables: [/^(?:pub\s+)?(?:static\s+)?let\s+(?:mut\s+)?(\w+)/gm],
  constants: [/^(?:pub\s+)?const\s+(\w+)/gm],
  methods: [/^\s+(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm],
  imports: [/^use\s+([\w:]+)/gm],
  exports: [/^pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/gm],
};

const LANGUAGE_PATTERN_MAP: Record<string, LanguagePatterns> = {
  TypeScript: TYPESCRIPT_PATTERNS,
  JavaScript: JAVASCRIPT_PATTERNS,
  Python: PYTHON_PATTERNS,
  Go: GO_PATTERNS,
  Rust: RUST_PATTERNS,
  // Add more languages as needed
};

/**
 * Extract symbols from source code
 */
export function extractSymbols(content: string, language: string): Symbol[] {
  const patterns = LANGUAGE_PATTERN_MAP[language];
  if (!patterns) return [];

  const symbols: Symbol[] = [];
  const lines = content.split('\n');

  const extractWithPattern = (
    pattern: RegExp,
    type: Symbol['type'],
    exported: boolean = false,
  ): void => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name || name === 'default') continue;

      // Find line number
      const lineNumber = content.substring(0, match.index).split('\n').length;

      symbols.push({
        name,
        type,
        line: lineNumber,
        signature: match[0].trim(),
        exported,
      });
    }
  };

  // Extract functions
  patterns.functions.forEach((pattern) => {
    extractWithPattern(pattern, 'function', pattern.source.includes('export'));
  });

  // Extract classes
  patterns.classes.forEach((pattern) => {
    extractWithPattern(pattern, 'class', pattern.source.includes('export'));
  });

  // Extract interfaces
  patterns.interfaces.forEach((pattern) => {
    extractWithPattern(pattern, 'interface', pattern.source.includes('export'));
  });

  // Extract types
  patterns.types.forEach((pattern) => {
    extractWithPattern(pattern, 'type', pattern.source.includes('export'));
  });

  // Extract constants
  patterns.constants.forEach((pattern) => {
    extractWithPattern(pattern, 'constant', pattern.source.includes('export'));
  });

  // Extract variables
  patterns.variables.forEach((pattern) => {
    extractWithPattern(pattern, 'variable', pattern.source.includes('export'));
  });

  // Extract methods
  patterns.methods.forEach((pattern) => {
    extractWithPattern(pattern, 'method', false);
  });

  return symbols;
}

/**
 * Extract import statements
 */
export function extractImports(content: string, language: string): string[] {
  const patterns = LANGUAGE_PATTERN_MAP[language];
  if (!patterns) return [];

  const imports: Set<string> = new Set();

  patterns.imports.forEach((pattern) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath) {
        // Handle multiple imports in one line (e.g., Python)
        if (importPath.includes(',')) {
          importPath.split(',').forEach((imp) => imports.add(imp.trim()));
        } else {
          imports.add(importPath.trim());
        }
      }
    }
  });

  return Array.from(imports);
}

/**
 * Extract exported symbol names
 */
export function extractExports(content: string, language: string): string[] {
  const patterns = LANGUAGE_PATTERN_MAP[language];
  if (!patterns) return [];

  const exports: Set<string> = new Set();

  patterns.exports.forEach((pattern) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const exportName = match[1];
      if (exportName && exportName !== 'default') {
        exports.add(exportName);
      }
    }
  });

  return Array.from(exports);
}

/**
 * Check if a language is supported for symbol extraction
 */
export function isLanguageSupported(language: string): boolean {
  return language in LANGUAGE_PATTERN_MAP;
}
