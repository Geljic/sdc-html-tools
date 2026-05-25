# SDC Data Synthesis

Browser-only tool for running AI synthesis skills against transcripts, documents, and images. Built for HCD practitioners who need to turn raw research into structured insights without setting up a Python environment or learning a CLI.

## What it does

Pick a skill (e.g. *Meeting Summary*, *Pain Points & Opportunities*, *HCD Synthesis*), drop in your inputs, click **Run**. The tool packages everything into a single API call routed through the DoE LiteLLM proxy, then returns a Markdown document you can review, copy, or download.

## Inputs

- One of seven built-in skills (or a custom prompt)
- Files dropped or selected — `.txt`, `.md`, `.vtt`, `.docx`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
- Or pasted transcript text
- Optional session date and session name (used in output filename and header)
- Optional de-identification toggle (instructs the AI to replace speaker names with P1, P2, P3…)

## Outputs

- Markdown synthesis document matching the selected skill's output template
- **Download as `.md`** — filename: `synthesis-[session-name]-YYYY-MM-DD.md`
- **Copy to clipboard** — one-click copy of the full output
- Token estimate shown before you submit so you can judge cost / size

## Built-in skills

| # | Slug | Name | Description |
|---|------|------|-------------|
| 1 | `meeting-summary` | Meeting Summary | Overview, key points, decisions & action items from a single meeting |
| 2 | `action-items` | Action Items | Extract every action, owner & due date — nothing else |
| 3 | `pain-points` | Pain Points & Opportunities | Surface friction, unmet needs & opportunities with evidence quotes |
| 4 | `key-decisions` | Key Decisions | Decisions made, rationale, who decided, and what was deferred |
| 5 | `stakeholder-positions` | Stakeholder Positions | Map who said what — useful for alignment & conflict mapping |
| 6 | `hcd-synthesis` | HCD Synthesis | Full HCD synthesis: themes, pain points, actions & data quality notes |
| 7 | `custom` | Custom Prompt | Write your own system prompt — full control over the output |

## Notable features

- **Multi-file input** — drag-drop or paste; `.docx` is parsed in-browser via [mammoth.js](https://github.com/mwilliamson/mammoth.js) (CDN, ~200 KB); images go in as vision context
- **Remote skill definitions** — skill system prompts are fetched from `Geljic/doe-synthesis-skills` on GitHub at runtime; falls back to bundled prompts if the fetch fails
- **LiteLLM-routed** — all calls go through the team's LiteLLM proxy with per-user budget caps; you provide your virtual key in settings, never a raw Anthropic key
- **De-identification** — prompt-level instruction to replace speaker names with P1, P2, P3… so outputs are safe to share
- **PII flagged, never auto-redacted** — surfaces sensitive content for the practitioner to handle, in line with the pilot's "human review required" rule
- **Token estimator** — warns at 150 k characters, hard caps at 750 k; large individual files (> 50 k chars) are flagged
- **Grouped dropdown navbar** — part of the shared SDC AI Tools navigation (HCD Tools group)

## Settings (localStorage)

Open **⚙️ Settings** in the tool to configure:

| Setting | localStorage key | Default |
|---------|-----------------|---------|
| LiteLLM proxy URL | `doe_synthesis_proxy_url` | (required) |
| Virtual key | `doe_synthesis_api_key` | (required) |
| Model | `doe_synthesis_model` | `claude-sonnet-4-6` |
| Skills repo URL | `doe_synthesis_skills_url` | `https://raw.githubusercontent.com/Geljic/doe-synthesis-skills/main/skills` |

Settings are stored in `localStorage` only — never in the HTML source.

## Tech

- Vanilla HTML / CSS / JS — no build step, no framework
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) loaded from CDN for `.docx` extraction
- All file processing happens client-side; nothing leaves the browser except the API call
- Use Chrome / Firefox; Brave blocks `localStorage` on `file://` — serve via `python3 -m http.server` if needed

## Usage

1. Open `index.html` (or serve via `python3 -m http.server`)
2. Open **⚙️ Settings**, paste your LiteLLM proxy URL and virtual key
3. Pick a skill, drop in your files (or paste text), hit **Run**
4. Review the Markdown output, then copy or download

## File structure

```
html_tools/SDC Data Synthesis/
├── index.html          ← Main tool
├── css/styles.css      ← Page styles (includes navbar offset)
├── js/app.js           ← All logic: skills, API, file handling, UI
└── README.md           ← This file
```
