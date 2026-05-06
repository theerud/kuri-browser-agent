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
        name: "scroll",
        description: "Scroll the page up or down.",
        inputSchema: {
          type: "object",
          properties: {
            direction: { type: "string", enum: ["up", "down"] },
          },
          required: ["direction"],
        },
      },
      {
        name: "hover",
        description: "Hover over an element by its @eN reference.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string" },
          },
          required: ["ref"],
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
        name: "press",
        description: "Press a keyboard key (e.g., 'Enter', 'Escape', 'ArrowDown').",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string" },
          },
          required: ["key"],
        },
      },
      {
        name: "evaluate",
        description: "Execute arbitrary JavaScript in the browser context.",
        inputSchema: {
          type: "object",
          properties: {
            script: { type: "string" },
          },
          required: ["script"],
        },
      },
      {
        name: "list_tabs",
        description: "List all currently open tabs.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "close_tab",
        description: "Close a specific tab by ID, or the current tab if ID is omitted.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "string" },
          },
        },
      },
      {
        name: "wait",
        description: "Wait for a specified amount of time (server-side delay).",
        inputSchema: {
          type: "object",
          properties: {
            delay_ms: { type: "number", description: "Delay in milliseconds." },
          },
          required: ["delay_ms"],
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
        name: "screenshot",
        description: "Take a PNG screenshot of the viewport or a specific element.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Optional @eN reference to crop the screenshot to a specific element." },
            path: { type: "string", description: "Optional workspace path to save the PNG file (e.g., 'tmp/evidence.png')." },
            return_image: { type: "boolean", description: "Whether to return the image to the LLM context. Defaults to true." },
            crop: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["x", "y", "width", "height"],
              description: "Optional region to crop from the screenshot.",
            },
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
      case "scroll":
        return await engine.scroll((args as any).direction);
      case "hover":
        return await engine.hover((args as any).ref);
      case "press":
        return await engine.press((args as any).key);
      case "evaluate":
        return await engine.evaluate((args as any).script);
      case "list_tabs":
        return await engine.listTabs();
      case "close_tab":
        return await engine.closeTab((args as any).tab_id);
      case "read":
        return await engine.read((args as any).format);
      case "screenshot":
        return await engine.screenshotImage((args as any).ref, (args as any).path, (args as any).return_image, (args as any).crop);
      case "wait":
        return await engine.wait((args as any).delay_ms);
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
