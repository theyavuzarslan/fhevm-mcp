import type { FhevmClient } from "./fhevm-client.js";

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
 * The connected `FhevmClient` is the single source of truth for the relayer
 * instance, provider and signer.
 */
export interface FhevmState {
  client: FhevmClient | null;
  chainId: number | null;
  relayerUrl: string | null;
  rpcUrl: string | null;
  contracts: Map<string, RegisteredContract>;
}

const state: FhevmState = {
  client: null,
  chainId: null,
  relayerUrl: null,
  rpcUrl: null,
  contracts: new Map(),
};

export function getState(): FhevmState {
  return state;
}

/**
 * Record a successful connection. If the chain changed since the previous
 * connection, the contract registry is cleared — registered addresses/ABIs
 * from another network would be silently wrong.
 */
export function setConnected(
  client: FhevmClient,
  opts: { chainId: number; relayerUrl: string; rpcUrl: string },
): { contractsCleared: boolean } {
  const chainChanged = state.chainId !== null && state.chainId !== opts.chainId;
  if (chainChanged) {
    state.contracts.clear();
  }
  state.client = client;
  state.chainId = opts.chainId;
  state.relayerUrl = opts.relayerUrl;
  state.rpcUrl = opts.rpcUrl;
  return { contractsCleared: chainChanged };
}

/** Return the connected client or throw a uniform "connect first" error. */
export function requireClient(): FhevmClient {
  if (!state.client) {
    throw new Error(
      "Not connected. Call `fhevm_connect` first to set up the relayer instance, provider and signer.",
    );
  }
  return state.client;
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
