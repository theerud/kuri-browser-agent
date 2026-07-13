# Kuri Browser Agent

A lightweight, token-efficient browser automation extension powered by the [Kuri](https://kuri.trilok.ai/) engine and the Model Context Protocol (MCP). It ships for both **Gemini CLI** (as an extension) and **Claude Code** (as a plugin), sharing the same MCP server.

## Features

- **`@kuri_agent`**: A strategic subagent for web navigation, scraping, and form-filling.
- **MCP Bridge**: A robust Node.js server that manages the Kuri process lifecycle and provides standardized tools.
- **Token Efficient**: Uses Kuri's `@eN` accessibility reference system and compact snapshots to minimize context usage.
- **Stealth by Design**: Built-in bot detection bypass and stealth patches.
- **Device Presets**: Easily switch between `iphone_15`, `desktop_chrome`, and more using the configuration tool.
- **Zero-Leaking Processes**: Automatically cleans up all Chromium child processes on exit.

## Prerequisites

1. **Kuri Binary 0.4.1+**: You must have the `kuri` binary installed on your system.
   ```bash
   curl -fsSL https://raw.githubusercontent.com/justrach/kuri/main/install.sh | sh
   ```
2. **Node.js 22.2.0+**: Required to run the MCP bridge.

## Installation

1. Clone or download this repository.
2. Build the MCP server:
   ```bash
   cd claude-code/mcp-server && npm ci && npm run build
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

The browser agent ships as a Claude Code plugin under [`claude-code/`](claude-code/), bundling the MCP server, two subagents (`kuri-agent`, `ui-reviewer`), the `kuri` skill, and a `/kuri-setup` command.

### Install from GitHub

1. Add the marketplace and install the plugin:
   ```
   /plugin marketplace add theerud/kuri-browser-agent
   /plugin install kuri-browser-agent@kuri-browser-agent
   ```
2. Initialize it. The plugin's MCP server is TypeScript that must be built once, and the kuri engine must be present:
   ```
   /kuri-setup
   ```
   This checks for the `kuri` binary (offering to install it) and builds the bundled MCP server. It asks before running anything.
3. Reload the plugin so Claude Code launches the MCP server: run `/reload-plugins` (or restart the session). `/mcp` won't list `kuri` until then — the server failed to launch at startup, before the build existed.

After that, the `kuri` skill and the `kuri-agent` / `ui-reviewer` subagents activate automatically for browser tasks.

### Local development

Point Claude Code at the plugin directory in a built clone:
```bash
cd claude-code/mcp-server && npm ci && npm run build   # build once
claude --plugin-dir ./claude-code
```

### Usage

```text
Use the kuri browser to summarize the top 3 stories on https://news.ycombinator.com
```
```text
Have the ui-reviewer check http://localhost:3000 across desktop and mobile and report layout issues
```

Claude exposes the tools under the `mcp__kuri__*` namespace (e.g. `mcp__kuri__navigate`, `mcp__kuri__snapshot`).

> **Note**: Both subagents use the `sonnet` model. Adjust `model` in `claude-code/agents/*.md` (e.g. `haiku` for lighter/cheaper runs, `opus` for the hardest tasks).

## Available MCP Tools

- `mcp_kuri_navigate`: Go to a URL.
- `mcp_kuri_snapshot`: Get the compact accessibility tree.
- `mcp_kuri_click` / `mcp_kuri_type`: Interact with elements using `@eN` references.
- `mcp_kuri_scroll` / `mcp_kuri_hover` / `mcp_kuri_press`: High-fidelity interaction tools.
- `mcp_kuri_read`: Extract full page text or Markdown.
- `mcp_kuri_screenshot`: Take viewport screenshots with optional coordinate cropping.
- `mcp_kuri_evaluate`: Execute custom JavaScript in the browser.
- `mcp_kuri_configure`: Set device presets, proxies, or user agents.
- `mcp_kuri_wait`: Server-side delay for timing-sensitive tasks.
- `mcp_kuri_restart`: Restart the browser for a fresh session.
- `mcp_kuri_new_tab` / `mcp_kuri_select_tab` / `mcp_kuri_list_tabs` / `mcp_kuri_close_tab`: Manage multiple browser tabs.

Browser actions accept an optional `tab_id`. Parallel agents should create separate tabs and pass their tab IDs explicitly so they do not change each other's active page.

## Architecture

- **`agents/kuri_agent.md`**, **`skills/kuri/SKILL.md`**: Gemini CLI subagent persona and browsing guide.
- **`gemini-extension.json`**: Gemini CLI extension configuration and tool registration.
- **`claude-code/`**: The Claude Code plugin.
  - **`mcp-server/`**: The Node.js MCP bridge (bundled in the plugin; shared with the Gemini extension).
  - **`agents/`**: `kuri_agent` (general web automation) and `ui-reviewer` (visual QA).
  - **`skills/kuri/`**: Browsing guide, preloaded by `ui-reviewer`.
  - **`commands/kuri-setup.md`**: First-time initialization (build server, check for kuri).
- **`.claude-plugin/marketplace.json`**: Marketplace manifest for installing the Claude Code plugin from GitHub.

## License

MIT
