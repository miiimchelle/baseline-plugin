# Changelog
All notable changes to **Jot** (formerly Baseline) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]
### Added
- —

### Changed
- —

### Fixed
- —

---

## [v2.0.0] - 2026-02-09
### Added
- Renamed plugin from Baseline to **Jot**
- **Setup tab**: paste your Figma file URL once per file to enable deep links in Markdown export (replaces private API dependency)
- **Filter by entry type** on the View entries tab
- **Entry count** shown on the View tab and tab button
- **Copy to clipboard** button for Markdown export
- **Improved empty state** with onboarding guidance when no entries exist

### Changed
- Removed `enablePrivatePluginApi` — plugin is now compatible with Figma Community publishing
- Storage keys updated to `jot.journal.v1` and `jot.filekey.v1`

### Fixed
- —

---

## [v1.0.1] - 2025-12-16
### Added
- Two-tab layout: **Write entry** and **View entries**
- Shadcn-style tabs UI treatment
- Click an entry to jump to its linked layer/frame
- Edit and delete entries from the entries list

### Changed
- Improved View entries layout so the list doesn't appear visually cut off (better resizing/scroll behavior)
- Markdown export formatting improvements (more structured output)

### Fixed
- —

---

## [v1.0.0] - 2025-12-15
### Added
- Baseline journal entries with entry types (decision, assumption, tradeoff, feedback, debt)
- Save entries linked to current selection (page + node)
- Export journal as Markdown
