# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- MCP contract tests and CI coverage for browser requests, lifecycle recovery, Gemini manifest portability, input validation, and PNG handling.
- Explicit `new_tab` and `select_tab` tools, plus optional `tab_id` targeting on browser actions for concurrent callers.

### Fixed
- Localhost navigation now bypasses Kuri's public-URL SSRF guard through the active browser tab, allowing agents to inspect local development servers.
- Kuri startup is serialized, retries one transient failure, recovers after child exit, and uses an isolated Chrome profile per MCP server instance.
- Device emulation now uses Kuri's `ua` parameter, and screenshots no longer advertise an unsupported element-reference crop.
- Gemini resolves the MCP server relative to the installed extension and exposes settings through their environment variables.
- Screenshot writes are limited to PNG files inside the workspace, with bounded viewport, delay, and crop inputs.
- Setup detects unsupported runtimes, missing dependencies, and stale builds instead of checking only for `dist/index.js`.

## [0.5.0] - 2026-07-08

### Added
- `/kuri-setup` command that checks for the kuri binary and builds the bundled MCP server on approval, so the Claude Code plugin can be installed from a GitHub marketplace without a manual clone-and-build. Preflight guidance in the `kuri` skill and `kuri_agent` routes to it when the tools are unavailable.

### Changed
- The MCP server now lives inside the plugin (`claude-code/mcp-server/`) so it ships self-contained and survives a marketplace/git install.
- README documents the GitHub install flow (`/plugin marketplace add` → `/kuri-setup` → `/reload-plugins`).

## [0.4.0] - 2026-07-08

### Added
- `ui-reviewer` subagent for the Claude Code plugin: visual QA across viewport presets with a structured findings report. Preloads the `kuri` skill for browser mechanics.

### Fixed
- `configure` now applies the preset's viewport, device-pixel-ratio, and user agent via kuri's `/emulate` endpoint — previously it computed these but never sent them, so presets were a no-op. Mobile presets carry accurate device-pixel-ratios.

## [0.3.0] - 2026-07-08

### Added
- Claude Code plugin (`claude-code/`) exposing the Kuri browser agent as a subagent and skill, with a marketplace manifest for installation.

### Fixed
- Send the bearer token now required by the Kuri 0.4.1 HTTP API, resolving 401 errors on browser actions.

### Changed
- Add a shared `scripts/set-version.mjs` that bumps the version across all release artifacts in one step.

## [0.2.0] - 2026-05-07

### Added
- Expanded browser automation suite: `click`, `type`, `scroll`, `hover`, `press`, `screenshot`, `evaluate`, `wait`, `list_tabs`, and `close_tab`.
- Fully integrated all new interaction tools into the `@kuri_agent` subagent persona and `kuri` skill guide.

### Changed
- Comprehensive update to documentation and README to reflect the full suite of automation capabilities.

## [0.1.0] - 2026-05-05

### Added
- Initial release of Kuri Browser Agent extension.
- Features `@kuri_agent` subagent and browser automation skills.
