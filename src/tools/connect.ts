import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ethers } from "ethers";
import { FhevmClient } from "../fhevm-client.js";
import { setConnected } from "../state.js";
import type { ToolDefinition, ToolResult } from "./types.js";

/** Public Sepolia defaults (mirrors the relayer SDK's SepoliaConfig endpoints). */
const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const DEFAULT_SEPOLIA_RELAYER = "https://relayer.testnet.zama.org";
const SEPOLIA_CHAIN_ID = 11155111;

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export const connectSchema = z.object({
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "JSON-RPC endpoint. Falls back to FHEVM_RPC_URL env, then a public Sepolia RPC.",
    ),
  relayerUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Zama relayer endpoint. Falls back to FHEVM_RELAYER_URL env, then the Zama testnet relayer.",
    ),
  chainId: z
    .number()
    .int()
    .positive()
    .default(SEPOLIA_CHAIN_ID)
    .describe("EVM chain id of the network. Defaults to Sepolia (11155111)."),
  signerPrivateKey: z
    .string()
    .regex(PRIVATE_KEY_RE, "Expected a 0x-prefixed 32-byte hex private key.")
    .optional()
    .describe(
      "0x-prefixed private key. Prefer setting SIGNER_PRIVATE_KEY env (or an encrypted keystore via SIGNER_KEYSTORE_PATH + SIGNER_KEYSTORE_PASSWORD) so the key never enters the conversation. Never logged.",
    ),
});

export type ConnectInput = z.infer<typeof connectSchema>;

/**
 * Resolve the signer key: explicit arg > SIGNER_PRIVATE_KEY env > encrypted
 * JSON keystore (SIGNER_KEYSTORE_PATH + SIGNER_KEYSTORE_PASSWORD envs).
 */
async function resolveSignerKey(input: ConnectInput): Promise<string> {
  const direct = input.signerPrivateKey ?? process.env.SIGNER_PRIVATE_KEY;
  if (direct) {
    if (!PRIVATE_KEY_RE.test(direct)) {
      throw new Error(
        "SIGNER_PRIVATE_KEY is not a 0x-prefixed 32-byte hex private key.",
      );
    }
    return direct;
  }

  const keystorePath = process.env.SIGNER_KEYSTORE_PATH;
  if (keystorePath) {
    const password = process.env.SIGNER_KEYSTORE_PASSWORD;
    if (!password) {
      throw new Error(
        "SIGNER_KEYSTORE_PATH is set but SIGNER_KEYSTORE_PASSWORD is missing.",
      );
    }
    const json = await readFile(keystorePath, "utf8");
    const wallet = await ethers.Wallet.fromEncryptedJson(json, password);
    return wallet.privateKey;
  }

  throw new Error(
    "No signer configured: pass signerPrivateKey, or set SIGNER_PRIVATE_KEY, or SIGNER_KEYSTORE_PATH + SIGNER_KEYSTORE_PASSWORD.",
  );
}

async function handler(input: ConnectInput): Promise<ToolResult> {
  const rpcUrl =
    input.rpcUrl ?? process.env.FHEVM_RPC_URL ?? DEFAULT_SEPOLIA_RPC;
  const relayerUrl =
    input.relayerUrl ?? process.env.FHEVM_RELAYER_URL ?? DEFAULT_SEPOLIA_RELAYER;
  const signerPrivateKey = await resolveSignerKey(input);

  const client = await FhevmClient.connect({
    rpcUrl,
    relayerUrl,
    chainId: input.chainId,
    signerPrivateKey,
  });

  const { contractsCleared } = setConnected(client, {
    chainId: input.chainId,
    relayerUrl,
    rpcUrl,
  });

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
            ...(contractsCleared
              ? { note: "Chain changed: contract registry was cleared. Re-register with fhevm_load_abi." }
              : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}

export const connectTool: ToolDefinition<typeof connectSchema> = {
  name: "fhevm_connect",
  description:
    "Connect to an fhEVM network: create the Zama relayer SDK instance plus an ethers provider/signer. Must be called before any other tool.",
  schema: connectSchema,
  handler,
};
