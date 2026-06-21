import { z } from "zod";
import { resolveContract, requireConnected } from "../state.js";
import { getClient } from "./connect.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const callSchema = z.object({
  contractName: z.string().optional().describe("Registered contract name."),
  address: z.string().optional().describe("Contract address (if no name)."),
  function: z.string().min(1).describe("Function name to call."),
  args: z
    .array(z.unknown())
    .default([])
    .describe(
      "Positional args, mixing plaintext and encrypted handles. Append inputProof from fhevm_encrypt_input where the function requires it.",
    ),
});

export type CallInput = z.infer<typeof callSchema>;

async function handler(input: CallInput): Promise<ToolResult> {
  requireConnected();
  const client = getClient();
  const contract = resolveContract({
    contractName: input.contractName,
    address: input.address,
  });

  const receipt = await client.callWrite(
    contract.address,
    contract.abi,
    input.function,
    input.args,
  );

  return jsonResult({
    contract: contract.name,
    function: input.function,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed,
  });
}

export const callTool: ToolDefinition<typeof callSchema> = {
  name: "fhevm_call",
  description:
    "Send a write transaction to a confidential contract function with mixed plaintext + encrypted-handle args. Returns the tx hash and receipt summary.",
  schema: callSchema,
  handler,
};
