import { z } from "zod";
import { requireConnected } from "../state.js";
import { getClient } from "./connect.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const publicDecryptSchema = z.object({
  handles: z
    .union([z.string(), z.array(z.string())])
    .describe("One ciphertext handle (bytes32) or an array of them."),
});

export type PublicDecryptInput = z.infer<typeof publicDecryptSchema>;

function asArray(h: string | string[]): string[] {
  return Array.isArray(h) ? h : [h];
}

async function handler(input: PublicDecryptInput): Promise<ToolResult> {
  requireConnected();
  const client = getClient();
  const handles = asArray(input.handles);
  const decrypted = await client.publicDecrypt(handles);
  return jsonResult({ decrypted });
}

export const publicDecryptTool: ToolDefinition<typeof publicDecryptSchema> = {
  name: "fhevm_public_decrypt",
  description:
    "Request public decryption for handle(s) that have been marked publicly decryptable on-chain. Returns plaintext.",
  schema: publicDecryptSchema,
  handler,
};
