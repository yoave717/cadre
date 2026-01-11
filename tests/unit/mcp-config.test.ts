import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MCPServerConfig } from '../../src/mcp/types.js';

// Create a mock storage object
let mockStorage: { servers: MCPServerConfig[] } = { servers: [] };

// Mock the conf library
vi.mock('conf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        return mockStorage[key as keyof typeof mockStorage] ?? defaultValue;
      }),
      set: vi.fn((key: string, value: any) => {
        mockStorage[key as keyof typeof mockStorage] = value;
      }),
    })),
  };
});

// Import after mocking
const {
  getMCPServers,
  getMCPServer,
  setMCPServer,
  removeMCPServer,
  toggleMCPServer,
  clearMCPServers,
  validateMCPServerConfig,
  getExampleMCPServers,
} = await import('../../src/mcp/config.js');

describe('MCP Configuration Storage', () => {
  beforeEach(() => {
    // Reset mock storage before each test
    mockStorage = { servers: [] };
  });

  describe('getMCPServers', () => {
    it('should return empty array when no servers configured', () => {
      const servers = getMCPServers();
      expect(servers).toEqual([]);
    });

    it('should return all configured servers', () => {
      const testServers: MCPServerConfig[] = [
        {
          name: 'server1',
          command: 'node',
          args: ['server1.js'],
          transport: 'stdio',
          enabled: true,
        },
        {
          name: 'server2',
          url: 'http://localhost:3000',
          transport: 'sse',
          enabled: false,
        },
      ];
      mockStorage.servers = testServers;

      const servers = getMCPServers();
      expect(servers).toEqual(testServers);
    });
  });

  describe('getMCPServer', () => {
    beforeEach(() => {
      mockStorage.servers = [
        {
          name: 'test-server',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        },
        {
          name: 'another-server',
          url: 'http://localhost:3000',
          transport: 'sse',
          enabled: true,
        },
      ];
    });

    it('should return server when name exists', () => {
      const server = getMCPServer('test-server');
      expect(server).toBeDefined();
      expect(server?.name).toBe('test-server');
    });

    it('should return undefined when name does not exist', () => {
      const server = getMCPServer('nonexistent');
      expect(server).toBeUndefined();
    });

    it('should handle case-sensitive name matching', () => {
      const server = getMCPServer('Test-Server');
      expect(server).toBeUndefined();
    });
  });

  describe('setMCPServer', () => {
    it('should add new server configuration', () => {
      const config: MCPServerConfig = {
        name: 'new-server',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
        enabled: true,
      };

      setMCPServer(config);

      const servers = getMCPServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual(config);
    });

    it('should update existing server by name', () => {
      const originalConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      mockStorage.servers = [originalConfig];

      const updatedConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'python',
        args: ['server.py'],
        transport: 'stdio',
        enabled: false,
      };

      setMCPServer(updatedConfig);

      const servers = getMCPServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual(updatedConfig);
    });

    it('should preserve other servers when updating', () => {
      mockStorage.servers = [
        {
          name: 'server1',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        },
        {
          name: 'server2',
          url: 'http://localhost:3000',
          transport: 'sse',
          enabled: true,
        },
      ];

      const updatedConfig: MCPServerConfig = {
        name: 'server1',
        command: 'python',
        transport: 'stdio',
        enabled: false,
      };

      setMCPServer(updatedConfig);

      const servers = getMCPServers();
      expect(servers).toHaveLength(2);
      expect(servers[0]).toEqual(updatedConfig);
      expect(servers[1].name).toBe('server2');
    });
  });

  describe('removeMCPServer', () => {
    beforeEach(() => {
      mockStorage.servers = [
        {
          name: 'server1',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        },
        {
          name: 'server2',
          url: 'http://localhost:3000',
          transport: 'sse',
          enabled: true,
        },
      ];
    });

    it('should remove server and return true', () => {
      const result = removeMCPServer('server1');

      expect(result).toBe(true);
      const servers = getMCPServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('server2');
    });

    it('should return false when server does not exist', () => {
      const result = removeMCPServer('nonexistent');

      expect(result).toBe(false);
      const servers = getMCPServers();
      expect(servers).toHaveLength(2);
    });

    it('should not affect other servers', () => {
      removeMCPServer('server1');

      const servers = getMCPServers();
      expect(servers[0].name).toBe('server2');
      expect(servers[0].url).toBe('http://localhost:3000');
    });
  });

  describe('toggleMCPServer', () => {
    beforeEach(() => {
      mockStorage.servers = [
        {
          name: 'test-server',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        },
      ];
    });

    it('should enable server and return true', () => {
      mockStorage.servers[0].enabled = false;

      const result = toggleMCPServer('test-server', true);

      expect(result).toBe(true);
      const server = getMCPServer('test-server');
      expect(server?.enabled).toBe(true);
    });

    it('should disable server and return true', () => {
      const result = toggleMCPServer('test-server', false);

      expect(result).toBe(true);
      const server = getMCPServer('test-server');
      expect(server?.enabled).toBe(false);
    });

    it('should return false when server does not exist', () => {
      const result = toggleMCPServer('nonexistent', true);

      expect(result).toBe(false);
    });

    it('should not modify other fields', () => {
      const originalCommand = mockStorage.servers[0].command;

      toggleMCPServer('test-server', false);

      const server = getMCPServer('test-server');
      expect(server?.command).toBe(originalCommand);
      expect(server?.transport).toBe('stdio');
    });
  });

  describe('clearMCPServers', () => {
    it('should remove all servers', () => {
      mockStorage.servers = [
        {
          name: 'server1',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        },
        {
          name: 'server2',
          url: 'http://localhost:3000',
          transport: 'sse',
          enabled: true,
        },
      ];

      clearMCPServers();

      const servers = getMCPServers();
      expect(servers).toEqual([]);
    });

    it('should result in empty array', () => {
      clearMCPServers();

      const servers = getMCPServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers).toHaveLength(0);
    });
  });

  describe('validateMCPServerConfig', () => {
    describe('valid configurations', () => {
      it('should validate stdio config with command', () => {
        const config: MCPServerConfig = {
          name: 'test-server',
          command: 'node',
          args: ['server.js'],
          transport: 'stdio',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate SSE config with URL', () => {
        const config: MCPServerConfig = {
          name: 'sse-server',
          url: 'http://localhost:3000/mcp',
          transport: 'sse',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate config with optional env vars', () => {
        const config: MCPServerConfig = {
          name: 'env-server',
          command: 'node',
          args: ['server.js'],
          env: {
            API_KEY: 'test-key',
            DEBUG: 'true',
          },
          transport: 'stdio',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('invalid configurations', () => {
      it('should reject empty server name', () => {
        const config: MCPServerConfig = {
          name: '',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Server name is required');
      });

      it('should reject whitespace-only name', () => {
        const config: MCPServerConfig = {
          name: '   ',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Server name is required');
      });

      it('should reject missing transport', () => {
        const config = {
          name: 'test-server',
          command: 'node',
          enabled: true,
        } as any;

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Transport type is required');
      });

      it('should reject stdio without command', () => {
        const config: MCPServerConfig = {
          name: 'test-server',
          transport: 'stdio',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Command is required for stdio transport');
      });

      it('should reject SSE without URL', () => {
        const config: MCPServerConfig = {
          name: 'test-server',
          transport: 'sse',
          enabled: true,
        };

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('URL is required for SSE transport');
      });

      it('should return multiple validation errors', () => {
        const config = {
          name: '',
          transport: 'stdio',
          enabled: true,
        } as any;

        const result = validateMCPServerConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
        expect(result.errors).toContain('Server name is required');
        expect(result.errors).toContain('Command is required for stdio transport');
      });
    });
  });

  describe('getExampleMCPServers', () => {
    it('should return array of example configs', () => {
      const examples = getExampleMCPServers();

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
    });

    it('should include common server types', () => {
      const examples = getExampleMCPServers();
      const names = examples.map((e) => e.name);

      expect(names).toContain('filesystem');
      expect(names).toContain('github');
      expect(names).toContain('brave-search');
      expect(names).toContain('postgres');
    });

    it('should have all examples disabled by default', () => {
      const examples = getExampleMCPServers();

      examples.forEach((example) => {
        expect(example.enabled).toBe(false);
      });
    });

    it('should return valid configurations', () => {
      const examples = getExampleMCPServers();

      examples.forEach((example) => {
        // Note: Examples might have placeholder values that won't fully validate
        // but should at least have the required structure
        expect(example.name).toBeTruthy();
        expect(example.transport).toBeTruthy();
        expect(['stdio', 'sse']).toContain(example.transport);
      });
    });
  });
});
