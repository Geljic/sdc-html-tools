# SDC Status Report

Browser-only tool for producing the weekly DoE-branded project status slide. Used by Iteration Managers and project leads delivering Q+ governance updates.

## What it does

Takes form input describing a project's work streams and renders a single, DoE-branded PowerPoint slide with a RAG (Red / Amber / Green / Navy) traffic-light table — the same layout used in Q+ steering packs.

## Inputs

- Project name, reporting period, author
- Work streams — each with a name, RAG status, "achieved this period" text, and "next period" text
- Optional sub-sections within a stream (e.g. *Project Dev* vs *Governance*)
- Optional "Directors' support required" callout

## Outputs

- Live SVG preview that updates as you type
- PPTX export (13.33" × 7.5", DoE-branded, official logo, RAG legend)
- JSON export/import to round-trip the full state
- localStorage autosave — work survives a tab close

## Notable features

- **RAG colour coding** — green / amber / red / navy swim lanes for instant status read
- **Sub-sectioned rows** — collapse multi-thread streams into one row without losing detail
- **No server / no build step** — open `index.html` in any modern browser
- **Test data included** — `test-data.json` for a quick demo without typing

## Tech

- Vendored [PptxGenJS](https://github.com/gitbrent/PptxGenJS) in `lib/pptxgen.bundle.js` — no CDN dependency
- Pure HTML / CSS / vanilla JS — no framework
- State is a plain object: `{ project, period, streams[] }` where each stream has `id, name, rag, subSections, achieved, next`
- SVG preview is rendered at 100 px / inch so what you see matches the exported slide

## Usage

1. Open `index.html` (Chrome / Firefox / Brave all work)
2. Fill in the form, or click "Load test data"
3. Click **Export PPTX** to download the slide
4. Click **Export JSON** to save state, or **Import JSON** to restore it later
