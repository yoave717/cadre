/**
 * MCP (Model Context Protocol) Type Definitions
 */

export interface MCPServerConfig {
  /** Unique identifier for this server */
  name: string;
  /** Server command to execute (for stdio transport) */
  command?: string;
  /** Server command arguments */
  args?: string[];
  /** Server environment variables */
  env?: Record<string, string>;
  /** Server URL (for SSE/HTTP transport) */
  url?: string;
  /** Transport type */
  transport: 'stdio' | 'sse';
  /** Whether server is enabled */
  enabled: boolean;
}

export interface MCPTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for tool parameters */
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  args: Record<string, any>;
}

export interface MCPToolResult {
  /** Whether the call was successful */
  success: boolean;
  /** Result content (can be array of text/image/resource content) */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  /** Error message if failed */
  error?: string;
}

export interface MCPServerConnection {
  /** Server configuration */
  config: MCPServerConfig;
  /** Whether currently connected */
  connected: boolean;
  /** Available tools from this server */
  tools: MCPTool[];
  /** Last error if any */
  lastError?: string;
}
