import fs from 'fs/promises';
import path from 'path';

export interface Framework {
  name: string;
  version?: string;
  confidence: 'high' | 'medium' | 'low';
  ecosystem: 'node' | 'python' | 'java' | 'ruby' | 'go';
  type: 'framework' | 'library' | 'platform';
}

export interface DetectionResult {
  frameworks: Framework[];
  timestamp: number;
}

interface Signature {
  id: string;
  name: string;
  filePatterns: string[];
  contentPatterns?: string[];
  dependency?: string; // For package.json, requirements.txt, etc.
  ecosystem: Framework['ecosystem'];
  type: Framework['type'];
}

const SIGNATURES: Signature[] = [
  // Node.js Frameworks
  {
    id: 'react',
    name: 'React',
    filePatterns: [],
    dependency: 'react',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'next',
    name: 'Next.js',
    filePatterns: ['next.config.js', 'next.config.ts'],
    dependency: 'next',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'vue',
    name: 'Vue.js',
    filePatterns: [],
    dependency: 'vue',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    filePatterns: ['nuxt.config.js', 'nuxt.config.ts'],
    dependency: 'nuxt',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'angular',
    name: 'Angular',
    filePatterns: ['angular.json'],
    dependency: '@angular/core',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'svelte',
    name: 'Svelte',
    filePatterns: ['svelte.config.js'],
    dependency: 'svelte',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'express',
    name: 'Express',
    filePatterns: [],
    dependency: 'express',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'nest',
    name: 'NestJS',
    filePatterns: ['nest-cli.json'],
    dependency: '@nestjs/core',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'fastify',
    name: 'Fastify',
    filePatterns: [],
    dependency: 'fastify',
    ecosystem: 'node',
    type: 'framework',
  },
  {
    id: 'telegraf',
    name: 'Telegraf',
    filePatterns: [],
    dependency: 'telegraf',
    ecosystem: 'node',
    type: 'library',
  },

  // Python Frameworks
  {
    id: 'django',
    name: 'Django',
    filePatterns: ['manage.py'],
    dependency: 'django',
    ecosystem: 'python',
    type: 'framework',
  },
  {
    id: 'flask',
    name: 'Flask',
    filePatterns: [],
    dependency: 'flask',
    ecosystem: 'python',
    type: 'framework',
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    filePatterns: [],
    dependency: 'fastapi',
    ecosystem: 'python',
    type: 'framework',
  },
  {
    id: 'pandas',
    name: 'Pandas',
    filePatterns: [],
    dependency: 'pandas',
    ecosystem: 'python',
    type: 'library',
  },
  {
    id: 'tensorflow',
    name: 'TensorFlow',
    filePatterns: [],
    dependency: 'tensorflow',
    ecosystem: 'python',
    type: 'library',
  },

  // Java Frameworks
  {
    id: 'spring-boot',
    name: 'Spring Boot',
    filePatterns: [],
    dependency: 'spring-boot',
    ecosystem: 'java',
    type: 'framework',
  },
  {
    id: 'jakarta',
    name: 'Jakarta EE',
    filePatterns: [],
    dependency: 'jakarta.platform',
    ecosystem: 'java',
    type: 'framework',
  },

  // Ruby Frameworks
  {
    id: 'rails',
    name: 'Ruby on Rails',
    filePatterns: ['config/routes.rb'],
    dependency: 'rails',
    ecosystem: 'ruby',
    type: 'framework',
  },
  {
    id: 'sinatra',
    name: 'Sinatra',
    filePatterns: [],
    dependency: 'sinatra',
    ecosystem: 'ruby',
    type: 'framework',
  },

  // Go Frameworks
  {
    id: 'gin',
    name: 'Gin',
    filePatterns: [],
    dependency: 'github.com/gin-gonic/gin',
    ecosystem: 'go',
    type: 'framework',
  },
  {
    id: 'echo',
    name: 'Echo',
    filePatterns: [],
    dependency: 'github.com/labstack/echo',
    ecosystem: 'go',
    type: 'framework',
  },
  {
    id: 'fiber',
    name: 'Fiber',
    filePatterns: [],
    dependency: 'github.com/gofiber/fiber',
    ecosystem: 'go',
    type: 'framework',
  },
  {
    id: 'beego',
    name: 'Beego',
    filePatterns: [],
    dependency: 'github.com/beego/beego',
    ecosystem: 'go',
    type: 'framework',
  },
  {
    id: 'revel',
    name: 'Revel',
    filePatterns: [],
    dependency: 'github.com/revel/revel',
    ecosystem: 'go',
    type: 'framework',
  },
];

export class FrameworkDetector {
  private cacheFile = '.ai/framework-cache.json';
  private cacheDuration = 3600000; // 1 hour

