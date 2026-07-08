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
git clone <this-repo> fhevm-mcp
cd fhevm-mcp
npm install
npm run build
```

## MCP client config (`mcp.json`)

```json
{
  "mcpServers": {
    "fhevm": {
      "command": "node",
      "args": ["/absolute/path/to/fhevm-mcp/dist/index.js"],
      "env": {
        "SIGNER_PRIVATE_KEY": "0xYOUR_TESTNET_KEY",
        "FHEVM_RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com",
        "FHEVM_RELAYER_URL": "https://relayer.testnet.zama.org"
      }
    }
  }
}
```

`FHEVM_RPC_URL` and `FHEVM_RELAYER_URL` are optional — they default to the
public Sepolia endpoints above. Copy `.env.example` to `.env` for local runs.

## Tools

| Tool | Purpose |
| --- | --- |
| `fhevm_connect` | Create relayer SDK instance + ethers provider/signer. |
| `fhevm_status` | Report connection, signer address/balance, registered contracts. |
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
    status.ts         fhevm_status
    load-abi.ts       fhevm_load_abi
    encrypt-input.ts  fhevm_encrypt_input
    call.ts           fhevm_call
    read.ts           fhevm_read
    user-decrypt.ts   fhevm_user_decrypt
    public-decrypt.ts fhevm_public_decrypt
```

## Verifying the relayer SDK surface

The exact `@zama-fhe/relayer-sdk` API moves between releases. Every SDK call is
isolated in `src/fhevm-client.ts`; the current code is verified against
v0.4.4. If you bump the SDK, re-check against:

- https://docs.zama.org/protocol/relayer-sdk-guides
- https://github.com/zama-ai/relayer-sdk

## Security

- ⚠️ **Use a dedicated testnet-only key.** The agent driving this server can
  send arbitrary transactions from the configured signer; never point it at a
  key holding mainnet funds. Any `.env`/`mcp.json` holding the key must be
  gitignored and readable only by you (`chmod 600`).
- **Encrypted keystore option** — instead of a plaintext key, set
  `SIGNER_KEYSTORE_PATH` (an ethers/geth encrypted JSON keystore) plus
  `SIGNER_KEYSTORE_PASSWORD`. Create one with:

  ```bash
  node -e "const {Wallet}=require('ethers');new Wallet(process.env.PK).encrypt(process.env.PW).then(j=>console.log(j))" > keystore.json
  ```

- Prefer env configuration over passing the key as a tool argument, so the key
  never enters the agent conversation.
- The private key is validated on connect and **never** logged or echoed.
- stdout carries only the JSON-RPC stream; diagnostics go to stderr.
- Reconnecting to a different chain clears the contract registry, so stale
  ABIs/addresses from another network can't be used by mistake.

## License

MIT
