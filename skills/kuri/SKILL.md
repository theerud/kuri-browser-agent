---
name: kuri
description: Browser automation using the Kuri engine. Use when you need to navigate web pages, take accessibility snapshots, and interact with elements via the @eN reference system.
---

# Kuri Browser Automation Skill

This skill covers the use of the Kuri browser automation engine. Kuri is a token-efficient browser that provides a compact accessibility tree to help you navigate and interact with web pages.

## Core Interaction Loop

Use the available `mcp_kuri_*` tools to interact with the browser:

### 1. Navigation & Configuration
- **Configure**: Set device or environment. `mcp_kuri_configure(preset="iphone_15")`
- **Navigate**: Go to a URL. `mcp_kuri_navigate(url="https://example.com")`
- **Wait**: Wait for a duration. `mcp_kuri_wait(delay_ms=2000)` (Avoid shell sleeps).
- **Restart**: Fresh session. `mcp_kuri_restart()`

### 2. Observation (Seeing the Page)
- **Snapshot**: Get the compact accessibility tree. **Primary tool for finding elements.** `mcp_kuri_snapshot()` -> Result: `[Link] "Login" @e4`
- **Screenshot**: Visual capture. Use for CAPTCHAs or layout verification. Use coordinate cropping to isolate a region. `mcp_kuri_screenshot(crop={x, y, width, height})`
- **Read**: Extract full text or markdown. `mcp_kuri_read(format="markdown")`

### 3. Interaction (Acting on Elements)
- **Click**: Click an element. `mcp_kuri_click(ref="@e4")`
- **Type**: Type into an input. `mcp_kuri_type(ref="@e5", text="hello")`
- **Hover**: Hover over an element. `mcp_kuri_hover(ref="@e6")`
- **Press**: Press a key. `mcp_kuri_press(key="Enter")`
- **Scroll**: Scroll the page. `mcp_kuri_scroll(direction="down")`

### 4. Advanced Interaction & Management
- **Evaluate**: Run JavaScript. `mcp_kuri_evaluate(script="window.scrollTo(0, 0)")`
- **List Tabs**: Show all open tabs. `mcp_kuri_list_tabs()`
- **Close Tab**: Close a tab. `mcp_kuri_close_tab(tab_id="...")`

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
- **Token Economy**: Prefer `mcp_kuri_snapshot` over reading the full page content (`mcp_kuri_read`) or taking screenshots (`mcp_kuri_screenshot`) unless you need to summarize large amounts of text or perform visual analysis.
- **Visual Analysis**: Use `mcp_kuri_screenshot` when you need to solve puzzles (like CAPTCHAs), verify layouts, or understand non-textual elements. Prefer coordinate cropping to save tokens and improve model focus.
- **File Saving**: Use the `path` parameter to save evidence directly to the workspace. Set `return_image: false` to save tokens if you only need to save the file and don't need to analyze the image yourself.
- **Cropping**: Use the `crop` parameter to isolate regions of interest. This is highly effective for visual tasks like CAPTCHA solving.
