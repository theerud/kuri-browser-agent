---
name: kuri
description: Browser automation using the Kuri engine via MCP. Use when you need to navigate web pages, take accessibility snapshots, and interact with elements via the @eN reference system.
---

# Kuri Browser Automation Skill (MCP Edition)

This skill covers the use of the Kuri browser automation engine through the Model Context Protocol (MCP). Kuri is a token-efficient browser server that provides a compact accessibility tree.

## The MCP Advantage

The Kuri extension uses an MCP server to manage the browser lifecycle. Use the qualified `mcp_kuri_` tools for all interactions.

## Core Interaction Loop

1.  **Configure (Optional)**: Set the device or environment.
    - Example: `mcp_kuri_configure(preset="iphone_15")`
2.  **Navigate**: Go to the URL.
    - Example: `mcp_kuri_navigate(url="https://example.com")`
3.  **Snapshot**: Get the compact accessibility tree. **This is your primary way to "see" the page.**
    - Example: `mcp_kuri_snapshot()` -> Result: `[Link] "Login" @e4`
4.  **Interact**: Perform actions using the `@eN` references.
    - Example: `mcp_kuri_click(ref="@e4")`
5.  **Verify & Read**: Take a new snapshot or read the content.
    - Example: `mcp_kuri_read(format="markdown")`
6.  **Restart**: Reset for a fresh session.
    - Example: `mcp_kuri_restart()`

## Presets Library

Use these presets in `mcp_kuri_configure` to quickly change the browser's identity:

- `desktop_chrome`: Standard Windows/Chrome environment.
- `desktop_safari`: Mac/Safari environment.
- `iphone_15`: Mobile iOS/Safari environment.
- `pixel_8`: Mobile Android/Chrome environment.
- `tablet_ipad`: Tablet environment.
- `bot_google`: Googlebot identity.

## Best Practices

- **Volatility**: `@eN` references change whenever the page content updates. Always take a new `mcp_kuri_snapshot` after clicking or navigating.
- **Wait for Load**: `mcp_kuri_navigate` waits for the page to be interactive, but some dynamic content may take longer. If you don't see what you expect, take another snapshot after a brief pause.
- **Token Economy**: Prefer `mcp_kuri_snapshot` over reading the full page content (`mcp_kuri_read`) unless you need to summarize or extract large amounts of text.
