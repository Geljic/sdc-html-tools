# SDC HTML Tools

Browser-only Human-Centred Design tools, built by the **NSW Department of Education — Service Design & Change** AI Pilot.

Each tool is a self-contained HTML/CSS/JS app — no build step, no backend. They run entirely in the browser and persist their state locally (LocalStorage / IndexedDB).

**Live site:** https://geljic.github.io/sdc-html-tools/

---

## Tools

| Tool | Purpose |
| --- | --- |
| **Project Charter** | Form-driven HCD project charter generator. Auto-saves locally, live preview, gap warnings, exports to PPTX/PDF/JSON. |
| **Status Report** | Stream-by-stream weekly status report builder with RAG indicators. PPTX export. |
| **Persona Builder** | Persona artefact generator. AI-assisted drafting via LiteLLM. PPTX/PDF export. |
| **Project Synthesiser** | Research synthesis pipeline — upload `.docx` interview transcripts, de-identify, synthesise per-participant themes, merge across the cohort, export final report. |
| **Data Synthesis** | General-purpose AI-assisted synthesis tool driven by external skill definitions. |
| **Timeline Builder** | Gantt-style timeline slide builder for project delivery decks. PPTX + Jira CSV export. |

## How to use

Open https://geljic.github.io/sdc-html-tools/ and pick a tool from the homepage.

The AI-powered tools (Persona Builder, Project Synthesiser, Data Synthesis) need a LiteLLM API endpoint and virtual key — these are entered in each tool's settings panel and stored locally in the browser only.

## Source of truth

This repository is **mirrored** from a private upstream. Direct PRs here will not be merged — file issues here, but raise changes against the upstream repo.
