import type { z } from "zod";

/** MCP text content block. */
export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

/**
 * A single MCP tool: a name, a description, a zod input schema, and a handler.
 *
 * `TSchema` is the concrete zod schema type; the handler receives the schema's
 * *output* type (post-defaults), while the schema validates the raw *input*.
 */
export interface ToolDefinition<TSchema extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (input: z.output<TSchema>) => Promise<ToolResult>;
}

/**
 * Erased form of a tool definition, used for heterogeneous collections. The
 * handler accepts `unknown` since the precise input type is recovered at
 * registration time by each tool's own zod schema.
 */
export interface AnyToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<ToolResult>;
}

/** Erase a strongly-typed tool definition into the heterogeneous form. */
export function defineTool<TSchema extends z.ZodTypeAny>(
  def: ToolDefinition<TSchema>,
): AnyToolDefinition {
  return def as unknown as AnyToolDefinition;
}

/** Helper to wrap an arbitrary JSON-serializable payload as a tool result. */
export function jsonResult(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, bigintReplacer, 2),
      },
    ],
  };
}

/** JSON.stringify replacer that renders bigints as decimal strings. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
