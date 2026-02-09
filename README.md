# Jot

**Jot** is a lightweight design decision journal for Figma.

It helps designers capture the *why* behind decisions, while context is still fresh.

> Align on why, not just what.

---

## How it works

1. Select a layer or frame in Figma
2. Choose a type (decision, assumption, trade-off, feedback, or design debt)
3. Write a short note explaining the rationale
4. Save it

Each entry is linked to the layer it relates to. Click an entry to jump back to that context. Entries can be edited or deleted as thinking evolves.

Export everything to Markdown when you need to share context outside Figma.

---

## Setup

### Development

```
npm install
npm run build
```

Or keep the compiler running:

```
npm run watch
```

Then load the plugin in Figma via **Plugins > Development > Import plugin from manifest**.

### File linking (optional)

In the **Setup** tab, paste your Figma file URL to enable clickable deep links in Markdown exports. This is stored per file — you only need to do it once.

### Tests

```
npm test
```

---

## What Jot is not

- A task tracker
- A design spec
- A comments replacement

Jot won't manage your process. It just remembers what happened.

---

## Security & privacy

- All entries are stored using Figma's plugin data API — they live inside the Figma file
- No data is sent to external services
- No network requests are made

Anyone with edit access to the file can view, edit, or delete entries. Treat Jot as a working design journal, not an audit log.

---

## Author

Built by Michelle, a product designer who got tired of design decisions being quietly rewritten.
