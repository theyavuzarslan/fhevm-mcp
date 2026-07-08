import { z } from "zod";
import type { EncryptableType, EncryptValue } from "../fhevm-client.js";
import { resolveContract, requireClient } from "../state.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

const encryptableType = z.enum([
  "ebool",
  "euint8",
  "euint16",
  "euint32",
  "euint64",
  "euint128",
  "euint256",
  "eaddress",
]);

export const encryptInputSchema = z.object({
  contractName: z.string().optional().describe("Registered contract name."),
  address: z
    .string()
    .optional()
    .describe("Contract address (used if contractName not given)."),
  function: z
    .string()
    .optional()
    .describe("Target function name (informational; binds the input to a call)."),
  values: z
    .array(
      z.object({
        type: encryptableType,
        value: z
          .union([z.string(), z.number(), z.boolean()])
          .describe("Plaintext value to encrypt; bigints as strings."),
      }),
    )
    .min(1)
    .describe("Ordered list of values to encrypt into input handles."),
});

export type EncryptInputInput = z.infer<typeof encryptInputSchema>;

async function handler(input: EncryptInputInput): Promise<ToolResult> {
  const client = requireClient();
  const contract = resolveContract({
    contractName: input.contractName,
    address: input.address,
  });
  const userAddress = await client.getSignerAddress();

  const values: EncryptValue[] = input.values.map((v) => ({
    type: v.type as EncryptableType,
    value: v.value,
  }));

  const result = await client.encryptInput(
    contract.address,
    userAddress,
    values,
  );

  return jsonResult({
    contract: contract.name,
    function: input.function ?? null,
    handles: result.handles,
    inputProof: result.inputProof,
    note: "Pass each handle (and the inputProof as the trailing arg) into `fhevm_call` args.",
  });
}

export const encryptInputTool: ToolDefinition<typeof encryptInputSchema> = {
  name: "fhevm_encrypt_input",
  description:
    "Encrypt one or more plaintext values into ciphertext input handles + a ZK proof, ready to pass to a confidential contract call.",
  schema: encryptInputSchema,
  handler,
};
