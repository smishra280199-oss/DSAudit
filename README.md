# System Audit (dslint)

A Chrome Manifest V3 side-panel extension that answers one question about any web product, without its source code or design-system docs: **how consistently and systematically is this interface built, and what would it take to improve it?**

It observes what a page renders and how its CSS is written, infers the design system behind it, scores it, and lists concrete, prioritised fixes with a planning estimate of what they are worth.

It is built for outreach: capture a prospect's product and send them a **white-labelled PDF report** that a VP of Design or Product can read in two minutes. The report covers what inconsistency costs them each year, what they have versus what they need, where to start, and how your agency can help.

## Quick start

```bash
npm install
npm run build        # → dist/ (the extension) and preview-dist/ (the dev harness)
```

Load `dist/` in `chrome://extensions` (Developer mode → Load unpacked). Open any http, https or file page, then click the toolbar icon or press **Alt+Shift+S**.

| Command | What it does |
| --- | --- |
| `npm run preview` | Serves the panel beside a demo page at http://localhost:5173, no extension needed |
| `npm run dev` | Rebuilds `dist/` on change |
| `npm test` | Unit tests, plus the real capture code run against the demo page in jsdom |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | Typecheck, test and build: run before every commit |

## Using it

1. **Capture page** (or press `C` in the panel). The first time, Chrome asks for optional access to all sites. Without it, only the tab you opened the panel on can be read and cross-origin stylesheets are skipped.
2. **Overview**: the executive view, matching page 1 of the client report. It shows the yearly cost of inconsistency, what's recoverable, the cleanup cost and payback, *what you have vs. what you need* (e.g. "23 colours in use, 15 needed, $2,720/yr"), the rebrand effort with and without tokens, the three places to start, and health by area.
3. **Foundations**: colour (with a perceptual palette), type, spacing, shape, elevation, motion and tokens. Select any value to highlight where it is used on the page.
4. **Components**: buttons, inputs, links, headings, cards, badges and avatars, grouped into visual variants and rebuilt from their captured styles.
5. **Opportunities**: the ranked fix list. Search it, filter it, highlight affected elements, copy a fix, or dismiss items (dismissals are saved per snapshot).
6. **Inspect** (`I`): click any element to see each style's computed value, the rule that wins, whether it uses a token, a suggested token, and its text contrast.
7. **History**: every capture is stored locally. Reopen, compare with the current capture (per-area deltas), export or delete.

**Client reports.** Set your agency, your name, contact details and an optional personal note once under `⋯` → *Report details…*. The client name is derived from the page and can be overridden per site. Then use *Download PDF report* on the Overview. The PDF has these pages:

1. **The money**: a headline cost, four KPIs, the consolidation table, rebrand effort and key facts, next to a screenshot of their product.
2. **Where to start and where you stand**: three priorities, with area health in plain business language.
3. **Recommended plan**: three phases with timelines and cost, plus a *How {your agency} can help* section with your contact details.
4. **Appendix**: all findings, then method and assumptions.

The same content is available as a web report (HTML), a Markdown summary for emails, or raw JSON. Tune the cost model under *Savings assumptions…*. Keys `1`–`6` switch views.

All data stays on your machine, in `chrome.storage.local`.

## Repository layout

```
src/
  shared/        Snapshot contract + pure helpers (colour, CSS values, class naming, contrast)
  capture/       Runs in the page: rendered layer, authored layer, overlays, Inspect mode
  inspect/       Cascade resolution for one picked element
  inference/     Snapshot → analysis: foundations, components, tokens, a11y, opportunities
  scoring/       Area scores, AREA_WEIGHTS, grade
  savings/       Planning estimate: line items per redundant style, re-theme cost, cleanup
  insights/      Executive summary: headline, consolidation, priorities, plan, plain-language copy
  audit/         Bundles snapshot + analysis + score + savings; compares audits
  report/        Client reports: pdf/ (vector PDF via pdf-lib), HTML, Markdown, JSON, branding
  storage/       Key-value abstraction, snapshot store, settings
  adapters/
    bridge/      The Bridge interface + Chrome, Fake (tests) and Preview implementations
    extension/   background.ts and the React side panel (ui kit, views, controller)
    preview/     The dev harness entry
public/          manifest.json, panel.html, preview.html, icons
fixtures/        demo-page.html, a deliberately imperfect page
tests/           Vitest suites
docs/            ARCHITECTURE.md, DESIGN-LANGUAGE.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together and [docs/DESIGN-LANGUAGE.md](docs/DESIGN-LANGUAGE.md) for the visual rules the panel and report follow.

## Extending it

| To add… | Do this |
| --- | --- |
| A foundation or score | Add an `AreaKey` in `src/inference/types.ts`, a scorer to `AREAS` in `src/scoring/index.ts` and its weight in `AREA_WEIGHTS` (the weights must sum to 1; a test checks this). |
| An opportunity kind | Add it to `OpportunityKind` in `src/inference/types.ts` and emit it from a rule in `src/inference/opportunities.ts`. |
| A component kind | Add a definition to `COMPONENT_KINDS` in `src/inference/components.ts`. |
| A panel view | Add a file under `src/adapters/extension/panel/views`, a `ViewKey` in `navigation.ts` and a tab in `components/TabBar.tsx`. |
| A browser capability | Add it to the `Bridge` interface (`src/adapters/bridge/types.ts`) and implement it for Chrome, the Fake and the Preview. Views never call `chrome.*` directly. |
| An Inspect property | Add an entry to `INSPECTED_PROPERTIES` in `src/inspect/properties.ts`. |

## Limitations

- Each snapshot reflects **one viewport at one moment**. Hidden content, states that aren't showing, other breakpoints and anything past the **5,000-element** cap are not measured.
- Only the **top frame** is captured, not iframes. **Closed shadow roots** can't be read.
- Stylesheets that **need cookies or fail to fetch** stay unreadable and lower the confidence level. Fetched cross-origin sheets are limited to 40 per page and 4,000,000 characters each.
- Chrome blocks extensions on **browser, extension and Web Store pages**.
- Component recognition, scale inference and every score are **heuristics**.
- Inspect **ignores hover and focus rules** (the pointer is always on the element while picking), **approximates specificity**, doesn't model **cascade layers**, and its contrast is **approximate over background images**.
- Token suggestions match on **value**, then rank by **role** (a token already used for the same kind of property, with colours split into text, background and border). A suggestion marked "Value only" may be a token meant for a different job.
- Savings figures are **planning estimates** built on editable assumptions.
