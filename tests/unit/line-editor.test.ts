import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LineEditor } from '../../src/input/line-editor';
// import * as readline from 'readline';

// Mock readline module entirely
vi.mock('readline', () => ({
  cursorTo: vi.fn(),
  clearLine: vi.fn(),
}));

describe('LineEditor', () => {
  let lineEditor: LineEditor;
  let stdinMock: any;
  let stdoutMock: any;

  beforeEach(() => {
    lineEditor = new LineEditor();

    // Mock stdin
    stdinMock = {
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      setEncoding: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      isTTY: true,
      read: vi.fn(),
      emit: vi.fn(),
    };

    stdinMock.on.mockImplementation((event: string, callback: any) => {
      if (event === 'data') {
        stdinMock._dataCallback = callback;
      }
    });

    Object.defineProperty(process, 'stdin', {
      value: stdinMock,
      configurable: true,
      writable: true,
    });

    // Mock stdout
    stdoutMock = {
      write: vi.fn(),
    };
    Object.defineProperty(process, 'stdout', {
      value: stdoutMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const emitKey = (key: string | number) => {
    if (typeof key === 'number') {
      stdinMock._dataCallback(String.fromCharCode(key));
    } else {
      stdinMock._dataCallback(key);
    }
  };

  it('should read simple input and return on Enter', async () => {
    const promise = lineEditor.read('> ');

    emitKey('h');
    emitKey('e');
    emitKey('l');
    emitKey('l');
    emitKey('o');
    emitKey(13); // Enter

    const result = await promise;
    expect(result).toBe('hello');
  });

  it('should handle backspace', async () => {
    const promise = lineEditor.read('> ');

    emitKey('a');
    emitKey('b');
    emitKey(127); // Backspace
    emitKey('c');
    emitKey(13);

    const result = await promise;
    expect(result).toBe('ac');
  });

  it('should navigate with arrows (left/right) and insert', async () => {
    const promise = lineEditor.read('> ');

    emitKey('a');
    emitKey('c');
    emitKey('\u001b[D'); // Left
    emitKey('b');
    emitKey(13);

    const result = await promise;
    expect(result).toBe('abc');
  });

  it('should handle Ctrl+A (Home) and Ctrl+E (End)', async () => {
    const promise = lineEditor.read('> ');

    emitKey('c');
    emitKey(1); // Ctrl+A -> cursor 0
    emitKey('a');
    emitKey(5); // Ctrl+E -> cursor end
    emitKey('b'); // Wait, 'a' inserted at 0, buffer is 'ac'. Ctrl+E moves to 2. Append 'b' -> 'acb'.
    // Actually:
    // 'c' -> cursor 1, buf 'c'
    // Ctrl+A -> cursor 0
    // 'a' -> cursor 1, buf 'ac' (inserted before 'c')
    // Ctrl+E -> cursor 2
    // 'b' -> cursor 3, buf 'acb'
    emitKey(13);

    const result = await promise;
    expect(result).toBe('acb');
  });

  it('should handle Ctrl+U (Clear)', async () => {
    const promise = lineEditor.read('> ');

    emitKey('f');
    emitKey('o');
    emitKey('o');
    emitKey(21); // Ctrl+U
    emitKey('b');
    emitKey('a');
    emitKey('r');
    emitKey(13);

    const result = await promise;
    expect(result).toBe('bar');
  });

  it('should handle Ctrl+K (Kill to end)', async () => {
    const promise = lineEditor.read('> ');

    emitKey('a');
    emitKey('b');
    emitKey('c');
    emitKey(1); // Ctrl+A -> start
    emitKey('\u001b[C'); // Right -> cursor at 1 (between a and b)
    emitKey(11); // Ctrl+K -> kills 'bc'
    emitKey('d');
    emitKey(13);

    const result = await promise;
    expect(result).toBe('ad');
  });

  describe('history navigation', () => {
    it('should navigate backward with up arrow', async () => {
      // First, add some history by completing inputs
      let promise = lineEditor.read('> ');
      emitKey('c');
      emitKey('m');
      emitKey('d');
      emitKey('1');
      emitKey(13);
      await promise;

      promise = lineEditor.read('> ');
      emitKey('c');
      emitKey('m');
      emitKey('d');
      emitKey('2');
      emitKey(13);
      await promise;

      // Now test navigation
      promise = lineEditor.read('> ');
      emitKey('\u001b[A'); // Up arrow -> should load cmd2
      emitKey(13);

      const result = await promise;
      expect(result).toBe('cmd2');
    });

    it('should navigate forward with down arrow', async () => {
      // Add history
      let promise = lineEditor.read('> ');
      emitKey('c');
      emitKey('m');
      emitKey('d');
      emitKey('1');
      emitKey(13);
      await promise;

      promise = lineEditor.read('> ');
      emitKey('c');
      emitKey('m');
      emitKey('d');
      emitKey('2');
      emitKey(13);
      await promise;

      // Navigate backward then forward
      promise = lineEditor.read('> ');
      emitKey('t');
      emitKey('e');
      emitKey('s');
      emitKey('t');
      emitKey('\u001b[A'); // Up -> cmd2
      emitKey('\u001b[A'); // Up -> cmd1
      emitKey('\u001b[B'); // Down -> cmd2
      emitKey(13);

      const result = await promise;
      expect(result).toBe('cmd2');
    });

    it('should return to original input when navigating past history end', async () => {
      // Add history
      let promise = lineEditor.read('> ');
      emitKey('c');
      emitKey('m');
      emitKey('d');
      emitKey('1');
      emitKey(13);
      await promise;

      // Type something, navigate, then come back
      promise = lineEditor.read('> ');
      emitKey('n');
      emitKey('e');
      emitKey('w');
      emitKey('\u001b[A'); // Up -> cmd1
      emitKey('\u001b[B'); // Down -> should return to 'new'
      emitKey(13);

      const result = await promise;
      expect(result).toBe('new');
    });
  });
});
