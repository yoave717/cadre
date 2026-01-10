import { describe, it, expect, beforeEach } from 'vitest';
import { MultiLineHandler } from '../../src/input/multiline.js';

describe('MultiLineHandler', () => {
  let handler: MultiLineHandler;

  beforeEach(() => {
    handler = new MultiLineHandler();
  });

  describe('Normal Mode', () => {
    it('should process single lines normally', () => {
      const result = handler.processLine('hello world');
      expect(result.complete).toBe(true);
      expect(result.content).toBe('hello world');
      expect(result.mode).toBe('normal');
    });

    it('should detect triple backticks', () => {
      const result = handler.processLine('```typescript');
      expect(result.complete).toBe(false);
      expect(result.mode).toBe('backtick');
      expect(handler.getMode()).toBe('backtick');
    });
  });

  describe('Explicit Mode (/multi)', () => {
    it('should enter explicit mode via setMode', () => {
      handler.setMode('explicit');
      expect(handler.getMode()).toBe('explicit');
    });

    it('should accumulate lines in explicit mode', () => {
      handler.setMode('explicit');

      let result = handler.processLine('line 1');
      expect(result.complete).toBe(false);
      expect(result.mode).toBe('explicit');

      result = handler.processLine('line 2');
      expect(result.complete).toBe(false);

      expect(handler.getBuffer()).toBe('line 1\nline 2');
    });

    it('should preserve empty lines', () => {
      handler.setMode('explicit');
      handler.processLine('line 1');
      handler.processLine('');
      handler.processLine('line 3');

      expect(handler.getBuffer()).toBe('line 1\n\nline 3');
    });

    it('should finish on /end', () => {
      handler.setMode('explicit');
      handler.processLine('line 1');

      const result = handler.processLine('/end');
      expect(result.complete).toBe(true);
      expect(result.content).toBe('line 1');
      expect(result.mode).toBe('normal');
      expect(handler.getMode()).toBe('normal');
    });

    it('should cancel on /cancel', () => {
      handler.setMode('explicit');
      handler.processLine('draft content');

      const result = handler.processLine('/cancel');
      expect(result.complete).toBe(false);
      expect(result.content).toBe('');
      // Should be back to normal mode
      expect(result.mode).toBe('normal');
      expect(handler.getMode()).toBe('normal');
      expect(handler.getBuffer()).toBe('');
    });

    it('should enforce max character limit', () => {
      handler.setMode('explicit');

      // Create large string > 50k chars
      const largeString = 'a'.repeat(50001);

      expect(() => {
        handler.processLine(largeString);
      }).toThrow(/Input exceeds maximum length/);
    });

    it('should not throw if under limit', () => {
      handler.setMode('explicit');
      const largeString = 'a'.repeat(49000);

      expect(() => {
        handler.processLine(largeString);
      }).not.toThrow();
    });
  });
});
