import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { KuriEngine } from "./kuri-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

const server = new Server(
  {
    name: pkg.name || "kuri-browser-server",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const engine = new KuriEngine();

// Register tool listings
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "configure",
        description: "Configure the browser environment using a preset or custom values. May restart the browser.",
        inputSchema: {
          type: "object",
          properties: {
            preset: { type: "string", enum: ["desktop_chrome", "desktop_safari", "iphone_15", "pixel_8", "tablet_ipad", "bot_google"] },
            userAgent: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            proxy: { type: "string" },
            headless: { type: "boolean" },
          },
        },
      },
      {
        name: "navigate",
        description: "Navigate to a URL and wait for the page to become interactive.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
      },
      {
        name: "snapshot",
        description: "Get a compact accessibility tree snapshot of the current page.",
        inputSchema: {
          type: "object",
          properties: {
            filter: { type: "string", enum: ["interactive", "all"] },
          },
        },
      },
      {
        name: "click",
        description: "Click an element by its @eN reference.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string" },
          },
          required: ["ref"],
        },
      },
      {
        name: "type",
        description: "Type text into an input element by its @eN reference.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string" },
            text: { type: "string" },
          },
          required: ["ref", "text"],
        },
      },
      {
        name: "read",
        description: "Extract the full page content as Markdown or plain text.",
        inputSchema: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["markdown", "text"] },
          },
        },
      },
      {
        name: "restart",
        description: "Restarts the browser engine to clear session state and start fresh.",
        inputSchema: {
          type: "object",
          properties: {
            reason: { type: "string" },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "configure":
        return await engine.configure(args as any);
      case "navigate":
        return await engine.navigate((args as any).url);
      case "snapshot":
        return await engine.snapshot((args as any).filter);
      case "click":
        return await engine.click((args as any).ref);
      case "type":
        return await engine.type((args as any).ref, (args as any).text);
      case "read":
        return await engine.read((args as any).format);
      case "restart":
        return await engine.restart();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kuri MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
