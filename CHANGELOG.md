# Changelog

All notable changes to this project will be documented in this file.

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
