/**
 * fhevm-client.ts
 *
 * The ONLY file in this project that imports `@zama-fhe/relayer-sdk` or touches
 * the Zama relayer API directly. Everything else interacts with fhEVM through
 * the small typed surface exported here.
 *
 * All SDK call signatures below are verified against `@zama-fhe/relayer-sdk`
 * v0.4.4 (`lib/node.d.ts`). If you bump the SDK, re-check:
 *   - https://docs.zama.org/protocol/relayer-sdk-guides
 *   - https://github.com/zama-ai/relayer-sdk
 */

import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

/** Supported encrypted scalar types accepted as inputs. */
export type EncryptableType =
  | "ebool"
  | "euint8"
  | "euint16"
  | "euint32"
  | "euint64"
  | "euint128"
  | "euint256"
  | "eaddress";

export interface EncryptValue {
  type: EncryptableType;
  /** number | bigint-as-string | boolean | 0x-address depending on `type`. */
  value: string | number | boolean;
}

/** Result of building an encrypted input: handles + the ZK proof. */
export interface EncryptedInputResult {
  /** One ciphertext handle per supplied value, as 0x-prefixed hex. */
  handles: string[];
  /** Input proof bytes as 0x-prefixed hex. */
  inputProof: string;
}

export interface DecryptedValue {
  handle: string;
  value: string;
}

/**
 * Opaque handle for the relayer SDK instance. Typed as `unknown`-ish here so the
 * rest of the codebase never depends on the SDK's concrete shape.
 */
export interface FhevmInstance {
  readonly raw: RelayerSdkInstance;
}

/**
 * Minimal structural type for the relayer SDK instance. We model only the
 * methods we use so the rest of the file stays type-checked without depending on
 * the SDK's (possibly changing) exported types. Matches `FhevmInstance` in
 * `@zama-fhe/relayer-sdk` v0.2.0.
 */
interface RelayerSdkInstance {
  createEncryptedInput(
    contractAddress: string,
    userAddress: string,
  ): EncryptedInputBuilder;
  generateKeypair(): { publicKey: string; privateKey: string };
  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ): EIP712;
  userDecrypt(
    handleContractPairs: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number,
  ): Promise<Record<string, bigint | boolean | string>>;
  publicDecrypt(handles: string[]): Promise<{
    clearValues: Record<string, bigint | boolean | string>;
    abiEncodedClearValues: string;
    decryptionProof: string;
  }>;
}

interface EncryptedInputBuilder {
  addBool(value: boolean): EncryptedInputBuilder;
  add8(value: number | bigint): EncryptedInputBuilder;
  add16(value: number | bigint): EncryptedInputBuilder;
  add32(value: number | bigint): EncryptedInputBuilder;
  add64(value: number | bigint): EncryptedInputBuilder;
  add128(value: number | bigint): EncryptedInputBuilder;
  add256(value: number | bigint): EncryptedInputBuilder;
  addAddress(value: string): EncryptedInputBuilder;
  encrypt(): Promise<{ handles: Uint8Array[] | string[]; inputProof: Uint8Array | string }>;
}

interface EIP712 {
  domain: ethers.TypedDataDomain;
  types: Record<string, ethers.TypedDataField[]>;
  message: Record<string, unknown>;
}

function toHex(data: Uint8Array | string): string {
  if (typeof data === "string") {
    return data.startsWith("0x") ? data : `0x${data}`;
  }
  return ethers.hexlify(data);
}

