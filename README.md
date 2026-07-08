# Kuri Browser Agent for Gemini CLI

A lightweight, token-efficient browser automation extension powered by the [Kuri](https://kuri.trilok.ai/) engine and the Model Context Protocol (MCP). It ships for both **Gemini CLI** (as an extension) and **Claude Code** (as a plugin), sharing the same MCP server.

## Features

- **`@kuri_agent`**: A strategic subagent for web navigation, scraping, and form-filling.
- **MCP Bridge**: A robust Node.js server that manages the Kuri process lifecycle and provides standardized tools.
- **Token Efficient**: Uses Kuri's `@eN` accessibility reference system and compact snapshots to minimize context usage.
- **Stealth by Design**: Built-in bot detection bypass and stealth patches.
- **Device Presets**: Easily switch between `iphone_15`, `desktop_chrome`, and more using the configuration tool.
- **Zero-Leaking Processes**: Automatically cleans up all Chromium child processes on exit.

## Prerequisites

1. **Kuri Binary**: You must have the `kuri` binary installed on your system.
   ```bash
   curl -fsSL https://raw.githubusercontent.com/justrach/kuri/main/install.sh | sh
   ```
2. **Node.js**: Required to run the MCP bridge.

## Installation

1. Clone or download this repository.
2. Build the MCP server:
   ```bash
   cd mcp-server && npm install && npm run build
   ```
3. Link the extension to Gemini CLI:
   ```bash
   gemini extensions link .
   ```

## Usage

Invoke the Kuri agent directly in your chat:

```text
@kuri_agent summarize the top 3 stories on https://news.ycombinator.com
```

The agent will use the `mcp_kuri_` tools to navigate, snapshot, and extract content without manual shell command prompts.

## Claude Code

The same browser agent is available to Claude Code as a plugin under [`claude-code/`](claude-code/). It reuses the shared `mcp-server/`, so the only build step is the same one as above.

### Installation

1. Build the MCP server (if you haven't already):
   ```bash
   cd mcp-server && npm install && npm run build
   ```
2. Load the plugin from the repo root. For local use, point Claude Code at the plugin directory:
   ```bash
   claude --plugin-dir ./claude-code
   ```
   Or add the bundled marketplace and install it:
   ```bash
   claude plugin marketplace add .
   claude plugin install kuri-browser-agent
   ```

> The plugin resolves the MCP server via `${CLAUDE_PLUGIN_ROOT}/../mcp-server/dist/index.js`, so the built `mcp-server/` must sit next to the `claude-code/` plugin directory (as it does in this repo).

### Usage

The `kuri` skill and `kuri-agent` subagent activate automatically for web tasks. For example:

```text
Use the kuri browser to summarize the top 3 stories on https://news.ycombinator.com
```

Claude exposes the same tools under the `mcp__kuri__*` namespace (e.g. `mcp__kuri__navigate`, `mcp__kuri__snapshot`).

> **Note**: The subagent uses the `sonnet` model for a balance of speed, capability, and cost. Adjust `model` in `claude-code/agents/kuri_agent.md` (e.g. to `haiku` for lighter/cheaper runs or `opus` for the hardest tasks).

## Available MCP Tools

- `mcp_kuri_navigate`: Go to a URL.
- `mcp_kuri_snapshot`: Get the compact accessibility tree.
- `mcp_kuri_click` / `mcp_kuri_type`: Interact with elements using `@eN` references.
- `mcp_kuri_scroll` / `mcp_kuri_hover` / `mcp_kuri_press`: High-fidelity interaction tools.
- `mcp_kuri_read`: Extract full page text or Markdown.
- `mcp_kuri_screenshot`: Take viewport or element-level screenshots.
- `mcp_kuri_evaluate`: Execute custom JavaScript in the browser.
- `mcp_kuri_configure`: Set device presets, proxies, or user agents.
- `mcp_kuri_wait`: Server-side delay for timing-sensitive tasks.
- `mcp_kuri_restart`: Restart the browser for a fresh session.
- `mcp_kuri_list_tabs` / `mcp_kuri_close_tab`: Manage multiple browser tabs.

## Architecture

- **`agents/kuri_agent.md`**: Defines the subagent persona and tool usage mandates.
- **`skills/kuri/SKILL.md`**: Strategic guide for the agent on how to browse efficiently.
- **`mcp-server/`**: The Node.js implementation of the MCP bridge.
- **`gemini-extension.json`**: Gemini CLI extension configuration and tool registration.
- **`claude-code/`**: Claude Code plugin (mirrors the agent and skill; reuses the shared `mcp-server/`).
- **`.claude-plugin/marketplace.json`**: Marketplace manifest for installing the Claude Code plugin.

## License

MIT
