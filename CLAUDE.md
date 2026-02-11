# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Rules

- Verify changes with `npm build` and `npm test`
- Always add tests for new features
- Keep tests short with minimal output
- Follow existing design docs/examples
- Ask questions about implementation Details before start implementing

## Preferences

- Be concise, code only, no commentary
- Output code/commands only unless asked
- Prefer diffs or isolated functions
- Do not restate context or explain basics

## Build & Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once

## Architecture

<!-- Describe the high-level architecture once the project takes shape -->
<!-- Focus on non-obvious patterns, key abstractions, and how components interact -->
