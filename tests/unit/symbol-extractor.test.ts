import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractImports,
  extractExports,
  isLanguageSupported,
} from '../../src/index-system/symbol-extractor';

describe('Symbol Extractor', () => {
  describe('TypeScript', () => {
    it('should extract function declarations', () => {
      const code = `
export function greet(name: string): string {
  return \`Hello, \${name}\`;
}

function internal() {
  return 42;
}
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('greet');
      expect(functions[0].exported).toBe(true);
      expect(functions[1].name).toBe('internal');
    });

    it('should extract arrow functions', () => {
      const code = `
export const add = (a: number, b: number) => a + b;
const multiply = (x: number, y: number) => x * y;
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('add');
      expect(functions[1].name).toBe('multiply');
    });

    it('should extract classes', () => {
      const code = `
export class User {
  constructor(public name: string) {}
}

class InternalService {
  doSomething() {}
}
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const classes = symbols.filter((s) => s.type === 'class');

      expect(classes).toHaveLength(2);
      expect(classes[0].name).toBe('User');
      expect(classes[0].exported).toBe(true);
      expect(classes[1].name).toBe('InternalService');
    });

    it('should extract interfaces', () => {
      const code = `
export interface Config {
  apiKey: string;
  url: string;
}

interface Internal {
  id: number;
}
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const interfaces = symbols.filter((s) => s.type === 'interface');

      expect(interfaces).toHaveLength(2);
      expect(interfaces[0].name).toBe('Config');
      expect(interfaces[0].exported).toBe(true);
      expect(interfaces[1].name).toBe('Internal');
    });

    it('should extract type aliases', () => {
      const code = `
export type Result = { ok: boolean; value: string };
type ID = string | number;
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const types = symbols.filter((s) => s.type === 'type');

      expect(types.length).toBeGreaterThanOrEqual(1);
      const resultType = types.find((t) => t.name === 'Result');
      const idType = types.find((t) => t.name === 'ID');

      expect(resultType).toBeDefined();
      expect(resultType?.exported).toBe(true);
      expect(idType).toBeDefined();
    });

    it('should extract constants', () => {
      const code = `
export const MAX_SIZE = 1000;
const MIN_VALUE = 10;
      `;

      const symbols = extractSymbols(code, 'TypeScript');
      const constants = symbols.filter((s) => s.type === 'constant');

      expect(constants).toHaveLength(2);
      expect(constants[0].name).toBe('MAX_SIZE');
      expect(constants[0].exported).toBe(true);
      expect(constants[1].name).toBe('MIN_VALUE');
    });

    it('should extract imports', () => {
      const code = `
import fs from 'fs/promises';
import path from 'path';
import { readFile, writeFile } from './utils';
      `;

      const imports = extractImports(code, 'TypeScript');

      expect(imports).toHaveLength(3);
      expect(imports).toContain('fs/promises');
      expect(imports).toContain('path');
      expect(imports).toContain('./utils');
    });

    it('should extract exports', () => {
      const code = `
export function greet() {}
export class User {}
export const API_KEY = 'test';
export interface Config {}
export type Result = string;
      `;

      const exports = extractExports(code, 'TypeScript');

      expect(exports).toHaveLength(5);
      expect(exports).toContain('greet');
      expect(exports).toContain('User');
      expect(exports).toContain('API_KEY');
      expect(exports).toContain('Config');
      expect(exports).toContain('Result');
    });
  });

  describe('Python', () => {
    it('should extract function definitions', () => {
      const code = `
def greet(name):
    return f"Hello, {name}"

async def fetch_data():
    pass
      `;

      const symbols = extractSymbols(code, 'Python');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('greet');
      expect(functions[1].name).toBe('fetch_data');
    });

    it('should extract classes', () => {
      const code = `
class User:
    def __init__(self, name):
        self.name = name

class Service:
    pass
      `;

      const symbols = extractSymbols(code, 'Python');
      const classes = symbols.filter((s) => s.type === 'class');

      expect(classes).toHaveLength(2);
      expect(classes[0].name).toBe('User');
      expect(classes[1].name).toBe('Service');
    });

    it('should extract constants', () => {
      const code = `
MAX_SIZE = 1000
MIN_VALUE = 10
API_KEY = "secret"
      `;

      const symbols = extractSymbols(code, 'Python');
      const constants = symbols.filter((s) => s.type === 'constant');

      expect(constants).toHaveLength(3);
      expect(constants[0].name).toBe('MAX_SIZE');
      expect(constants[1].name).toBe('MIN_VALUE');
      expect(constants[2].name).toBe('API_KEY');
    });

    it('should extract imports', () => {
      const code = `import os
import sys
from pathlib import Path
from typing import List, Dict`;

      const imports = extractImports(code, 'Python');

      expect(imports.length).toBeGreaterThan(0);
      // Check that common imports are captured
      const hasBasicImports = imports.some((imp) => imp === 'os' || imp === 'sys' || imp === 'Path' || imp === 'List' || imp === 'Dict');
      expect(hasBasicImports).toBe(true);
    });
  });

  describe('JavaScript', () => {
    it('should extract functions', () => {
      const code = `
export function add(a, b) {
  return a + b;
}

const multiply = (x, y) => x * y;
      `;

      const symbols = extractSymbols(code, 'JavaScript');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('add');
      expect(functions[0].exported).toBe(true);
      expect(functions[1].name).toBe('multiply');
    });

    it('should extract classes', () => {
      const code = `
export class Component {
  constructor() {}
}

class Helper {
  help() {}
}
      `;

      const symbols = extractSymbols(code, 'JavaScript');
      const classes = symbols.filter((s) => s.type === 'class');

      expect(classes).toHaveLength(2);
      expect(classes[0].name).toBe('Component');
      expect(classes[0].exported).toBe(true);
      expect(classes[1].name).toBe('Helper');
    });
  });

  describe('Go', () => {
    it('should extract function definitions', () => {
      const code = `
func Greet(name string) string {
  return "Hello, " + name
}

func internal() {
  return
}
      `;

      const symbols = extractSymbols(code, 'Go');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('Greet');
      expect(functions[1].name).toBe('internal');
    });

    it('should extract structs as types', () => {
      const code = `
type User struct {
  Name string
  Age  int
}

type Config struct {
  API string
}
      `;

      const symbols = extractSymbols(code, 'Go');
      const types = symbols.filter((s) => s.type === 'type');

      expect(types).toHaveLength(2);
      expect(types[0].name).toBe('User');
      expect(types[1].name).toBe('Config');
    });

    it('should extract interfaces', () => {
      const code = `
type Reader interface {
  Read() error
}

type Writer interface {
  Write() error
}
      `;

      const symbols = extractSymbols(code, 'Go');
      const interfaces = symbols.filter((s) => s.type === 'interface');

      expect(interfaces).toHaveLength(2);
      expect(interfaces[0].name).toBe('Reader');
      expect(interfaces[1].name).toBe('Writer');
    });
  });

  describe('Rust', () => {
    it('should extract function definitions', () => {
      const code = `
pub fn greet(name: &str) -> String {
  format!("Hello, {}", name)
}

fn internal() {
  println!("internal");
}
      `;

      const symbols = extractSymbols(code, 'Rust');
      const functions = symbols.filter((s) => s.type === 'function');

      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('greet');
      expect(functions[1].name).toBe('internal');
    });

    it('should extract structs', () => {
      const code = `
pub struct User {
  name: String,
  age: u32,
}

struct Internal {
  id: u64,
}
      `;

      const symbols = extractSymbols(code, 'Rust');
      const types = symbols.filter((s) => s.type === 'type');

      expect(types).toHaveLength(2);
      expect(types[0].name).toBe('User');
      expect(types[1].name).toBe('Internal');
    });

    it('should extract traits', () => {
      const code = `
pub trait Display {
  fn display(&self) -> String;
}

trait Internal {
  fn process(&self);
}
      `;

      const symbols = extractSymbols(code, 'Rust');
      const interfaces = symbols.filter((s) => s.type === 'interface');

      expect(interfaces).toHaveLength(2);
      expect(interfaces[0].name).toBe('Display');
      expect(interfaces[1].name).toBe('Internal');
    });
  });

  describe('Language Support', () => {
    it('should identify supported languages', () => {
      expect(isLanguageSupported('TypeScript')).toBe(true);
      expect(isLanguageSupported('JavaScript')).toBe(true);
      expect(isLanguageSupported('Python')).toBe(true);
      expect(isLanguageSupported('Go')).toBe(true);
      expect(isLanguageSupported('Rust')).toBe(true);
    });

    it('should identify unsupported languages', () => {
      expect(isLanguageSupported('Java')).toBe(false);
      expect(isLanguageSupported('C++')).toBe(false);
      expect(isLanguageSupported('Ruby')).toBe(false);
    });

    it('should return empty arrays for unsupported languages', () => {
      const code = 'public class Test {}';
      const symbols = extractSymbols(code, 'Java');
      const imports = extractImports(code, 'Java');
      const exports = extractExports(code, 'Java');

      expect(symbols).toEqual([]);
      expect(imports).toEqual([]);
      expect(exports).toEqual([]);
    });
  });
});
