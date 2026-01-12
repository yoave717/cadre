import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MCPServerConfig } from '../../src/mcp/types.js';

// Mock storage for config
let mockConfigStorage: { servers: MCPServerConfig[] } = { servers: [] };

vi.mock('conf', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn((key: string, defaultValue?: any) => {
      return mockConfigStorage[key as keyof typeof mockConfigStorage] ?? defaultValue;
    }),
    set: vi.fn((key: string, value: any) => {
      mockConfigStorage[key as keyof typeof mockConfigStorage] = value;
    }),
  })),
}));

// Mock MCP SDK
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
  callTool: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ type: 'text', text: 'result' }],
  }),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// Import after mocking
const { setMCPServer, clearMCPServers } = await import('../../src/mcp/config.js');
const { MCPClientManager, resetMCPClientManagerForTesting } = await import(
  '../../src/mcp/client-manager.js'
);

describe('MCP Full Lifecycle Integration', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigStorage = { servers: [] };
    resetMCPClientManagerForTesting();
    manager = new MCPClientManager();
  });

  afterEach(async () => {
    await manager.disconnectAll();
    clearMCPServers();
  });

  describe('stdio transport lifecycle', () => {
    it('should complete full lifecycle: configure → connect → list tools → call tool → disconnect', async () => {
      // 1. Configure server via config.ts
      const config: MCPServerConfig = {
        name: 'test-filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        transport: 'stdio',
        enabled: true,
      };
      setMCPServer(config);

      // 2. Add server to manager
      manager.addServer(config);

      // 3. Connect to server
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          {
            name: 'read_file',
            description: 'Read a file from the filesystem',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
          {
            name: 'write_file',
            description: 'Write content to a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
        ],
      });

      await manager.connect('test-filesystem');
      expect(manager.isConnected('test-filesystem')).toBe(true);

      // 4. List tools
      const tools = manager.getToolsFromServer('test-filesystem');
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('read_file');
      expect(tools.map((t) => t.name)).toContain('write_file');

      // 5. Call a tool
      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'File contents here' }],
      });

      const result = await manager.callTool('test-filesystem', 'read_file', {
        path: '/tmp/test.txt',
      });
      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe('File contents here');

      // 6. Disconnect
      await manager.disconnect('test-filesystem');
      expect(manager.isConnected('test-filesystem')).toBe(false);

      // 7. Verify cleanup
      const toolsAfterDisconnect = manager.getToolsFromServer('test-filesystem');
      expect(toolsAfterDisconnect).toHaveLength(0);
    });

    it('should handle multiple operations on same connection', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'operation1', description: 'Op 1', inputSchema: { type: 'object' } },
          { name: 'operation2', description: 'Op 2', inputSchema: { type: 'object' } },
        ],
      });

      await manager.connect('test-server');

      // Call first operation
      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'Result 1' }],
      });
      const result1 = await manager.callTool('test-server', 'operation1', {});
      expect(result1.success).toBe(true);

      // Call second operation on same connection
      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'Result 2' }],
      });
      const result2 = await manager.callTool('test-server', 'operation2', {});
      expect(result2.success).toBe(true);

      await manager.disconnect('test-server');
    });
  });

  describe('SSE transport lifecycle', () => {
    it('should complete full lifecycle with SSE transport', async () => {
      const config: MCPServerConfig = {
        name: 'sse-server',
        url: 'http://localhost:3000/mcp',
        transport: 'sse',
        enabled: true,
      };

      setMCPServer(config);
      manager.addServer(config);

      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'api_call', description: 'Make API call', inputSchema: { type: 'object' } }],
      });

      await manager.connect('sse-server');
      expect(manager.isConnected('sse-server')).toBe(true);

      const tools = manager.getToolsFromServer('sse-server');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('api_call');

      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'API response' }],
      });

      const result = await manager.callTool('sse-server', 'api_call', { endpoint: '/users' });
      expect(result.success).toBe(true);

      await manager.disconnect('sse-server');
      expect(manager.isConnected('sse-server')).toBe(false);
    });
  });

  describe('Multi-server scenario', () => {
    it('should handle multiple servers simultaneously', async () => {
      const stdioConfig: MCPServerConfig = {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        transport: 'stdio',
        enabled: true,
      };

      const sseConfig: MCPServerConfig = {
        name: 'api-server',
        url: 'http://localhost:3000/mcp',
        transport: 'sse',
        enabled: true,
      };

      manager.addServer(stdioConfig);
      manager.addServer(sseConfig);

      // Mock tools for first server
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'read_file', description: 'Read file', inputSchema: { type: 'object' } }],
      });

      // Mock tools for second server
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'fetch_data', description: 'Fetch data', inputSchema: { type: 'object' } }],
      });

      // Connect to both
      await manager.connectAll();

      expect(manager.isConnected('filesystem')).toBe(true);
      expect(manager.isConnected('api-server')).toBe(true);

      // Get all tools
      const allTools = manager.getAllTools();
      expect(allTools.size).toBe(2);
      expect(allTools.get('filesystem')).toHaveLength(1);
      expect(allTools.get('api-server')).toHaveLength(1);

      // Convert to OpenAI format
      const openAITools = manager.convertToOpenAITools();
      expect(openAITools).toHaveLength(2);
      expect(openAITools.map((t) => t.function.name)).toContain('mcp_filesystem_read_file');
      expect(openAITools.map((t) => t.function.name)).toContain('mcp_api-server_fetch_data');

      // Call tools from different servers
      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'File content' }],
      });
      const result1 = await manager.callTool('filesystem', 'read_file', { path: '/test' });
      expect(result1.success).toBe(true);

      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'API data' }],
      });
      const result2 = await manager.callTool('api-server', 'fetch_data', { id: '123' });
      expect(result2.success).toBe(true);

      // Disconnect all
      await manager.disconnectAll();
      expect(manager.isConnected('filesystem')).toBe(false);
      expect(manager.isConnected('api-server')).toBe(false);
    });

    it('should skip disabled servers in connectAll', async () => {
      const enabledConfig: MCPServerConfig = {
        name: 'enabled-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      const disabledConfig: MCPServerConfig = {
        name: 'disabled-server',
        command: 'node',
        transport: 'stdio',
        enabled: false,
      };

      manager.addServer(enabledConfig);
      manager.addServer(disabledConfig);

      await manager.connectAll();

      expect(manager.isConnected('enabled-server')).toBe(true);
      expect(manager.isConnected('disabled-server')).toBe(false);
    });
  });

  describe('Tool execution flow (End-to-End)', () => {
    it('should execute complete flow from setup to result', async () => {
      // Setup: Configure and connect server
      const config: MCPServerConfig = {
        name: 'github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'test-token' },
        transport: 'stdio',
        enabled: true,
      };

      setMCPServer(config);
      manager.addServer(config);

      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          {
            name: 'create_issue',
            description: 'Create a GitHub issue',
            inputSchema: {
              type: 'object',
              properties: {
                repo: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['repo', 'title'],
            },
          },
        ],
      });

      await manager.connect('github');

      // Agent gets all tools
      const openAITools = manager.convertToOpenAITools();
      expect(openAITools).toHaveLength(1);
      expect(openAITools[0].function.name).toBe('mcp_github_create_issue');
      expect(openAITools[0].function.description).toBe('[MCP:github] Create a GitHub issue');

      // LLM decides to use MCP tool (simulated)
      const toolName = 'mcp_github_create_issue';
      const toolArgs = {
        repo: 'owner/repo',
        title: 'Test issue',
        body: 'Issue body',
      };

      // Parse tool name
      const parsed = manager.parseMCPToolName(toolName);
      expect(parsed).toEqual({
        serverName: 'github',
        toolName: 'create_issue',
      });

      // Execute tool
      mockClient.callTool.mockResolvedValueOnce({
        isError: false,
        content: [
          { type: 'text', text: 'Issue created successfully' },
          {
            type: 'resource',
            data: 'https://github.com/owner/repo/issues/1',
            mimeType: 'text/uri-list',
          },
        ],
      });

      const result = await manager.callTool(parsed!.serverName, parsed!.toolName, toolArgs);

      // Agent receives result
      expect(result.success).toBe(true);
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('text');
      expect(result.content[1].type).toBe('resource');
    });
  });

  describe('Error handling in lifecycle', () => {
    it('should handle connection failure gracefully', async () => {
      const config: MCPServerConfig = {
        name: 'failing-server',
        command: 'nonexistent-command',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClient.connect.mockRejectedValueOnce(new Error('Command not found'));

      await expect(manager.connect('failing-server')).rejects.toThrow();
      expect(manager.isConnected('failing-server')).toBe(false);
    });

    it('should continue with other servers when one fails in connectAll', async () => {
      const goodConfig: MCPServerConfig = {
        name: 'good-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      const badConfig: MCPServerConfig = {
        name: 'bad-server',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(goodConfig);
      manager.addServer(badConfig);

      await manager.connectAll();

      expect(manager.isConnected('good-server')).toBe(true);
      expect(manager.isConnected('bad-server')).toBe(false);
    });

    it('should handle tool execution errors', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'failing_tool', description: 'Fails', inputSchema: { type: 'object' } }],
      });
      await manager.connect('test-server');

      mockClient.callTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed' }],
      });

      const result = await manager.callTool('test-server', 'failing_tool', {});

      expect(result.success).toBe(false);
    });
  });

  describe('Connection status throughout lifecycle', () => {
    it('should report accurate status at each stage', async () => {
      const config: MCPServerConfig = {
        name: 'status-test',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);

      // Before connection
      let status = manager.getConnectionStatus();
      expect(status).toHaveLength(1);
      expect(status[0].connected).toBe(false);
      expect(status[0].tools).toHaveLength(0);

      // After connection
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
      });
      await manager.connect('status-test');

      status = manager.getConnectionStatus();
      expect(status[0].connected).toBe(true);
      expect(status[0].tools).toHaveLength(1);

      // After disconnect
      await manager.disconnect('status-test');

      status = manager.getConnectionStatus();
      expect(status[0].connected).toBe(false);
      expect(status[0].tools).toHaveLength(0);
    });
  });

  describe('Tool cache management', () => {
    it('should maintain tool cache across operations', async () => {
      const config: MCPServerConfig = {
        name: 'cache-test',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
        ],
      });
      await manager.connect('cache-test');

      // Tools should be cached
      const tools1 = manager.getToolsFromServer('cache-test');
      const tools2 = manager.getToolsFromServer('cache-test');

      expect(tools1).toBe(tools2); // Same reference
      expect(mockClient.listTools).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache on manual refresh', async () => {
      const config: MCPServerConfig = {
        name: 'refresh-test',
        command: 'node',
        transport: 'stdio',
        enabled: true,
      };

      manager.addServer(config);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
      });
      await manager.connect('refresh-test');

      // Refresh tools
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
        ],
      });
      await manager.refreshTools('refresh-test');

      const tools = manager.getToolsFromServer('refresh-test');
      expect(tools).toHaveLength(2);
      expect(mockClient.listTools).toHaveBeenCalledTimes(2);
    });
  });
});
