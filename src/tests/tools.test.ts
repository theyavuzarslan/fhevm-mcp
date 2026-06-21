import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getState, resolveContract, requireConnected } from "../state.js";
import { jsonResult } from "../tools/types.js";
import { allTools } from "../tools/index.js";
import { loadAbiTool, loadAbiSchema } from "../tools/load-abi.js";
import { encryptInputSchema } from "../tools/encrypt-input.js";

function resetState(): void {
  const state = getState();
  state.instance = null;
  state.provider = null;
  state.signer = null;
  state.chainId = null;
  state.relayerUrl = null;
  state.rpcUrl = null;
  state.contracts.clear();
}

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
  it("exposes all seven tools with unique fhevm_-prefixed names", () => {
    const names = allTools.map((t) => t.name);
    assert.equal(names.length, 7);
    assert.equal(new Set(names).size, 7, "tool names must be unique");
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

describe("requireConnected", () => {
  beforeEach(resetState);

  it("throws when no connection has been established", () => {
    assert.throws(() => requireConnected(), /Not connected/);
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
  it("load_abi requires name and address", () => {
    assert.ok(!loadAbiSchema.safeParse({ abi: [] }).success);
    assert.ok(
      loadAbiSchema.safeParse({ name: "x", address: "0x1", abi: [] }).success,
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
});
