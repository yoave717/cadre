import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MCPServerConfig } from '../../src/mcp/types.js';

// Mock the MCP SDK
const mockClientInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
  callTool: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ type: 'text', text: 'result' }],
  }),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClientInstance),
}));

const mockStdioTransport = vi.fn().mockImplementation(() => ({}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockStdioTransport,
}));

const mockSSETransport = vi.fn().mockImplementation(() => ({}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: mockSSETransport,
}));

// Import after mocking
const { MCPClientManager, resetMCPClientManagerForTesting } = await import(
  '../../src/mcp/client-manager.js'
);

describe('MCPClientManager', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMCPClientManagerForTesting();
    manager = new MCPClientManager();
  });

  describe('Server Configuration Management', () => {
    it('should add server to internal map', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);

      const server = manager.getServer('test-server');
      expect(server).toEqual(config);
    });

    it('should remove server and disconnect', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      await manager.connect('test-server');

      manager.removeServer('test-server');

      // Wait a tick for async disconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.isConnected('test-server')).toBe(false);
      expect(manager.getServer('test-server')).toBeUndefined();
    });

    it('should return array of all servers', () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        url: 'http://localhost:3000',
        transport: 'sse',
        enabled: true,
      };

      manager.addServer(config1);
      manager.addServer(config2);

      const servers = manager.getServers();
      expect(servers).toHaveLength(2);
      expect(servers).toContainEqual(config1);
      expect(servers).toContainEqual(config2);
    });

    it('should return specific server or undefined', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);

      expect(manager.getServer('test-server')).toEqual(config);
      expect(manager.getServer('nonexistent')).toBeUndefined();
    });
  });

  describe('Connection Management - stdio', () => {
    const stdioConfig: MCPServerConfig = {
      name: 'stdio-server',
      command: 'node',
      args: ['server.js'],
      env: { API_KEY: 'test' },
      transport: 'stdio',
      enabled: true,
    };

    it('should create StdioClientTransport with correct params', async () => {
      manager.addServer(stdioConfig);

      await manager.connect('stdio-server');

      expect(mockStdioTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: { API_KEY: 'test' },
      });
    });

    it('should create Client and connect', async () => {
      manager.addServer(stdioConfig);

      await manager.connect('stdio-server');

      expect(mockClientInstance.connect).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should cache connection', async () => {
      manager.addServer(stdioConfig);

      await manager.connect('stdio-server');

      expect(manager.isConnected('stdio-server')).toBe(true);
    });

    it('should refresh tools after connection', async () => {
      manager.addServer(stdioConfig);
      mockClientInstance.listTools.mockResolvedValueOnce({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            inputSchema: { type: 'object' },
          },
        ],
      });

      await manager.connect('stdio-server');

      expect(mockClientInstance.listTools).toHaveBeenCalled();
      const tools = manager.getToolsFromServer('stdio-server');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('should throw if server not found', async () => {
      await expect(manager.connect('nonexistent')).rejects.toThrow(
        'Server configuration not found: nonexistent',
      );
    });

    it('should throw if server disabled', async () => {
      const disabledConfig: MCPServerConfig = {
        ...stdioConfig,
        enabled: false,
      };
      manager.addServer(disabledConfig);

      await expect(manager.connect('stdio-server')).rejects.toThrow(
        'Server is disabled: stdio-server',
      );
    });

    it('should not reconnect if already connected', async () => {
      manager.addServer(stdioConfig);

      await manager.connect('stdio-server');
      await manager.connect('stdio-server');

      expect(mockClientInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should throw if command missing for stdio', async () => {
      const invalidConfig: MCPServerConfig = {
        name: 'invalid-server',
        transport: 'stdio',
        enabled: true,
      };
      manager.addServer(invalidConfig);

      await expect(manager.connect('invalid-server')).rejects.toThrow(
        'stdio transport requires a command',
      );
    });
  });

  describe('Connection Management - SSE', () => {
    const sseConfig: MCPServerConfig = {
      name: 'sse-server',
      url: 'http://localhost:3000/mcp',
      transport: 'sse',
      enabled: true,
    };

    it('should create SSEClientTransport with URL', async () => {
      manager.addServer(sseConfig);

      await manager.connect('sse-server');

      expect(mockSSETransport).toHaveBeenCalledWith(new URL('http://localhost:3000/mcp'));
    });

    it('should handle URL parsing', async () => {
      manager.addServer(sseConfig);

      await manager.connect('sse-server');

      expect(manager.isConnected('sse-server')).toBe(true);
    });

    it('should throw if URL missing for SSE', async () => {
      const invalidConfig: MCPServerConfig = {
        name: 'invalid-sse',
        transport: 'sse',
        enabled: true,
      };
      manager.addServer(invalidConfig);

      await expect(manager.connect('invalid-sse')).rejects.toThrow('SSE transport requires a URL');
    });
  });

  describe('Disconnect Operations', () => {
    const testConfig: MCPServerConfig = {
      name: 'test-server',
      command: 'node',
      transport: 'stdio',
      enabled: true,
    };

    it('should close client connection', async () => {
      manager.addServer(testConfig);
      await manager.connect('test-server');

      await manager.disconnect('test-server');

      expect(mockClientInstance.close).toHaveBeenCalled();
    });

    it('should remove from connections map', async () => {
      manager.addServer(testConfig);
      await manager.connect('test-server');

      await manager.disconnect('test-server');

      expect(manager.isConnected('test-server')).toBe(false);
    });

    it('should clear tool cache', async () => {
      manager.addServer(testConfig);
      mockClientInstance.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
      });
      await manager.connect('test-server');

      await manager.disconnect('test-server');

      const tools = manager.getToolsFromServer('test-server');
      expect(tools).toHaveLength(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      manager.addServer(testConfig);
      await manager.connect('test-server');

      mockClientInstance.close.mockRejectedValueOnce(new Error('Close failed'));

      await expect(manager.disconnect('test-server')).resolves.not.toThrow();
      expect(manager.isConnected('test-server')).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(manager.disconnect('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return correct status', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);

      expect(manager.isConnected('test-server')).toBe(false);

      await manager.connect('test-server');

      expect(manager.isConnected('test-server')).toBe(true);

      await manager.disconnect('test-server');

      expect(manager.isConnected('test-server')).toBe(false);
    });
  });

  describe('Tool Operations', () => {
    const testConfig: MCPServerConfig = {
      name: 'test-server',
      command: 'node',
      transport: 'stdio',
      enabled: true,
    };

    describe('refreshTools', () => {
      it('should call client.listTools', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
        });

        await manager.refreshTools('test-server');

        expect(mockClientInstance.listTools).toHaveBeenCalled();
      });

      it('should map tools to MCPTool format', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              inputSchema: { type: 'object', properties: { arg1: { type: 'string' } } },
            },
          ],
        });

        await manager.refreshTools('test-server');

        const tools = manager.getToolsFromServer('test-server');
        expect(tools).toHaveLength(1);
        expect(tools[0]).toEqual({
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: { arg1: { type: 'string' } } },
        });
      });

      it('should cache tools', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
        });

        await manager.refreshTools('test-server');

        const tools1 = manager.getToolsFromServer('test-server');
        const tools2 = manager.getToolsFromServer('test-server');
        expect(tools1).toEqual(tools2);
      });

      it('should handle missing inputSchema', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1' }],
        });

        await manager.refreshTools('test-server');

        const tools = manager.getToolsFromServer('test-server');
        expect(tools[0].inputSchema).toEqual({ type: 'object' });
      });

      it('should handle missing description', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', inputSchema: { type: 'object' } }],
        });

        await manager.refreshTools('test-server');

        const tools = manager.getToolsFromServer('test-server');
        expect(tools[0].description).toBe('');
      });

      it('should throw if not connected', async () => {
        await expect(manager.refreshTools('nonexistent')).rejects.toThrow(
          'Not connected to server: nonexistent',
        );
      });
    });

    describe('getToolsFromServer', () => {
      it('should return cached tools', async () => {
        manager.addServer(testConfig);
        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
        });
        await manager.connect('test-server');

        const tools = manager.getToolsFromServer('test-server');

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('tool1');
      });

      it('should return empty array if no tools cached', () => {
        const tools = manager.getToolsFromServer('nonexistent');

        expect(tools).toEqual([]);
      });
    });

    describe('getAllTools', () => {
      it('should return Map of all cached tools', async () => {
        const config1: MCPServerConfig = {
          name: 'server1',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };
        const config2: MCPServerConfig = {
          name: 'server2',
          command: 'python',
          transport: 'stdio',
          enabled: true,
        };

        manager.addServer(config1);
        manager.addServer(config2);

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
        });
        await manager.connect('server1');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }],
        });
        await manager.connect('server2');

        const allTools = manager.getAllTools();

        expect(allTools.size).toBe(2);
        expect(allTools.get('server1')).toHaveLength(1);
        expect(allTools.get('server2')).toHaveLength(1);
      });
    });

    describe('convertToOpenAITools', () => {
      it('should format tools with mcp_<server>_<tool> naming', async () => {
        manager.addServer(testConfig);
        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
        });
        await manager.connect('test-server');

        const openAITools = manager.convertToOpenAITools();

        expect(openAITools).toHaveLength(1);
        expect(openAITools[0].function.name).toBe('mcp_test-server_read_file');
      });

      it('should add [MCP:server] prefix to descriptions', async () => {
        manager.addServer(testConfig);
        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
        });
        await manager.connect('test-server');

        const openAITools = manager.convertToOpenAITools();

        expect(openAITools[0].function.description).toBe('[MCP:test-server] Read a file');
      });

      it('should convert inputSchema to parameters', async () => {
        manager.addServer(testConfig);
        const schema = {
          type: 'object' as const,
          properties: { path: { type: 'string' } },
          required: ['path'],
        };
        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'read_file', description: 'Read a file', inputSchema: schema }],
        });
        await manager.connect('test-server');

        const openAITools = manager.convertToOpenAITools();

        expect(openAITools[0].function.parameters).toEqual(schema);
      });

      it('should handle multiple servers', async () => {
        const config1: MCPServerConfig = {
          name: 'server1',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };
        const config2: MCPServerConfig = {
          name: 'server2',
          command: 'python',
          transport: 'stdio',
          enabled: true,
        };

        manager.addServer(config1);
        manager.addServer(config2);

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
        });
        await manager.connect('server1');

        mockClientInstance.listTools.mockResolvedValueOnce({
          tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }],
        });
        await manager.connect('server2');

        const openAITools = manager.convertToOpenAITools();

        expect(openAITools).toHaveLength(2);
        expect(openAITools.map((t) => t.function.name)).toContain('mcp_server1_tool1');
        expect(openAITools.map((t) => t.function.name)).toContain('mcp_server2_tool2');
      });

      it('should return empty array if no tools', () => {
        const openAITools = manager.convertToOpenAITools();

        expect(openAITools).toEqual([]);
      });
    });

    describe('callTool', () => {
      it('should call client.callTool with correct params', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        const args = { path: '/test/file.txt' };
        await manager.callTool('test-server', 'read_file', args);

        expect(mockClientInstance.callTool).toHaveBeenCalledWith({
          name: 'read_file',
          arguments: args,
        });
      });

      it('should return success result with content', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.callTool.mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'text', text: 'file contents' }],
        });

        const result = await manager.callTool('test-server', 'read_file', { path: '/test' });

        expect(result.success).toBe(true);
        expect(result.content).toEqual([{ type: 'text', text: 'file contents' }]);
        expect(result.error).toBeUndefined();
      });

      it('should return error result if not connected', async () => {
        const result = await manager.callTool('nonexistent', 'read_file', {});

        expect(result.success).toBe(false);
        expect(result.content).toEqual([]);
        expect(result.error).toBe('Not connected to server: nonexistent');
      });

      it('should handle tool execution errors', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.callTool.mockRejectedValueOnce(new Error('Tool execution failed'));

        const result = await manager.callTool('test-server', 'read_file', {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Tool execution failed');
      });

      it('should handle isError flag in response', async () => {
        manager.addServer(testConfig);
        await manager.connect('test-server');

        mockClientInstance.callTool.mockResolvedValueOnce({
          isError: true,
          content: [{ type: 'text', text: 'Error message' }],
        });

        const result = await manager.callTool('test-server', 'read_file', {});

        expect(result.success).toBe(false);
      });
    });
  });

  describe('Tool Name Parsing', () => {
    it('should parse mcp_server_tool correctly', () => {
      const result = manager.parseMCPToolName('mcp_myserver_read_file');

      expect(result).toEqual({
        serverName: 'myserver',
        toolName: 'read_file',
      });
    });

    it('should parse tool names with underscores', () => {
      const result = manager.parseMCPToolName('mcp_my-server_read_file_content');

      expect(result).toEqual({
        serverName: 'my-server',
        toolName: 'read_file_content',
      });
    });

    it('should return null for invalid format', () => {
      const result = manager.parseMCPToolName('invalid_tool_name');

      expect(result).toBeNull();
    });

    it('should return null for non-MCP tools', () => {
      const result = manager.parseMCPToolName('read_file');

      expect(result).toBeNull();
    });

    it('should handle edge case: mcp_ prefix only', () => {
      const result = manager.parseMCPToolName('mcp_');

      expect(result).toBeNull();
    });

    it('should handle edge case: missing tool name', () => {
      const result = manager.parseMCPToolName('mcp_server_');

      // Regex requires at least one character for tool name, so this returns null
      expect(result).toBeNull();
    });
  });

  describe('Connection Status', () => {
    it('should return array of MCPServerConnection objects', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      await manager.connect('test-server');

      const status = manager.getConnectionStatus();

      expect(status).toHaveLength(1);
      expect(status[0].config).toEqual(config);
      expect(status[0].connected).toBe(true);
    });

    it('should include connection status', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);

      const status = manager.getConnectionStatus();

      expect(status[0].connected).toBe(false);
    });

    it('should include tool list', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClientInstance.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
      });
      await manager.connect('test-server');

      const status = manager.getConnectionStatus();

      expect(status[0].tools).toHaveLength(1);
      expect(status[0].tools[0].name).toBe('tool1');
    });
  });

  describe('connectAll', () => {
    it('should connect to all enabled servers', async () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        command: 'python',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config1);
      manager.addServer(config2);

      await manager.connectAll();

      expect(manager.isConnected('server1')).toBe(true);
      expect(manager.isConnected('server2')).toBe(true);
    });

    it('should skip disabled servers', async () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        command: 'python',
        transport: 'stdio',
        enabled: false,
      };

      manager.addServer(config1);
      manager.addServer(config2);

      await manager.connectAll();

      expect(manager.isConnected('server1')).toBe(true);
      expect(manager.isConnected('server2')).toBe(false);
    });

    it('should continue on individual connection failures', async () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config1);
      manager.addServer(config2);

      await manager.connectAll();

      expect(manager.isConnected('server1')).toBe(true);
      expect(manager.isConnected('server2')).toBe(false);
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connected servers', async () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        command: 'python',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config1);
      manager.addServer(config2);

      await manager.connect('server1');
      await manager.connect('server2');

      await manager.disconnectAll();

      expect(manager.isConnected('server1')).toBe(false);
      expect(manager.isConnected('server2')).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    describe('Connection Errors', () => {
      it('should handle connection timeout', async () => {
        const config: MCPServerConfig = {
          name: 'timeout-server',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };

        manager.addServer(config);
        mockClientInstance.connect.mockRejectedValueOnce(new Error('Connection timeout'));

        await expect(manager.connect('timeout-server')).rejects.toThrow('Connection timeout');
      });

      it('should handle transport creation failure', async () => {
        const config: MCPServerConfig = {
          name: 'fail-server',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };

        manager.addServer(config);
        mockStdioTransport.mockImplementationOnce(() => {
          throw new Error('Transport creation failed');
        });

        await expect(manager.connect('fail-server')).rejects.toThrow('Transport creation failed');
      });
    });

    describe('Malformed Responses', () => {
      it('should handle invalid tool call response structure', async () => {
        const config: MCPServerConfig = {
          name: 'test-server',
          command: 'node',
          transport: 'stdio',
          enabled: true,
        };

        manager.addServer(config);
        await manager.connect('test-server');

        mockClientInstance.callTool.mockResolvedValueOnce({});

        const result = await manager.callTool('test-server', 'tool', {});

        expect(result.success).toBe(true);
        expect(result.content).toEqual([]);
      });
    });
  });
});
