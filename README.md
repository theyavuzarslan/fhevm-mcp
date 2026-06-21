# fhevm-mcp

An MCP (Model Context Protocol) server that lets an AI agent **operate** Zama
[fhEVM](https://docs.zama.org/protocol) confidential smart contracts at runtime:
encrypt inputs, call confidential functions, read ciphertext handles, and
user-decrypt via EIP-712.

## Thesis: operate vs. write

`fhevm-mcp` is **complementary** to `fhevm-skill`:

| | `fhevm-skill` | `fhevm-mcp` (this) |
| --- | --- | --- |
| Job | Teaches an agent to **write** confidential Solidity | Lets an agent **operate** deployed contracts |
| When | Authoring / design time | Runtime |
| Surface | Knowledge, patterns | Live encryption, txs, decryption |

One teaches the model how to build FHE contracts; the other gives the model
hands to drive them once deployed.

## Install / run

Runs locally over stdio. No hosting required.

```bash
npx -y fhevm-mcp
```

## MCP client config (`mcp.json`)

```json
{
  "mcpServers": {
    "fhevm": {
      "command": "npx",
      "args": ["-y", "fhevm-mcp"],
      "env": {
        "SIGNER_PRIVATE_KEY": "0xYOUR_KEY",
        "FHEVM_RPC_URL": "https://eth-sepolia.public.blastapi.io",
        "FHEVM_RELAYER_URL": "https://relayer.testnet.zama.cloud"
      }
    }
  }
}
```

Copy `.env.example` to `.env` for local runs.

## Tools

| Tool | Purpose |
| --- | --- |
| `fhevm_connect` | Create relayer SDK instance + ethers provider/signer. |
| `fhevm_load_abi` | Register a contract (name + address + ABI). |
| `fhevm_encrypt_input` | Build encrypted input handles + ZK proof. |
| `fhevm_call` | Send a write tx (plaintext + encrypted-handle args). |
| `fhevm_read` | Call a view function; returns ciphertext handles. |
| `fhevm_user_decrypt` | EIP-712 user-decryption for the connected signer. |
| `fhevm_public_decrypt` | Public decryption where allowed. |

## Usage walkthrough

A typical agent flow against a confidential ERC-20:

1. **Connect**

   ```jsonc
   // fhevm_connect
   { "rpcUrl": "...", "relayerUrl": "...", "chainId": 11155111 }
   ```

2. **Register the contract**

   ```jsonc
   // fhevm_load_abi
   { "name": "cUSDC", "address": "0xabc...", "abi": [/* ... */] }
   ```

3. **Encrypt an amount**

   ```jsonc
   // fhevm_encrypt_input
   { "contractName": "cUSDC", "function": "transfer",
     "values": [{ "type": "euint64", "value": "1000" }] }
   // -> { handles: ["0x..."], inputProof: "0x..." }
   ```

4. **Call the confidential function** (handle + proof as args)

   ```jsonc
   // fhevm_call
   { "contractName": "cUSDC", "function": "transfer",
     "args": ["0xRecipient", "0xHANDLE", "0xINPUTPROOF"] }
   ```

5. **Read an encrypted balance handle**

   ```jsonc
   // fhevm_read
   { "contractName": "cUSDC", "function": "balanceOf", "args": ["0xMe"] }
   // -> { result: "0xHANDLE" }
   ```

6. **Decrypt it for yourself**

   ```jsonc
   // fhevm_user_decrypt
   { "handles": "0xHANDLE", "contractName": "cUSDC" }
   // -> { decrypted: [{ handle: "0x...", value: "4200" }] }
   ```

## Architecture

```
src/
  index.ts            MCP server bootstrap (stdio), tool dispatch
  fhevm-client.ts     ALL relayer-sdk + ethers usage (only file importing the SDK)
  state.ts            active instance + registered contracts
  tools/
    types.ts          ToolDefinition + result helpers
    connect.ts        fhevm_connect
    load-abi.ts       fhevm_load_abi
    encrypt-input.ts  fhevm_encrypt_input
    call.ts           fhevm_call
    read.ts           fhevm_read
    user-decrypt.ts   fhevm_user_decrypt
    public-decrypt.ts fhevm_public_decrypt
```

## Verifying the relayer SDK surface

The exact `@zama-fhe/relayer-sdk` API moves between releases. Every SDK call is
isolated in `src/fhevm-client.ts` and tagged with `// TODO(verify-api):` plus a
doc link. Check those against:

- https://docs.zama.org/protocol/relayer-sdk-guides
- https://github.com/zama-ai/relayer-sdk

## Security

- The signer private key is read from env/args and **never** logged.
- stdout carries only the JSON-RPC stream; diagnostics go to stderr.
- Run against testnets first.

## License

MIT
