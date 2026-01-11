# MCP (Model Context Protocol) Support

Cadre now supports the Model Context Protocol (MCP), allowing you to connect to external tools and services through standardized MCP servers.

## What is MCP?

The Model Context Protocol (MCP) is an open protocol that enables seamless integration between LLM applications and external data sources and tools. It provides a standardized way to connect AI assistants with the context they need.

## Features

- **Multiple Server Support**: Connect to multiple MCP servers simultaneously
- **Automatic Tool Discovery**: Automatically discover and use tools from connected servers
- **Persistent Configuration**: Server configurations are saved and persist across sessions
- **Easy Management**: Simple CLI commands to add, remove, enable/disable servers
- **Transport Support**: Supports stdio and SSE (Server-Sent Events) transports

## Quick Start

### 1. View Example Configurations

```bash
cadre mcp examples
```

This shows example configurations for common MCP servers like:
- **filesystem**: Access to local filesystem
- **github**: GitHub API integration
- **brave-search**: Web search capabilities
- **postgres**: PostgreSQL database access

### 2. Add an MCP Server

#### Using stdio transport (default):

```bash
cadre mcp add <server-name> --command <command> --args <arg1> <arg2> ...
```

Example:
```bash
cadre mcp add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token
```

#### Using SSE transport:

```bash
cadre mcp add <server-name> --transport sse --url <server-url>
```

### 3. List Configured Servers

```bash
cadre mcp list
```

This shows:
- All configured servers
- Their enabled/disabled status
- Transport type
- Currently connected servers and available tools

### 4. Test a Server Connection

```bash
cadre mcp test <server-name>
```

This attempts to connect to the server and lists all available tools.

### 5. Enable/Disable Servers

```bash
cadre mcp enable <server-name>
cadre mcp disable <server-name>
```

Only enabled servers will be automatically connected when Cadre starts.

### 6. Remove a Server

```bash
cadre mcp remove <server-name>
```

### 7. Clear All Servers

```bash
cadre mcp clear
```

## Using MCP Tools in Cadre

Once MCP servers are connected, their tools are automatically available in your Cadre sessions. The tools are prefixed with `mcp_<servername>_` to avoid naming conflicts.

When you start Cadre with enabled MCP servers:

```bash
cadre
```

You'll see:
```
Connecting to MCP servers...
✓ Connected to 2 MCP server(s) with 15 external tool(s)
  ● github (8 tools available)
  ● brave-search (7 tools available)
```

The AI assistant can now use these external tools automatically during conversations.

## Server Configuration

### Configuration File

MCP server configurations are stored in `~/.cadre/mcp-servers.json`.

### Server Configuration Schema

```typescript
{
  name: string;           // Unique server identifier
  transport: 'stdio' | 'sse';  // Transport protocol
  enabled: boolean;       // Whether to auto-connect

  // For stdio transport:
  command?: string;       // Command to execute
  args?: string[];        // Command arguments
  env?: Record<string, string>;  // Environment variables

  // For SSE transport:
  url?: string;           // Server URL
}
```

## Common MCP Servers

### 1. Filesystem Server

Provides controlled access to the local filesystem.

```bash
cadre mcp add filesystem \
  --command npx \
  --args -y @modelcontextprotocol/server-filesystem /path/to/allowed/directory
```

**Tools**: read_file, write_file, list_directory, etc.

### 2. GitHub Server

Interact with GitHub repositories, issues, and PRs.

```bash
cadre mcp add github \
  --command npx \
  --args -y @modelcontextprotocol/server-github \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
```

**Tools**: create_issue, list_commits, create_pull_request, etc.

### 3. Brave Search Server

Web search capabilities powered by Brave Search API.

```bash
cadre mcp add brave-search \
  --command npx \
  --args -y @modelcontextprotocol/server-brave-search \
  --env BRAVE_API_KEY=your_api_key_here
```

**Tools**: web_search, local_search, news_search, etc.

### 4. PostgreSQL Server

Query and interact with PostgreSQL databases.

```bash
cadre mcp add postgres \
  --command npx \
  --args -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb
```

**Tools**: query, list_tables, describe_table, etc.

## Building Custom MCP Servers

You can build your own MCP servers using the official SDKs:

- **TypeScript**: `@modelcontextprotocol/sdk`
- **Python**: `mcp` package
- **Other languages**: Check the [MCP documentation](https://modelcontextprotocol.io)

Example custom server:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "my-custom-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "my_tool",
        description: "Does something useful",
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" }
          }
        }
      }
    ]
  };
});

server.setRequestHandler("tools/call", async (request) => {
  // Implement your tool logic
  return {
    content: [{ type: "text", text: "Result" }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Then use it with Cadre:

```bash
cadre mcp add my-custom-server --command node --args /path/to/server.js
```

## Troubleshooting

### Server Won't Connect

1. Check that the server command is correct and the server is installed
2. Verify environment variables are set correctly
3. Test the server connection: `cadre mcp test <server-name>`
4. Check server logs for errors

### Tools Not Appearing

1. Make sure the server is enabled: `cadre mcp list`
2. Verify the server connected successfully when starting Cadre
3. Try reconnecting by restarting Cadre

### Permission Errors

Some MCP servers require specific permissions or API keys. Check the server's documentation for required configuration.

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Official MCP Servers](https://github.com/modelcontextprotocol)
- [Building MCP Servers Guide](https://modelcontextprotocol.io/docs/develop/build-server)

## Advanced Usage

### Multiple Instances of Same Server

You can configure multiple instances of the same server with different configurations:

```bash
cadre mcp add github-personal \
  --command npx \
  --args -y @modelcontextprotocol/server-github \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=token1

cadre mcp add github-work \
  --command npx \
  --args -y @modelcontextprotocol/server-github \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=token2
```

### Environment Variables

You can pass multiple environment variables:

```bash
cadre mcp add my-server \
  --command npx \
  --args -y my-mcp-server \
  --env API_KEY=key123 API_URL=https://api.example.com
```

### SSE Servers

For servers using Server-Sent Events transport:

```bash
cadre mcp add remote-server \
  --transport sse \
  --url https://mcp-server.example.com
```

## Feedback and Issues

If you encounter any issues or have suggestions for MCP support in Cadre, please report them on the [GitHub repository](https://github.com/yoave717/cadre/issues).
