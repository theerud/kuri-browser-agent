---
description: Initialize the Kuri Browser Agent — check for the kuri binary and build the plugin's MCP server if needed
---
Set up the Kuri Browser Agent plugin so its `mcp__kuri__*` tools work. The plugin's files are installed at `${CLAUDE_PLUGIN_ROOT}`.

Run the checks below. For anything missing, explain it, propose the fix, and run it **only after the user approves** — never run an installer or build silently.

## 1. kuri binary
Check whether the kuri browser engine is installed: `command -v kuri` (and `kuri --version` if present).
- If found, report the path and version.
- If missing: it is required — it's the browser engine the MCP server drives. Show this command and offer to run it on the user's approval (note it installs a third-party binary onto their system):
  ```
  curl -fsSL https://raw.githubusercontent.com/justrach/kuri/main/install.sh | sh
  ```
  After it runs, re-check `command -v kuri`.

## 2. MCP server build
Check whether the server is built — does `${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js` exist?
- If present, it's built; nothing to do.
- If missing: offer to build it. On approval, run (requires Node.js and network access):
  ```
  cd "${CLAUDE_PLUGIN_ROOT}/mcp-server" && npm install && npm run build
  ```
  Report success or the exact build error.

## 3. Activate
Once both are in place, the plugin must be reloaded so Claude Code launches the MCP server — it tried at startup, before the build existed, and failed, so `/mcp` will not list it. Tell the user to run `/reload-plugins` (or restart the session). Then confirm the tools work (e.g. a quick `mcp__kuri__list_tabs`).

Finish with a short summary: what was already OK, what you fixed, and the reconnect step the user still needs to do.
