import { z } from "zod";
import { isAddress } from "ethers";
import { getState } from "../state.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const loadAbiSchema = z.object({
  name: z.string().min(1).describe("Friendly name used to reference this contract later."),
  address: z
    .string()
    .refine(isAddress, "Not a valid EVM address.")
    .describe("Deployed contract address (0x...)."),
  abi: z
    .union([z.array(z.unknown()), z.string()])
    .describe("Contract ABI as a JSON array, or a JSON string of one."),
});

export type LoadAbiInput = z.infer<typeof loadAbiSchema>;

function parseAbi(abi: unknown[] | string): unknown[] {
  if (typeof abi === "string") {
    const parsed = JSON.parse(abi);
    if (!Array.isArray(parsed)) {
      throw new Error("ABI string did not parse to a JSON array.");
    }
    return parsed as unknown[];
  }
  return abi;
}

async function handler(input: LoadAbiInput): Promise<ToolResult> {
  const abi = parseAbi(input.abi);
  const state = getState();
  state.contracts.set(input.name, {
    name: input.name,
    address: input.address,
    abi,
  });

  return jsonResult({
    registered: input.name,
    address: input.address,
    abiEntries: abi.length,
  });
}

export const loadAbiTool: ToolDefinition<typeof loadAbiSchema> = {
  name: "fhevm_load_abi",
  description:
    "Register a contract (name + address + ABI) so later tools can reference it generically by name.",
  schema: loadAbiSchema,
  handler,
};
