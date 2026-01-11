/**
 * MCP Server Configuration Storage
 * Manages persistent storage of MCP server configurations
 */

import Conf from 'conf';
import type { MCPServerConfig } from './types.js';

interface MCPConfigSchema {
  servers: MCPServerConfig[];
}

const mcpConfig = new Conf<MCPConfigSchema>({
  projectName: 'cadre',
  configName: 'mcp-servers',
  defaults: {
    servers: [],
  },
});

/**
 * Get all MCP server configurations
 */
export function getMCPServers(): MCPServerConfig[] {
  return mcpConfig.get('servers', []);
}

/**
 * Get a specific MCP server configuration by name
 */
export function getMCPServer(name: string): MCPServerConfig | undefined {
  const servers = getMCPServers();
  return servers.find((s) => s.name === name);
}

/**
 * Add or update an MCP server configuration
 */
export function setMCPServer(config: MCPServerConfig): void {
  const servers = getMCPServers();
  const index = servers.findIndex((s) => s.name === config.name);

  if (index >= 0) {
    // Update existing
    servers[index] = config;
  } else {
    // Add new
    servers.push(config);
  }

  mcpConfig.set('servers', servers);
}

/**
 * Remove an MCP server configuration
 */
export function removeMCPServer(name: string): boolean {
  const servers = getMCPServers();
  const filtered = servers.filter((s) => s.name !== name);

  if (filtered.length === servers.length) {
    return false; // No server was removed
  }

  mcpConfig.set('servers', filtered);
  return true;
}

/**
 * Enable/disable an MCP server
 */
export function toggleMCPServer(name: string, enabled: boolean): boolean {
  const servers = getMCPServers();
  const server = servers.find((s) => s.name === name);

  if (!server) {
    return false;
  }

  server.enabled = enabled;
  mcpConfig.set('servers', servers);
  return true;
}

/**
 * Clear all MCP server configurations
 */
export function clearMCPServers(): void {
  mcpConfig.set('servers', []);
}

/**
 * Validate MCP server configuration
 */
export function validateMCPServerConfig(config: MCPServerConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.name || config.name.trim() === '') {
    errors.push('Server name is required');
  }

  if (!config.transport) {
    errors.push('Transport type is required');
  }

  if (config.transport === 'stdio' && !config.command) {
    errors.push('Command is required for stdio transport');
  }

  if (config.transport === 'sse' && !config.url) {
    errors.push('URL is required for SSE transport');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default example configurations for common MCP servers
 */
export function getExampleMCPServers(): MCPServerConfig[] {
  return [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
      transport: 'stdio',
      enabled: false,
    },
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'your_token_here',
      },
      transport: 'stdio',
      enabled: false,
    },
    {
      name: 'brave-search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: 'your_api_key_here',
      },
      transport: 'stdio',
      enabled: false,
    },
    {
      name: 'postgres',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
      transport: 'stdio',
      enabled: false,
    },
  ];
}
