import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getState, resolveContract, requireClient, setConnected } from "../state.js";
import type { FhevmClient } from "../fhevm-client.js";
import { jsonResult, toInputSchema } from "../tools/types.js";
import { allTools } from "../tools/index.js";
import { loadAbiTool, loadAbiSchema } from "../tools/load-abi.js";
import { encryptInputSchema } from "../tools/encrypt-input.js";
import { connectSchema } from "../tools/connect.js";
import { statusTool } from "../tools/status.js";

function resetState(): void {
  const state = getState();
  state.client = null;
  state.chainId = null;
  state.relayerUrl = null;
  state.rpcUrl = null;
  state.contracts.clear();
}

const fakeClient = {} as unknown as FhevmClient;

describe("jsonResult serialization", () => {
  it("renders bigints as decimal strings", () => {
    const result = jsonResult({ total: 42n, nested: { x: 7n } });
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.total, "42");
    assert.equal(parsed.nested.x, "7");
  });

  it("wraps payloads as a single text content block", () => {
    const result = jsonResult({ ok: true });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0]!.type, "text");
    assert.equal(result.isError, undefined);
  });
});

describe("tool registry", () => {
  it("exposes all eight tools with unique fhevm_-prefixed names", () => {
    const names = allTools.map((t) => t.name);
    assert.equal(names.length, 8);
    assert.equal(new Set(names).size, 8, "tool names must be unique");
    for (const name of names) {
      assert.ok(name.startsWith("fhevm_"), `${name} should be fhevm_-prefixed`);
    }
  });

  it("gives every tool a non-empty description and schema", () => {
    for (const tool of allTools) {
      assert.ok(tool.description.length > 0, `${tool.name} needs a description`);
      assert.ok(tool.schema, `${tool.name} needs a schema`);
      assert.equal(typeof tool.handler, "function");
    }
  });
});

describe("requireClient / setConnected", () => {
  beforeEach(resetState);

  it("throws when no connection has been established", () => {
    assert.throws(() => requireClient(), /Not connected/);
  });

  it("returns the connected client after setConnected", () => {
    setConnected(fakeClient, { chainId: 11155111, relayerUrl: "r", rpcUrl: "u" });
    assert.equal(requireClient(), fakeClient);
  });

  it("keeps the contract registry when reconnecting to the same chain", () => {
    setConnected(fakeClient, { chainId: 11155111, relayerUrl: "r", rpcUrl: "u" });
    getState().contracts.set("Token", { name: "Token", address: "0x1", abi: [] });
    const { contractsCleared } = setConnected(fakeClient, {
      chainId: 11155111,
      relayerUrl: "r2",
      rpcUrl: "u2",
    });
    assert.equal(contractsCleared, false);
    assert.equal(getState().contracts.size, 1);
  });

  it("clears the contract registry when the chain changes", () => {
    setConnected(fakeClient, { chainId: 11155111, relayerUrl: "r", rpcUrl: "u" });
    getState().contracts.set("Token", { name: "Token", address: "0x1", abi: [] });
    const { contractsCleared } = setConnected(fakeClient, {
      chainId: 1,
      relayerUrl: "r",
      rpcUrl: "u",
    });
    assert.equal(contractsCleared, true);
    assert.equal(getState().contracts.size, 0);
  });
});

describe("toInputSchema", () => {
  it("emits real property names, types and descriptions for every tool", () => {
    for (const tool of allTools) {
      const schema = toInputSchema(tool.schema) as {
        type: string;
        properties?: Record<string, unknown>;
      };
      assert.equal(schema.type, "object", `${tool.name} schema must be an object`);
      assert.ok(schema.properties, `${tool.name} must expose properties`);
    }
  });

  it("exposes load_abi's name/address/abi arguments", () => {
    const schema = toInputSchema(loadAbiSchema) as unknown as {
      properties: Record<string, { description?: string }>;
      required?: string[];
    };
    assert.ok(schema.properties.name);
    assert.ok(schema.properties.address);
    assert.ok(schema.properties.abi);
    assert.deepEqual(schema.required?.sort(), ["abi", "address", "name"]);
    assert.ok(schema.properties.name.description?.length);
  });
});

