# SDC Timeline Builder

Browser-only tool for building Gantt-style timeline slides — swim lanes, coloured bars, go-live markers — for HCD project delivery decks.

## What it does

Takes a date range plus a set of rows-and-bars and renders a timeline as both a live SVG preview and a downloadable PPTX slide. Designed for the kind of high-level rollout view that goes into governance and stakeholder packs (not for fine-grained task tracking — use Jira for that).

## Inputs

- Title, subtitle
- Date range (start month / year → end month / year)
- Custom rows (swim lanes) — each row holds one or more bars
- Each bar — name, type (Service Design, Prototype, User Research, Development, Change, Hypercare, Go Live, …), start date, end date
- Optional "we are here" vertical marker
- Optional weekly column headers under the months
- Editable bar-type legend (rename or recolour any of the 8 presets)

## Outputs

- Live SVG preview
- PPTX export (DoE-branded, includes the legend)
- Jira CSV export — bars become tasks with names and dates for team import
- JSON save/load to round-trip the full timeline configuration

## Notable features

- **8 epic presets** with consistent DoE-aligned colours so timelines stay visually coherent across projects
- **Auto track assignment** — bars on the same row that overlap get assigned to separate tracks automatically; no manual stacking
- **Overflow detection** — warns when content exceeds slide bounds and offers auto-scaling
- **"We are here" marker** — drop a vertical line on today's date for status reviews
- **Week labels** — toggle a w/c row under the month header (best for ≤ 3-month timelines)

## Tech

- Vendored [PptxGenJS](https://github.com/gitbrent/PptxGenJS) in `lib/pptxgen.bundle.js`
- Pure HTML / CSS / vanilla JS — no framework, no build step, no server required
- Track-assignment algorithm runs per row to prevent bar overlap

## Usage

1. Open `index.html`
2. Set the date range and add rows
3. Click any row to add bars; pick a type from the legend
4. Toggle "we are here" / week labels as needed
5. **Export PPTX** for the slide, **Export JSON** to save the config, **Export Jira CSV** for the team
