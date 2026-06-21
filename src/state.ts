import type { ethers } from "ethers";
import type { FhevmInstance } from "./fhevm-client.js";

/**
 * A contract registered via `fhevm_load_abi`. Stored so later tool calls can be
 * generic — referencing a contract by name instead of repeating address + ABI.
 */
export interface RegisteredContract {
  name: string;
  address: string;
  abi: unknown[];
}

/**
 * Process-wide mutable state for the MCP server. The server is single-tenant
 * and runs over local stdio, so a module-level singleton is appropriate.
 */
export interface FhevmState {
  instance: FhevmInstance | null;
  provider: ethers.Provider | null;
  signer: ethers.Signer | null;
  chainId: number | null;
  relayerUrl: string | null;
  rpcUrl: string | null;
  contracts: Map<string, RegisteredContract>;
}

const state: FhevmState = {
  instance: null,
  provider: null,
  signer: null,
  chainId: null,
  relayerUrl: null,
  rpcUrl: null,
  contracts: new Map(),
};

export function getState(): FhevmState {
  return state;
}

export function requireConnected(): Required<
  Pick<FhevmState, "instance" | "provider" | "signer" | "chainId">
> & { relayerUrl: string; rpcUrl: string } {
  if (
    !state.instance ||
    !state.provider ||
    !state.signer ||
    state.chainId === null ||
    !state.relayerUrl ||
    !state.rpcUrl
  ) {
    throw new Error(
      "Not connected. Call `fhevm_connect` first to set up the relayer instance, provider and signer.",
    );
  }
  return {
    instance: state.instance,
    provider: state.provider,
    signer: state.signer,
    chainId: state.chainId,
    relayerUrl: state.relayerUrl,
    rpcUrl: state.rpcUrl,
  };
}

/**
 * Resolve a contract either by registered name or by raw address. If `address`
 * is given and unregistered, an inline (unnamed) record is returned when an ABI
 * is supplied; otherwise the registered contract is required.
 */
export function resolveContract(opts: {
  contractName?: string;
  address?: string;
  abi?: unknown[];
}): RegisteredContract {
  const { contractName, address, abi } = opts;

  if (contractName) {
    const found = state.contracts.get(contractName);
    if (!found) {
      throw new Error(
        `No contract registered under name "${contractName}". Call \`fhevm_load_abi\` first.`,
      );
    }
    return found;
  }

  if (address) {
    // Try to match a registered contract by address.
    for (const c of state.contracts.values()) {
      if (c.address.toLowerCase() === address.toLowerCase()) {
        return c;
      }
    }
    if (abi) {
      return { name: address, address, abi };
    }
    throw new Error(
      `Address "${address}" is not registered and no ABI was provided. Register it with \`fhevm_load_abi\` or pass an inline abi.`,
    );
  }

  throw new Error("You must provide either `contractName` or `address`.");
}
