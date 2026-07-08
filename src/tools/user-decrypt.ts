import { z } from "zod";
import { resolveContract, requireClient } from "../state.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const userDecryptSchema = z.object({
  handles: z
    .union([z.string(), z.array(z.string())])
    .describe("One ciphertext handle (bytes32) or an array of them."),
  contractAddress: z
    .string()
    .optional()
    .describe("Contract that owns/authorized the handle(s)."),
  contractName: z
    .string()
    .optional()
    .describe("Registered contract name (alternative to contractAddress)."),
});

export type UserDecryptInput = z.infer<typeof userDecryptSchema>;

function asArray(h: string | string[]): string[] {
  return Array.isArray(h) ? h : [h];
}

async function handler(input: UserDecryptInput): Promise<ToolResult> {
  const client = requireClient();

  let contractAddress = input.contractAddress;
  if (!contractAddress) {
    if (!input.contractName) {
      throw new Error("Provide contractAddress or contractName.");
    }
    contractAddress = resolveContract({
      contractName: input.contractName,
    }).address;
  }

  const handles = asArray(input.handles);
  const decrypted = await client.userDecrypt(handles, contractAddress);

  return jsonResult({
    contractAddress,
    decrypted,
  });
}

export const userDecryptTool: ToolDefinition<typeof userDecryptSchema> = {
  name: "fhevm_user_decrypt",
  description:
    "User-decrypt ciphertext handle(s) for the connected signer via an EIP-712 signed request. Returns plaintext.",
  schema: userDecryptSchema,
  handler,
};