describe("resolveContract", () => {
  beforeEach(resetState);

  it("resolves a registered contract by name", () => {
    getState().contracts.set("Token", {
      name: "Token",
      address: "0xabc",
      abi: [],
    });
    const c = resolveContract({ contractName: "Token" });
    assert.equal(c.address, "0xabc");
  });

  it("throws for an unknown contract name", () => {
    assert.throws(
      () => resolveContract({ contractName: "Missing" }),
      /No contract registered/,
    );
  });

  it("matches a registered contract by address case-insensitively", () => {
    getState().contracts.set("Token", {
      name: "Token",
      address: "0xAbCdEf",
      abi: [],
    });
    const c = resolveContract({ address: "0xabcdef" });
    assert.equal(c.name, "Token");
  });

  it("returns an inline record when an address + abi are given", () => {
    const c = resolveContract({ address: "0x123", abi: [{ type: "function" }] });
    assert.equal(c.name, "0x123");
    assert.equal(c.abi.length, 1);
  });

  it("throws for an unregistered address with no abi", () => {
    assert.throws(
      () => resolveContract({ address: "0xnope" }),
      /not registered and no ABI/,
    );
  });

  it("throws when neither name nor address is provided", () => {
    assert.throws(() => resolveContract({}), /must provide either/);
  });
});

describe("fhevm_load_abi handler", () => {
  beforeEach(resetState);

  it("registers a contract from an array ABI", async () => {
    await loadAbiTool.handler({
      name: "C",
      address: "0x1",
      abi: [{ type: "function", name: "foo" }],
    });
    const stored = getState().contracts.get("C");
    assert.equal(stored?.address, "0x1");
    assert.equal(stored?.abi.length, 1);
  });

  it("parses a JSON-string ABI", async () => {
    const result = await loadAbiTool.handler({
      name: "D",
      address: "0x2",
      abi: JSON.stringify([{ type: "event" }, { type: "function" }]),
    });
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.abiEntries, 2);
  });

  it("rejects a JSON-string ABI that is not an array", async () => {
    await assert.rejects(
      loadAbiTool.handler({ name: "E", address: "0x3", abi: '{"not":"array"}' }),
      /did not parse to a JSON array/,
    );
  });
});

describe("zod input schemas", () => {
  it("load_abi requires name and a valid EVM address", () => {
    assert.ok(!loadAbiSchema.safeParse({ abi: [] }).success);
    assert.ok(
      !loadAbiSchema.safeParse({ name: "x", address: "0x1", abi: [] }).success,
      "short/invalid addresses must be rejected",
    );
    assert.ok(
      loadAbiSchema.safeParse({
        name: "x",
        address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
        abi: [],
      }).success,
    );
  });

  it("encrypt_input rejects an empty values array", () => {
    assert.ok(!encryptInputSchema.safeParse({ values: [] }).success);
  });

  it("encrypt_input rejects an unknown encrypted type", () => {
    const bad = encryptInputSchema.safeParse({
      values: [{ type: "euint999", value: 1 }],
    });
    assert.ok(!bad.success);
  });

  it("encrypt_input accepts a valid euint64 value", () => {
    const ok = encryptInputSchema.safeParse({
      values: [{ type: "euint64", value: "1000" }],
    });
    assert.ok(ok.success);
  });

  it("connect rejects a malformed private key and defaults chainId to Sepolia", () => {
    assert.ok(!connectSchema.safeParse({ signerPrivateKey: "0xbeef" }).success);
    const parsed = connectSchema.parse({});
    assert.equal(parsed.chainId, 11155111);
  });
});

describe("fhevm_status handler", () => {
  beforeEach(resetState);

  it("reports disconnected state without throwing", async () => {
    getState().contracts.set("Token", {
      name: "Token",
      address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      abi: [],
    });
    const result = await statusTool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.connected, false);
    assert.equal(parsed.contracts.length, 1);
  });
});
