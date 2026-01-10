import fs from 'fs/promises';
import path from 'path';

export interface DetectionResult {
  primary: string;
  languages: Record<string, number>; // name -> count
  percentages: Record<string, number>; // name -> percentage
  totalFiles: number;
  timestamp: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  cjs: 'JavaScript',
  mjs: 'JavaScript',
  py: 'Python',
  java: 'Java',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  c: 'C',
  cpp: 'C++',
  cc: 'C++',
  h: 'C/C++',
  hpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  scala: 'Scala',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  sql: 'SQL',
  r: 'R',
  lua: 'Lua',
  dart: 'Dart',
  fs: 'F#',
  fsx: 'F#',
  ex: 'Elixir',
  exs: 'Elixir',
  elm: 'Elm',
  erl: 'Erlang',
  hs: 'Haskell',
  clj: 'Clojure',
  pl: 'Perl',
};

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.ai',
  'vendor',
  'target',
  'bin',
  'obj',
  '__pycache__',
];

export class LanguageDetector {
  private cacheFile = '.ai/cache.json';
  private cacheDuration = 3600000; // 1 hour

  private async loadGitIgnore(cwd: string): Promise<string[]> {
    try {
      const gitignorePath = path.join(cwd, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    } catch {
      return [];
    }
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching simulation for basic ignore patterns
    // Handling direct matches and basic wildcards
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);

    // Normalize path separators
    const normPath = filePath.split(path.sep).join('/');

    if (normPath === pattern) return true;
    if (normPath.startsWith(pattern + '/')) return true;
    if (pattern.startsWith('*') && normPath.endsWith(pattern.slice(1))) return true;

    return false;
  }

  private shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
    const parts = relativePath.split(path.sep);
    const basename = parts[parts.length - 1];

    if (DEFAULT_IGNORE.includes(basename)) return true;

    // Check custom ignore patterns
    // This is a simplified check. For full glob support we might want to use minimatch if added,
    // but preserving "no new dependencies" per constraints, we implement basic checking.
    return ignorePatterns.some((pattern) => this.matchPattern(relativePath, pattern));
  }

  async scan(cwd: string, maxDepth: number = 5): Promise<DetectionResult> {
    const ignorePatterns = await this.loadGitIgnore(cwd);
    const languages: Record<string, number> = {};
    let totalFiles = 0;

    const walk = async (dir: string, currentDepth: number) => {
      if (currentDepth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(cwd, fullPath);

          if (this.shouldIgnore(relativePath, ignorePatterns)) continue;

          if (entry.isDirectory()) {
            await walk(fullPath, currentDepth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().slice(1);
            if (ext && LANGUAGE_MAP[ext]) {
              const lang = LANGUAGE_MAP[ext];
              languages[lang] = (languages[lang] || 0) + 1;
              totalFiles++;
            }
          }
        }
      } catch {
        // Ignore permission errors or unreadable dirs
      }
    };

    await walk(cwd, 0);

    // Calculate percentages
    const percentages: Record<string, number> = {};
    let maxCount = 0;
    let primary = 'Unknown';

    for (const [lang, count] of Object.entries(languages)) {
      const pct = Math.round((count / totalFiles) * 100);
      percentages[lang] = pct;
      if (count > maxCount) {
        maxCount = count;
        primary = lang;
      }
    }

    return {
      primary,
      languages,
      percentages,
      totalFiles,
      timestamp: Date.now(),
    };
  }

  async getCachedResult(cwd: string): Promise<DetectionResult | null> {
    try {
      const cachePath = path.join(cwd, this.cacheFile);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(content);

      if (Date.now() - cache.timestamp < this.cacheDuration) {
        return cache;
      }
    } catch {
      // Missing or invalid cache
    }
    return null;
  }

  async saveCache(cwd: string, result: DetectionResult): Promise<void> {
    try {
      const cachePath = path.join(cwd, this.cacheFile);
      const cacheDir = path.dirname(cachePath);

      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    } catch {
      // Ignore write errors
    }
  }

  async detect(cwd: string = process.cwd()): Promise<DetectionResult> {
    const cached = await this.getCachedResult(cwd);
    if (cached) return cached;

    const result = await this.scan(cwd);
    await this.saveCache(cwd, result);
    return result;
  }
}