  async detect(cwd: string = process.cwd()): Promise<DetectionResult> {
    const cached = await this.getCachedResult(cwd);
    if (cached) return cached;

    const frameworks: Framework[] = [];

    await Promise.all([
      this.detectNode(cwd, frameworks),
      this.detectPython(cwd, frameworks),
      this.detectJava(cwd, frameworks),
      this.detectRuby(cwd, frameworks),
      this.detectGo(cwd, frameworks),
    ]);

    const result = {
      frameworks: this.deduplicate(frameworks),
      timestamp: Date.now(),
    };

    await this.saveCache(cwd, result);
    return result;
  }

  private deduplicate(frameworks: Framework[]): Framework[] {
    const seen = new Set();
    return frameworks.filter((f) => {
      const key = `${f.name}-${f.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async detectNode(cwd: string, frameworks: Framework[]) {
    try {
      const pkgPath = path.join(cwd, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'node' && sig.dependency && allDeps[sig.dependency]) {
          frameworks.push({
            name: sig.name,
            version: allDeps[sig.dependency].replace(/^[\^~]/, ''),
            confidence: 'high',
            ecosystem: 'node',
            type: sig.type,
          });
        }
      }
    } catch {
      // No package.json or invalid
    }

    // Check for config files independent of package.json
    try {
      const dirFiles = await fs.readdir(cwd);
      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'node' && sig.filePatterns.some((p) => dirFiles.includes(p))) {
          // Avoid duplicate if already found via package.json
          if (!frameworks.find((f) => f.name === sig.name)) {
            frameworks.push({
              name: sig.name,
              confidence: 'medium', // File existence is strong but not absolute
              ecosystem: 'node',
              type: sig.type,
            });
          }
        }
      }
    } catch {
      // Ignore readdir errors
    }
  }

  private async detectPython(cwd: string, frameworks: Framework[]) {
    // Check requirements.txt
    try {
      const reqPath = path.join(cwd, 'requirements.txt');
      const content = await fs.readFile(reqPath, 'utf-8');
      const lines = content.split('\n');

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'python' && sig.dependency) {
          const match = lines.find(
            (l) => l.trim().startsWith(sig.dependency + '==') || l.trim() === sig.dependency,
          );
          if (match) {
            const version = match.includes('==') ? match.split('==')[1].trim() : undefined;
            frameworks.push({
              name: sig.name,
              version,
              confidence: 'high',
              ecosystem: 'python',
              type: sig.type,
            });
          }
        }
      }
    } catch {
      // check Pipfile or file patterns
    }

    // Check file patterns for Python (like manage.py for Django)
    try {
      const dirFiles = await fs.readdir(cwd);
      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'python' && sig.filePatterns.length > 0) {
          if (sig.filePatterns.some((p) => dirFiles.includes(p))) {
            if (!frameworks.find((f) => f.name === sig.name)) {
              frameworks.push({
                name: sig.name,
                confidence: 'medium',
                ecosystem: 'python',
                type: sig.type,
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private async detectJava(cwd: string, frameworks: Framework[]) {
    try {
      const pomPath = path.join(cwd, 'pom.xml');
      const content = await fs.readFile(pomPath, 'utf-8');

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'java' && sig.dependency && content.includes(sig.dependency)) {
          frameworks.push({
            name: sig.name,
            confidence: 'high',
            ecosystem: 'java',
            type: sig.type,
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const gradlePath = path.join(cwd, 'build.gradle');
      const content = await fs.readFile(gradlePath, 'utf-8');

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'java' && sig.dependency && content.includes(sig.dependency)) {
          if (!frameworks.find((f) => f.name === sig.name)) {
            frameworks.push({
              name: sig.name,
              confidence: 'high',
              ecosystem: 'java',
              type: sig.type,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private async detectRuby(cwd: string, frameworks: Framework[]) {
    try {
      const gemPath = path.join(cwd, 'Gemfile');
      const content = await fs.readFile(gemPath, 'utf-8');

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'ruby' && sig.dependency) {
          const match = content.match(new RegExp(`gem ['"]${sig.dependency}['"]`));
          if (match) {
            frameworks.push({
              name: sig.name,
              confidence: 'high',
              ecosystem: 'ruby',
              type: sig.type,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private async detectGo(cwd: string, frameworks: Framework[]) {
    try {
      const modPath = path.join(cwd, 'go.mod');
      const content = await fs.readFile(modPath, 'utf-8');

      for (const sig of SIGNATURES) {
        if (sig.ecosystem === 'go' && sig.dependency && content.includes(sig.dependency)) {
          frameworks.push({
            name: sig.name,
            confidence: 'high',
            ecosystem: 'go',
            type: sig.type,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  private async getCachedResult(cwd: string): Promise<DetectionResult | null> {
    try {
      const cachePath = path.join(cwd, this.cacheFile);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(content);
      if (Date.now() - cache.timestamp < this.cacheDuration) {
        return cache;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async saveCache(cwd: string, result: DetectionResult): Promise<void> {
    try {
      const cachePath = path.join(cwd, this.cacheFile);
      const cacheDir = path.dirname(cachePath);
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    } catch {
      // ignore
    }
  }
}
