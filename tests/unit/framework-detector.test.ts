import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';

import { FrameworkDetector } from '../../src/tools/framework-detector';

vi.mock('fs/promises');

describe('FrameworkDetector', () => {
  let detector: FrameworkDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new FrameworkDetector();
  });

  describe('Node.js Detection', () => {
    it('should detect React and Express from package.json', async () => {
      const mockPackageJson = {
        dependencies: {
          react: '^18.0.0',
          express: '4.17.1',
        },
      };

      (fs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.endsWith('package.json'))
          return Promise.resolve(JSON.stringify(mockPackageJson));
        if (filePath.includes('.cadre/framework-cache.json'))
          return Promise.reject(new Error('No cache'));
        return Promise.reject(new Error('File not found'));
      });
      (fs.readdir as any).mockResolvedValue([]);

      const result = await detector.detect();

      const react = result.frameworks.find((f) => f.name === 'React');
      const express = result.frameworks.find((f) => f.name === 'Express');

      expect(react).toBeDefined();
      expect(react?.version).toBe('18.0.0');
      expect(express).toBeDefined();
      expect(express?.version).toBe('4.17.1');
    });

    it('should detect Next.js from config file if package.json missing', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('No package.json'));
      (fs.readdir as any).mockResolvedValue(['next.config.js']);

      const result = await detector.detect();
      const next = result.frameworks.find((f) => f.name === 'Next.js');

      expect(next).toBeDefined();
      expect(next?.confidence).toBe('medium');
    });
  });

  describe('Python Detection', () => {
    it('should detect Django from requirements.txt', async () => {
      (fs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.endsWith('requirements.txt'))
          return Promise.resolve('django==4.0.0\npytest==7.0.0');
        if (filePath.includes('.cadre/framework-cache.json'))
          return Promise.reject(new Error('No cache'));
        return Promise.reject(new Error('File not found'));
      });
      (fs.readdir as any).mockResolvedValue([]);

      const result = await detector.detect();
      const django = result.frameworks.find((f) => f.name === 'Django');

      expect(django).toBeDefined();
      expect(django?.version).toBe('4.0.0');
    });
  });

  describe('Java Detection', () => {
    it('should detect Spring Boot from pom.xml', async () => {
      (fs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.endsWith('pom.xml'))
          return Promise.resolve(
            '<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot</artifactId></dependency>',
          );
        if (filePath.includes('.cadre/framework-cache.json'))
          return Promise.reject(new Error('No cache'));
        return Promise.reject(new Error('File not found'));
      });
      (fs.readdir as any).mockResolvedValue([]);

      const result = await detector.detect();
      const spring = result.frameworks.find((f) => f.name === 'Spring Boot');

      expect(spring).toBeDefined();
    });
  });

  describe('Go Detection', () => {
    it('should detect Gin from go.mod', async () => {
      (fs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.endsWith('go.mod'))
          return Promise.resolve('require github.com/gin-gonic/gin v1.7.0');
        if (filePath.includes('.cadre/framework-cache.json'))
          return Promise.reject(new Error('No cache'));
        return Promise.reject(new Error('File not found'));
      });
      (fs.readdir as any).mockResolvedValue([]);

      const result = await detector.detect();
      const gin = result.frameworks.find((f) => f.name === 'Gin');

      expect(gin).toBeDefined();
    });
  });
});
