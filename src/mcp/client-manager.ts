/**
 * MCP Client Manager
 * Manages connections to MCP servers and tool execution
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ChatCompletionTool } from 'openai/resources';
import type {
  MCPServerConfig,
  MCPServerConnection,
  MCPTool,
  MCPToolResult,
} from './types.js';

export class MCPClientManager {
  private connections: Map<string, { client: Client; transport: any }> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private toolCache: Map<string, MCPTool[]> = new Map();

  /**
   * Add a server configuration
   */
  addServer(config: MCPServerConfig): void {
    this.serverConfigs.set(config.name, config);
  }

  /**
   * Remove a server configuration
   */
  removeServer(name: string): void {
    this.serverConfigs.delete(name);
    this.disconnect(name);
  }

  /**
   * Get all server configurations
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.serverConfigs.values());
  }

  /**
   * Get a specific server configuration
   */
  getServer(name: string): MCPServerConfig | undefined {
    return this.serverConfigs.get(name);
  }

  /**
   * Connect to a server
   */
  async connect(serverName: string): Promise<void> {
    const config = this.serverConfigs.get(serverName);
    if (!config) {
      throw new Error(`Server configuration not found: ${serverName}`);
    }

    if (!config.enabled) {
      throw new Error(`Server is disabled: ${serverName}`);
    }

    // Check if already connected
    if (this.connections.has(serverName)) {
      return;
    }

    try {
      let transport: any;

      if (config.transport === 'stdio') {
        if (!config.command) {
          throw new Error(`stdio transport requires a command: ${serverName}`);
        }

        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env,
        });
      } else if (config.transport === 'sse') {
        if (!config.url) {
          throw new Error(`SSE transport requires a URL: ${serverName}`);
        }

        transport = new SSEClientTransport(new URL(config.url));
      } else {
        throw new Error(`Unsupported transport: ${config.transport}`);
      }

      const client = new Client(
        {
          name: 'cadre',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await client.connect(transport);
      this.connections.set(serverName, { client, transport });

      // Fetch and cache tools
      await this.refreshTools(serverName);
    } catch (error) {
      throw new Error(
        `Failed to connect to server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return;
    }

    try {
      await connection.client.close();
    } catch (error) {
      // Ignore errors during disconnect
    }

    this.connections.delete(serverName);
    this.toolCache.delete(serverName);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.connections.keys());
    await Promise.all(serverNames.map((name) => this.disconnect(name)));
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverName: string): boolean {
    return this.connections.has(serverName);
  }

  /**
   * Refresh tools from a connected server
   */
  async refreshTools(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    try {
      const response = await connection.client.listTools();
      const tools: MCPTool[] = response.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object' },
      }));

      this.toolCache.set(serverName, tools);
    } catch (error) {
      throw new Error(
        `Failed to refresh tools from ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get tools from a specific server
   */
  getToolsFromServer(serverName: string): MCPTool[] {
    return this.toolCache.get(serverName) || [];
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): Map<string, MCPTool[]> {
    return new Map(this.toolCache);
  }

  /**
   * Convert MCP tools to OpenAI ChatCompletionTool format
   */
  convertToOpenAITools(): ChatCompletionTool[] {
    const tools: ChatCompletionTool[] = [];

    for (const [serverName, mcpTools] of this.toolCache.entries()) {
      for (const tool of mcpTools) {
        tools.push({
          type: 'function',
          function: {
            name: `mcp_${serverName}_${tool.name}`,
            description: `[MCP:${serverName}] ${tool.description}`,
            parameters: tool.inputSchema,
          },
        });
      }
    }

    return tools;
  }

  /**
   * Call a tool on a server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<MCPToolResult> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return {
        success: false,
        content: [],
        error: `Not connected to server: ${serverName}`,
      };
    }

    try {
      const response = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });

      return {
        success: !response.isError,
        content: response.content || [],
      };
    } catch (error) {
      return {
        success: false,
        content: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse an MCP tool name and extract server and tool names
   */
  parseMCPToolName(fullName: string): { serverName: string; toolName: string } | null {
    // Expected format: mcp_<serverName>_<toolName>
    const match = fullName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) {
      return null;
    }

    return {
      serverName: match[1],
      toolName: match[2],
    };
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): MCPServerConnection[] {
    return Array.from(this.serverConfigs.values()).map((config) => ({
      config,
      connected: this.isConnected(config.name),
      tools: this.getToolsFromServer(config.name),
    }));
  }

  /**
   * Connect to all enabled servers
   */
  async connectAll(): Promise<void> {
    const enabledServers = Array.from(this.serverConfigs.values()).filter(
      (config) => config.enabled,
    );

    const results = await Promise.allSettled(
      enabledServers.map((config) => this.connect(config.name)),
    );

    // Log any connection failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `Failed to connect to ${enabledServers[index].name}: ${result.reason}`,
        );
      }
    });
  }
}

// Singleton instance
let instance: MCPClientManager | null = null;

export function getMCPClientManager(): MCPClientManager {
  if (!instance) {
    instance = new MCPClientManager();
  }
  return instance;
}

/**
 * Reset the singleton instance for testing purposes
 * @internal
 */
export function resetMCPClientManagerForTesting(): void {
  instance = null;
}
