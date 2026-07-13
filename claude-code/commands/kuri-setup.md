---
description: Initialize the Kuri Browser Agent — check for the kuri binary and build the plugin's MCP server if needed
---
Set up the Kuri Browser Agent plugin so its `mcp__kuri__*` tools work. The plugin's files are installed at `${CLAUDE_PLUGIN_ROOT}`.

Run the checks below. For anything missing, explain it, propose the fix, and run it **only after the user approves** — never run an installer or build silently.

## 1. Runtime versions
Check Node.js with `node --version`. The MCP server requires Node.js 22.2.0 or newer. If Node is missing or older, stop and ask the user to upgrade it before continuing.

Check whether the kuri browser engine is installed: `command -v kuri` and `kuri --version` if present. Kuri 0.4.1 or newer is required.
- If found, report the path and version.
- If missing or older than 0.4.1: it is required — it's the browser engine the MCP server drives. Show this command and offer to run it on the user's approval (note it installs a third-party binary onto their system):
  ```
  curl -fsSL https://raw.githubusercontent.com/justrach/kuri/main/install.sh | sh
  ```
  After it runs, re-check `command -v kuri`.

## 2. MCP server dependencies and build
The server is ready only when all of these are true:
- `${CLAUDE_PLUGIN_ROOT}/mcp-server/node_modules/@modelcontextprotocol/sdk/package.json` exists.
- `${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js` exists.
- No file under `${CLAUDE_PLUGIN_ROOT}/mcp-server/src/`, and neither `package.json` nor `package-lock.json`, is newer than `dist/index.js`.

If a dependency is missing or the build is missing or stale, offer to install the exact locked dependencies and rebuild. On approval, run (requires network access):
  ```
  cd "${CLAUDE_PLUGIN_ROOT}/mcp-server" && npm ci && npm run build
  ```
  Report success or the exact build error.

## 3. Activate
Once the runtime, dependencies, and build are in place, the plugin must be reloaded so Claude Code launches the MCP server — it may have tried at startup before the server was ready. Tell the user to run `/reload-plugins` (or restart the session). Then confirm the tools work (e.g. a quick `mcp__kuri__list_tabs`).

Finish with a short summary: what was already OK, what you fixed, and the reconnect step the user still needs to do.
