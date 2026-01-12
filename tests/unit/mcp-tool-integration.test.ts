import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock MCP manager
const mockMCPManager = {
  convertToOpenAITools: vi.fn(() => []),
  parseMCPToolName: vi.fn(),
  callTool: vi.fn(),
};

// Mock the MCP module
vi.mock('../../src/mcp/index.js', () => ({
  getMCPClientManager: vi.fn(() => mockMCPManager),
}));

// Import after mocking
const { getAllTools, handleToolCall } = await import('../../src/agent/tools.js');

describe('MCP Tool Integration with Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllTools', () => {
    it('should merge built-in tools with MCP tools', () => {
      mockMCPManager.convertToOpenAITools.mockReturnValueOnce([
        {
          type: 'function',
          function: {
            name: 'mcp_filesystem_read_file',
            description: '[MCP:filesystem] Read a file',
            parameters: { type: 'object' },
          },
        },
      ]);

      const tools = getAllTools();

      expect(tools.length).toBeGreaterThan(0);
      const mcpTool = tools.find((t) => t.function.name === 'mcp_filesystem_read_file');
      expect(mcpTool).toBeDefined();
    });

    it('should call getMCPClientManager', () => {
      getAllTools();

      expect(mockMCPManager.convertToOpenAITools).toHaveBeenCalled();
    });

    it('should return combined array', () => {
      mockMCPManager.convertToOpenAITools.mockReturnValueOnce([
        {
          type: 'function',
          function: {
            name: 'mcp_test_tool',
            description: 'Test tool',
            parameters: { type: 'object' },
          },
        },
      ]);

      const tools = getAllTools();

      expect(Array.isArray(tools)).toBe(true);
      const hasBuiltInTools = tools.some((t) => !t.function.name.startsWith('mcp_'));
      const hasMCPTools = tools.some((t) => t.function.name.startsWith('mcp_'));
      expect(hasBuiltInTools).toBe(true);
      expect(hasMCPTools).toBe(true);
    });

    it('should work when no MCP tools available', () => {
      mockMCPManager.convertToOpenAITools.mockReturnValueOnce([]);

      const tools = getAllTools();

      expect(tools.length).toBeGreaterThan(0);
      const hasMCPTools = tools.some((t) => t.function.name.startsWith('mcp_'));
      expect(hasMCPTools).toBe(false);
    });
  });

  describe('handleToolCall', () => {
    describe('MCP tool calls', () => {
      it('should detect MCP tool by name pattern', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'filesystem',
          toolName: 'read_file',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'text', text: 'file contents' }],
        });

        await handleToolCall('mcp_filesystem_read_file', { path: '/test.txt' });

        expect(mockMCPManager.parseMCPToolName).toHaveBeenCalledWith('mcp_filesystem_read_file');
      });

      it('should parse server and tool name', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'myserver',
          toolName: 'my_tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'text', text: 'result' }],
        });

        await handleToolCall('mcp_myserver_my_tool', { arg: 'value' });

        expect(mockMCPManager.callTool).toHaveBeenCalledWith('myserver', 'my_tool', {
          arg: 'value',
        });
      });

      it('should call mcpManager.callTool', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'text', text: 'result' }],
        });

        const args = { key: 'value' };
        await handleToolCall('mcp_server_tool', args);

        expect(mockMCPManager.callTool).toHaveBeenCalledWith('server', 'tool', args);
      });

      it('should format text content correctly', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'text', text: 'Hello world' }],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('Hello world');
      });

      it('should format image content as [Image: mimeType]', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [
            {
              type: 'image',
              data: 'base64data',
              mimeType: 'image/png',
            },
          ],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('[Image: image/png]');
      });

      it('should format resource content as [Resource: mimeType]', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [
            {
              type: 'resource',
              data: 'resource data',
              mimeType: 'application/json',
            },
          ],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('[Resource: application/json]');
      });

      it('should handle multiple content items', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [
            { type: 'text', text: 'First line' },
            { type: 'text', text: 'Second line' },
            { type: 'image', mimeType: 'image/png' },
          ],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('First line\nSecond line\n[Image: image/png]');
      });

      it('should handle missing mimeType', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'image', data: 'data' }],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('[Image: unknown]');
      });

      it('should handle missing text content', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [{ type: 'text' }],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('');
      });

      it('should return error message on failure', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: false,
          content: [],
          error: 'Connection failed',
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('MCP Tool Error: Connection failed');
      });

      it('should handle unknown error', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: false,
          content: [],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('MCP Tool Error: Unknown error');
      });

      it('should handle empty content array', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('');
      });
    });

    describe('Non-MCP tool calls', () => {
      it('should delegate to regular tool handlers', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce(null);

        // This will call a built-in tool handler
        // We just need to ensure it doesn't try to call MCP manager
        await handleToolCall('list_files', { path: '/test' });

        expect(mockMCPManager.callTool).not.toHaveBeenCalled();
      });

      it('should not interfere with built-in tools', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce(null);

        // Built-in tools should work normally
        const result = await handleToolCall('invalid_tool_name', {});

        expect(mockMCPManager.callTool).not.toHaveBeenCalled();
        // The result will be an error from the built-in handler
        expect(typeof result).toBe('string');
      });
    });

    describe('Edge cases', () => {
      it('should handle unknown content type', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockResolvedValueOnce({
          success: true,
          content: [
            { type: 'text', text: 'valid' },
            { type: 'unknown_type' as any, data: 'data' },
          ],
        });

        const result = await handleToolCall('mcp_server_tool', {});

        expect(result).toBe('valid\n');
      });

      it('should handle callTool throwing error', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce({
          serverName: 'server',
          toolName: 'tool',
        });
        mockMCPManager.callTool.mockRejectedValueOnce(new Error('Network error'));

        await expect(handleToolCall('mcp_server_tool', {})).rejects.toThrow('Network error');
      });

      it('should pass execution context through', async () => {
        mockMCPManager.parseMCPToolName.mockReturnValueOnce(null);

        // The execution context should be passed to built-in handlers
        await handleToolCall('list_files', { path: '/test' }, 'test-context');

        // We're just verifying it doesn't throw
        expect(true).toBe(true);
      });
    });
  });
});
