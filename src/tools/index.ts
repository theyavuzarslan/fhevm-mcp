import { connectTool } from "./connect.js";
import { loadAbiTool } from "./load-abi.js";
import { encryptInputTool } from "./encrypt-input.js";
import { callTool } from "./call.js";
import { readTool } from "./read.js";
import { userDecryptTool } from "./user-decrypt.js";
import { publicDecryptTool } from "./public-decrypt.js";
import { defineTool, type AnyToolDefinition } from "./types.js";

export const allTools: AnyToolDefinition[] = [
  defineTool(connectTool),
  defineTool(loadAbiTool),
  defineTool(encryptInputTool),
  defineTool(callTool),
  defineTool(readTool),
  defineTool(userDecryptTool),
  defineTool(publicDecryptTool),
];
