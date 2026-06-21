import { z } from "zod";
import { FhevmClient } from "../fhevm-client.js";
import { getState } from "../state.js";
import type { ToolDefinition, ToolResult } from "./types.js";

export const connectSchema = z.object({
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe("JSON-RPC endpoint. Falls back to FHEVM_RPC_URL env."),
  relayerUrl: z
    .string()
    .url()
    .optional()
    .describe("Zama relayer endpoint. Falls back to FHEVM_RELAYER_URL env."),
  chainId: z.number().int().positive().describe("EVM chain id of the network."),
  signerPrivateKey: z
    .string()
    .optional()
    .describe(
      "0x-prefixed private key. Falls back to SIGNER_PRIVATE_KEY env. Never logged.",
    ),
});

export type ConnectInput = z.infer<typeof connectSchema>;

async function handler(input: ConnectInput): Promise<ToolResult> {
  const rpcUrl = input.rpcUrl ?? process.env.FHEVM_RPC_URL;
  const relayerUrl = input.relayerUrl ?? process.env.FHEVM_RELAYER_URL;
  const signerPrivateKey =
    input.signerPrivateKey ?? process.env.SIGNER_PRIVATE_KEY;

  if (!rpcUrl) {
    throw new Error("rpcUrl missing and FHEVM_RPC_URL env not set.");
  }
  if (!relayerUrl) {
    throw new Error("relayerUrl missing and FHEVM_RELAYER_URL env not set.");
  }
  if (!signerPrivateKey) {
    throw new Error(
      "signerPrivateKey missing and SIGNER_PRIVATE_KEY env not set.",
    );
  }

  const client = await FhevmClient.connect({
    rpcUrl,
    relayerUrl,
    chainId: input.chainId,
    signerPrivateKey,
  });

  const state = getState();
  state.instance = client.instance;
  state.provider = client.provider;
  state.signer = client.signer;
  state.chainId = input.chainId;
  state.relayerUrl = relayerUrl;
  state.rpcUrl = rpcUrl;
  // Keep the rich client around for handlers that need its methods.
  clients.set("active", client);

  const signerAddress = await client.getSignerAddress();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            connected: true,
            chainId: input.chainId,
            rpcUrl,
            relayerUrl,
            signerAddress,
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * The full `FhevmClient` (with methods) is kept here separately from the plain
 * `state` (which holds serializable handles). Other tools fetch it via
 * `getClient()`.
 */
const clients = new Map<string, FhevmClient>();

export function getClient(): FhevmClient {
  const c = clients.get("active");
  if (!c) {
    throw new Error("Not connected. Call `fhevm_connect` first.");
  }
  return c;
}

export const connectTool: ToolDefinition<typeof connectSchema> = {
  name: "fhevm_connect",
  description:
    "Connect to an fhEVM network: create the Zama relayer SDK instance plus an ethers provider/signer. Must be called before any other tool.",
  schema: connectSchema,
  handler,
};