function stringifyDecryptResult(
  raw: Record<string, bigint | boolean | string>,
  handles: string[],
): DecryptedValue[] {
  // The SDK keys results by handle hex; be tolerant of casing differences.
  const byLowerKey = new Map(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return handles.map((handle) => {
    const v = raw[handle] ?? byLowerKey.get(handle.toLowerCase());
    return { handle, value: v === undefined ? "" : String(v) };
  });
}

export class FhevmClient {
  private constructor(
    public readonly instance: FhevmInstance,
    public readonly provider: ethers.Provider,
    public readonly signer: ethers.Signer,
    public readonly chainId: number,
  ) {}

  /**
   * Create the relayer SDK instance plus an ethers provider/signer.
   */
  static async connect(opts: {
    rpcUrl: string;
    relayerUrl: string;
    chainId: number;
    signerPrivateKey: string;
  }): Promise<FhevmClient> {
    const provider = new ethers.JsonRpcProvider(opts.rpcUrl);
    const signer = new ethers.Wallet(opts.signerPrivateKey, provider);

    // `createInstance` requires the fhEVM coprocessor contract addresses (ACL,
    // KMS verifier, input verifier, gateway verifiers). SDK v0.4.4 only ships
    // the Sepolia preset, so we start from `SepoliaConfig` and override the
    // endpoints the caller controls.
    if (opts.chainId !== SepoliaConfig.chainId) {
      throw new Error(
        `Unsupported chainId ${opts.chainId}: @zama-fhe/relayer-sdk v0.4.4 only ` +
          `ships coprocessor contract addresses for Sepolia (${SepoliaConfig.chainId}).`,
      );
    }
    const raw = (await createInstance({
      ...SepoliaConfig,
      network: opts.rpcUrl,
      relayerUrl: opts.relayerUrl,
    } as Parameters<typeof createInstance>[0])) as unknown as RelayerSdkInstance;

    return new FhevmClient({ raw }, provider, signer, opts.chainId);
  }

  getSignerAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  /**
   * Build an encrypted input bundle (handles + proof) for a contract call.
   */
  async encryptInput(
    contractAddress: string,
    userAddress: string,
    values: EncryptValue[],
  ): Promise<EncryptedInputResult> {
    let builder = this.instance.raw.createEncryptedInput(
      contractAddress,
      userAddress,
    );

    for (const { type, value } of values) {
      builder = this.addTyped(builder, type, value);
    }

    const out = await builder.encrypt();
    const handles = (out.handles as (Uint8Array | string)[]).map(toHex);
    const inputProof = toHex(out.inputProof);
    return { handles, inputProof };
  }

  private addTyped(
    builder: EncryptedInputBuilder,
    type: EncryptableType,
    value: string | number | boolean,
  ): EncryptedInputBuilder {
    switch (type) {
      case "ebool":
        return builder.addBool(Boolean(value));
      case "euint8":
        return builder.add8(BigInt(value as number | string));
      case "euint16":
        return builder.add16(BigInt(value as number | string));
      case "euint32":
        return builder.add32(BigInt(value as number | string));
      case "euint64":
        return builder.add64(BigInt(value as number | string));
      case "euint128":
        return builder.add128(BigInt(value as number | string));
      case "euint256":
        return builder.add256(BigInt(value as number | string));
      case "eaddress":
        return builder.addAddress(String(value));
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unsupported encryptable type: ${String(_exhaustive)}`);
      }
    }
  }

  /** Send a write transaction to a contract function. */
  async callWrite(
    address: string,
    abi: unknown[],
    fn: string,
    args: unknown[],
  ): Promise<{
    hash: string;
    blockNumber: number | null;
    status: number | null;
    gasUsed: string | null;
  }> {
    const contract = new ethers.Contract(
      address,
      abi as ethers.InterfaceAbi,
      this.signer,
    );
    const method = contract.getFunction(fn);
    const tx: ethers.ContractTransactionResponse = await method(...args);
    const receipt = await tx.wait();
    return {
      hash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      status: receipt?.status ?? null,
      gasUsed: receipt?.gasUsed ? receipt.gasUsed.toString() : null,
    };
  }

  /** Call a view function and return its raw result. */
  async callRead(
    address: string,
    abi: unknown[],
    fn: string,
    args: unknown[],
  ): Promise<unknown> {
    const contract = new ethers.Contract(
      address,
      abi as ethers.InterfaceAbi,
      this.provider,
    );
    const method = contract.getFunction(fn);
    return method.staticCall(...args);
  }

  /**
   * Perform EIP-712 user-decryption for the connected signer.
   */
  async userDecrypt(
    handles: string[],
    contractAddress: string,
  ): Promise<DecryptedValue[]> {
    const userAddress = await this.getSignerAddress();

    const { publicKey, privateKey } = this.instance.raw.generateKeypair();

    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = 10;
    const contractAddresses = [contractAddress];

    const eip712 = this.instance.raw.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );

    // The SDK's EIP-712 `types` object includes an `EIP712Domain` entry that
    // ethers rejects in `signTypedData`; strip it and sign the remaining
    // primary type (`UserDecryptRequestVerification`).
    const { EIP712Domain: _ignored, ...signTypes } = eip712.types as Record<
      string,
      ethers.TypedDataField[]
    >;

    const signature = await this.signer.signTypedData(
      eip712.domain,
      signTypes,
      eip712.message,
    );

    const handleContractPairs = handles.map((handle) => ({
      handle,
      contractAddress,
    }));

    const raw = await this.instance.raw.userDecrypt(
      handleContractPairs,
      privateKey,
      publicKey,
      signature.replace(/^0x/, ""),
      contractAddresses,
      userAddress,
      startTimestamp,
      durationDays,
    );

    return stringifyDecryptResult(raw, handles);
  }

  /** Request public decryption for handles that are publicly decryptable. */
  async publicDecrypt(handles: string[]): Promise<DecryptedValue[]> {
    const raw = await this.instance.raw.publicDecrypt(handles);
    return stringifyDecryptResult(raw.clearValues, handles);
  }
}
