import { z } from "zod";
import { resolveContract, requireClient } from "../state.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const readSchema = z.object({
  contractName: z.string().optional().describe("Registered contract name."),
  address: z.string().optional().describe("Contract address (if no name)."),
  function: z.string().min(1).describe("View/pure function to call."),
  args: z.array(z.unknown()).default([]).describe("Positional args."),
});

export type ReadInput = z.infer<typeof readSchema>;

/** Normalize ethers return values (which may be bigints / Result tuples). */
function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  return value;
}

async function handler(input: ReadInput): Promise<ToolResult> {
  const client = requireClient();
  const contract = resolveContract({
    contractName: input.contractName,
    address: input.address,
  });

  const raw = await client.callRead(
    contract.address,
    contract.abi,
    input.function,
    input.args,
  );

  return jsonResult({
    contract: contract.name,
    function: input.function,
    result: normalize(raw),
    note: "Ciphertext handles are returned as bytes32 hex. Pass them to fhevm_user_decrypt or fhevm_public_decrypt.",
  });
}

export const readTool: ToolDefinition<typeof readSchema> = {
  name: "fhevm_read",
  description:
    "Call a view function and return its result, including ciphertext handles (bytes32) that can later be decrypted.",
  schema: readSchema,
  handler,
};
