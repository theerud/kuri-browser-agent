---
name: kuri
description: Browser automation using the Kuri engine. Use when you need to navigate web pages, take accessibility snapshots, and interact with elements via the @eN reference system.
---

# Kuri Browser Automation Skill

This skill covers the use of the Kuri browser automation engine. Kuri is a token-efficient browser that provides a compact accessibility tree to help you navigate and interact with web pages.

## Preflight
Before using the browser tools, confirm the `mcp__kuri__*` tools are actually available. If they are missing, the plugin is not initialized yet:
- In a normal session: offer to run `/kuri-setup` — it checks for the kuri binary and builds the MCP server — then reload the plugin (`/reload-plugins`, or restart the session) so the tools load. Note `/mcp` will not list `kuri` until then.
- If you are running as a subagent: you cannot initialize the plugin or reconnect MCP from here. Stop and report that the caller must run `/kuri-setup` in the main session.

## Core Interaction Loop

Use the available `mcp__kuri__*` tools to interact with the browser:

### 1. Navigation & Configuration
- **Configure**: Set device or environment. `mcp__kuri__configure(preset="iphone_15")`
- **Navigate**: Go to a URL. `mcp__kuri__navigate(url="https://example.com")`
- **Wait**: Wait for a duration. `mcp__kuri__wait(delay_ms=2000)` (Avoid shell sleeps).
- **Restart**: Fresh session. `mcp__kuri__restart()`

### 2. Observation (Seeing the Page)
- **Snapshot**: Get the compact accessibility tree. **Primary tool for finding elements.** `mcp__kuri__snapshot()` -> Result: `[Link] "Login" @e4`
- **Screenshot**: Visual capture. Use for CAPTCHAs or layout verification. Use coordinate cropping to isolate a region.
  - `mcp__kuri__screenshot(crop={x, y, width, height})`
- **Read**: Extract full text or markdown. `mcp__kuri__read(format="markdown")`

### 3. Interaction (Acting on Elements)
- **Click**: Click an element. `mcp__kuri__click(ref="@e4")`
- **Type**: Type into an input. `mcp__kuri__type(ref="@e5", text="hello")`
- **Hover**: Hover over an element. `mcp__kuri__hover(ref="@e6")`
- **Press**: Press a key. `mcp__kuri__press(key="Enter")`
- **Scroll**: Scroll the page. `mcp__kuri__scroll(direction="down")`

### 4. Advanced Interaction & Management
- **Evaluate**: Run JavaScript. `mcp__kuri__evaluate(script="window.scrollTo(0, 0)")`
- **List Tabs**: Show all open tabs. `mcp__kuri__list_tabs()`
- **New Tab**: Create and select a tab. `mcp__kuri__new_tab()`
- **Select Tab**: Select an existing tab. `mcp__kuri__select_tab(tab_id="...")`
- **Close Tab**: Close a tab. `mcp__kuri__close_tab(tab_id="...")`

## Presets Library

Use these presets in `mcp__kuri__configure` to quickly change the browser's identity:

- `desktop_chrome`: Standard Windows/Chrome environment.
- `desktop_safari`: Mac/Safari environment.
- `iphone_15`: Mobile iOS/Safari environment.
- `pixel_8`: Mobile Android/Chrome environment.
- `tablet_ipad`: Tablet environment.
- `bot_google`: Googlebot identity.

## Best Practices

- **Volatility**: `@eN` references change whenever the page content updates. Always take a new `mcp__kuri__snapshot` after clicking or navigating.
- **Parallel Tasks**: Create one tab per task and pass its `tab_id` on every browser action. The selected tab is only a convenience default and is shared by concurrent callers.
- **Wait for Load**: `mcp__kuri__navigate` waits for the page to be interactive, but some dynamic content may take longer. If you don't see what you expect, take another snapshot after a brief pause.
- **Token Economy**: Prefer `mcp__kuri__snapshot` over reading the full page content (`mcp__kuri__read`) or taking screenshots (`mcp__kuri__screenshot`) unless you need to summarize large amounts of text or perform visual analysis.
- **Visual Analysis**: Use `mcp__kuri__screenshot` when you need to solve puzzles (like CAPTCHAs), verify layouts, or understand non-textual elements. Prefer coordinate cropping to save tokens and improve model focus.
- **File Saving**: Use a workspace-relative `.png` path to save evidence directly to the workspace. Set `return_image: false` to save tokens if you only need to save the file and don't need to analyze the image yourself.
- **Cropping**: Use the `crop` parameter to isolate regions of interest. This is highly effective for visual tasks like CAPTCHA solving.
