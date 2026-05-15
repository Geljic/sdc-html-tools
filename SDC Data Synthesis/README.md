# SDC Data Synthesis

Browser-only tool for running AI synthesis skills against transcripts, documents, and images. Built for HCD practitioners who need to turn raw research into structured insights without setting up a Python environment or learning a CLI.

## What it does

Pick a skill (e.g. *Meeting Summary*, *Pain Points & Opportunities*, *HCD Synthesis*), drop in your inputs, click run. The tool packages everything into a single Anthropic call routed through the LiteLLM proxy, then returns a Markdown document you can review, copy, or download.

## Inputs

- One of seven built-in skills (or a custom prompt)
- Files dropped or selected — `.txt`, `.md`, `.vtt`, `.docx`, `.png`, `.jpg`, `.webp`, `.gif`
- Or pasted transcript text
- Optional session date and session name
- Optional de-identification toggle (replaces speaker names with P1, P2, P3…)

## Outputs

- Markdown synthesis document
- Download as `.md` or copy to clipboard
- Token estimate shown before you submit so you can judge cost / size

## Built-in skills

1. Meeting Summary
2. Action Items
3. Pain Points & Opportunities
4. Key Decisions
5. Stakeholder Positions
6. HCD Synthesis
7. Custom Prompt

## Notable features

- **Multi-file input** — drag-drop or paste; `.docx` is parsed in-browser via [mammoth.js](https://github.com/mwilliamson/mammoth.js); images go in as vision context
- **LiteLLM-routed** — all calls go through the team's LiteLLM proxy with per-user budget caps; you provide your virtual key in settings, never a raw Anthropic key
- **De-identification on export** — speaker names → P1, P2, P3… so outputs are safe to share
- **Skill definitions fetched from GitHub** — skills can be updated centrally (`Geljic/doe-synthesis-skills`); falls back to bundled system prompts if the fetch fails
- **PII flagged, never auto-redacted** — surfaces sensitive content for the practitioner to handle, in line with the pilot's "human review required" rule
- **Token estimator** — warns at 150 k characters, hard caps at 750 k

## Tech

- Vanilla HTML / CSS / JS — no build step, no framework
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) loaded from CDN (~200 KB) for `.docx` extraction
- All file processing happens client-side; nothing leaves the browser except the API call
- Settings (proxy URL, virtual key, model, skills repo URL) live in `localStorage` only — never in the HTML
- Use Chrome / Firefox; Brave blocks `localStorage` on `file://` so serve via a local file server if needed

## Usage

1. Open `index.html` (or serve via `python3 -m http.server`)
2. Open settings, paste your LiteLLM proxy URL and virtual key
3. Pick a skill, drop in your files, hit **Run**
4. Review the Markdown output, then copy or download
