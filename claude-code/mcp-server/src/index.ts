import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
const tabIdProperty = { type: "string", description: "Optional tab ID. Defaults to the selected tab." };

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
            width: { type: "integer", minimum: 1, maximum: 8192 },
            height: { type: "integer", minimum: 1, maximum: 8192 },
            proxy: { type: "string" },
            headless: { type: "boolean" },
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
            tab_id: tabIdProperty,
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
        name: "new_tab",
        description: "Create a blank tab and select it for subsequent calls.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "select_tab",
        description: "Select an existing tab for subsequent calls.",
        inputSchema: {
          type: "object",
          properties: { tab_id: tabIdProperty },
          required: ["tab_id"],
        },
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
            delay_ms: { type: "integer", minimum: 0, maximum: 60000, description: "Delay in milliseconds." },
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
            tab_id: tabIdProperty,
          },
        },
      },
      {
        name: "screenshot",
        description: "Take a PNG screenshot of the viewport, optionally cropped to coordinates.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional workspace path to save the PNG file (e.g., 'tmp/evidence.png')." },
            return_image: { type: "boolean", description: "Whether to return the image to the LLM context. Defaults to true." },
            tab_id: tabIdProperty,
            crop: {
              type: "object",
              properties: {
                x: { type: "integer", minimum: 0 },
                y: { type: "integer", minimum: 0 },
                width: { type: "integer", minimum: 1, maximum: 8192 },
                height: { type: "integer", minimum: 1, maximum: 8192 },
              },
              required: ["x", "y", "width", "height"],
              description: "Optional region to crop from the screenshot.",
            },
          },
        },
      },
      {
        name: "type",
        description: "Type text into an element by its @eN reference.",
        inputSchema: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The @eN reference of the element to type into." },
            text: { type: "string", description: "The text to type." },
            tab_id: tabIdProperty,
          },
          required: ["ref", "text"],
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
  const { name } = request.params;
  const args = (request.params.arguments || {}) as any;

  try {
    switch (name) {
      case "configure":
        return await engine.configure(args);
      case "navigate":
        return await engine.navigate(args.url, args.tab_id);
      case "snapshot":
        return await engine.snapshot(args.filter, args.tab_id);
      case "scroll":
        return await engine.scroll(args.direction, args.tab_id);
      case "click":
        return await engine.click(args.ref, args.tab_id);
      case "type":
        return await engine.type(args.ref, args.text, args.tab_id);
      case "hover":
        return await engine.hover(args.ref, args.tab_id);
      case "press":
        return await engine.press(args.key, args.tab_id);
      case "evaluate":
        return await engine.evaluate(args.script, args.tab_id);
      case "list_tabs":
        return await engine.listTabs();
      case "new_tab":
        return await engine.newTab();
      case "select_tab":
        return await engine.selectTab(args.tab_id);
      case "close_tab":
        return await engine.closeTab(args.tab_id);
      case "read":
        return await engine.read(args.format, args.tab_id);
      case "screenshot":
        return await engine.screenshotImage(args.path, args.return_image, args.crop, args.tab_id);
      case "wait":
        return await engine.wait(args.delay_ms);
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
