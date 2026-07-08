import { z } from "zod";
import { ethers } from "ethers";
import { getState } from "../state.js";
import { jsonResult, type ToolDefinition, type ToolResult } from "./types.js";

export const statusSchema = z.object({});

export type StatusInput = z.infer<typeof statusSchema>;

async function handler(_input: StatusInput): Promise<ToolResult> {
  const state = getState();

  if (!state.client) {
    return jsonResult({
      connected: false,
      note: "Call `fhevm_connect` to set up the relayer instance, provider and signer.",
      contracts: [...state.contracts.values()].map((c) => ({
        name: c.name,
        address: c.address,
      })),
    });
  }

  const signerAddress = await state.client.getSignerAddress();
  const balanceWei = await state.client.provider.getBalance(signerAddress);

  return jsonResult({
    connected: true,
    chainId: state.chainId,
    rpcUrl: state.rpcUrl,
    relayerUrl: state.relayerUrl,
    signerAddress,
    signerBalanceEth: ethers.formatEther(balanceWei),
    contracts: [...state.contracts.values()].map((c) => ({
      name: c.name,
      address: c.address,
    })),
  });
}

export const statusTool: ToolDefinition<typeof statusSchema> = {
  name: "fhevm_status",
  description:
    "Report the current session state: connection details, signer address and ETH balance, and the contracts registered via fhevm_load_abi. Safe to call anytime.",
  schema: statusSchema,
  handler,
};
