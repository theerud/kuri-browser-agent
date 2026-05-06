# Kuri Browser Agent for Gemini CLI

A lightweight, token-efficient browser automation extension for Gemini CLI, powered by the [Kuri](https://kuri.trilok.ai/) engine and the Model Context Protocol (MCP).

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
- **`gemini-extension.json`**: Extension configuration and tool registration.

## License

Apache-2.0
