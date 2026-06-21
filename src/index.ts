#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { allTools } from "./tools/index.js";
import type { ToolResult } from "./tools/types.js";

// Lazily convert each tool's zod schema to a JSON schema for the tools list.
// We use a minimal hand-rolled conversion to avoid extra deps; for richer
// schemas the agent can rely on the description text.
function jsonSchemaFor(): Tool["inputSchema"] {
  // We expose a permissive object schema; precise validation still happens via
  // zod in each handler. The rich per-arg docs live in the tool description.
  return {
    type: "object",
    additionalProperties: true,
  };
}

async function main(): Promise<void> {
  const server = new Server(
    {
      name: "fhevm-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: jsonSchemaFor(),
    }));
    return { tools };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      const tool = allTools.find((t) => t.name === name);
      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const parsed = tool.schema.parse(args ?? {});
        const result: ToolResult = await tool.handler(parsed);
        return result as CallToolResult;
      } catch (err) {
        const message =
          err instanceof z.ZodError
            ? `Invalid input: ${JSON.stringify(err.issues)}`
            : err instanceof Error
              ? err.message
              : String(err);
        return {
          content: [{ type: "text", text: `Error in ${name}: ${message}` }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is reserved for the JSON-RPC stream.
  process.stderr.write("fhevm-mcp server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
