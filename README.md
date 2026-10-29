# System Audit (dslint)

A Chrome Manifest V3 side-panel extension that answers one question about any web product, without its source code or design-system docs: **how consistently and systematically is this interface built, and what would it take to improve it?**

It observes what a page renders and how its CSS is written, infers the design system behind it, scores it, and lists concrete, prioritised fixes with a planning estimate of what they are worth.

It is built for outreach. Capture a prospect's product (one page or several) and send them a **white-labelled PDF report** written for someone who has never seen a design audit. It speaks plainly, uses their own buttons, colours and pages as examples, and shows what inconsistency is costing their team. It ends with a short, low-key note on how you can help. The report never quotes a price for your services.

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

## Updating

You never need to remove and reinstall the extension:

- **On your own Chrome:** every push to GitHub builds the extension onto the `extension` branch. Pull it with GitHub Desktop and click reload in `chrome://extensions`.
- **On the Chrome Web Store:** run `npm version patch && git push --follow-tags`. The new version is uploaded to your existing listing as an update.

The one-time setup for both is in [docs/RELEASING.md](docs/RELEASING.md).

## Using it

1. **Capture page** (or press `C` in the panel). The first time, Chrome asks for optional access to all sites. Without it, only the tab you opened the panel on can be read and cross-origin stylesheets are skipped.
2. **Several pages?** Open **Pages** (key `6`) and press **Add this page** on each page as you click through the site. Then press **Audit N pages**. Findings that only show up across pages, such as a brand colour in four shades or headings built differently on two pages, are then caught. Findings say which page they were seen on, and highlighting works on whichever of those pages is open.
3. **Overview**: what the client will read. It shows the headline cost, four key numbers, "something they may not know", the findings in report order and the stock-take. Use a finding's menu to leave it out of the report.
4. **Foundations**, **Components**, **Opportunities** and **Inspect**: the detailed evidence for you. Select any value to highlight it on the page.

**Client report.** Set your agency, name, contact details and an optional personal note once under `⋯` → *Report details…*. The client name comes from the page and can be changed per site. Then press **Download PDF report**. The report contains:

- **Page 1, the whole picture at a glance:**
  - a short personal note and the headline cost;
  - four key numbers: yearly cost, could be saved, hours lost, consistency score;
  - two charts: *where the cost comes from* and *health by area*;
  - "Something you may not know".
- **Part 1, the problems.** A problem map grouped into tokens and styles, components and elements, with the number of problems, places affected and cost for each group. Then a summary table (problem, what it affects, places, cost a year, priority) and one compact card per problem: three headline numbers, the evidence (swatches, sizes, contrast samples, look-alike components) and where it was seen.
- **Part 2, the fixes.** One row per problem with the fix and what it realistically saves a year, an *after the cleanup* chart (styles today versus after) and the redesign hours with and without tokens.
- **Part 3, what's working well.** The areas and building blocks that are already consistent.
- **Appendix:** pages reviewed, how we worked it out, a glossary, and a short *How we can help* note with your contact details.

The same content is available as a web report (HTML) or a Markdown summary for emails. Tune the cost model under *Savings assumptions…*.

## Repository layout

```
src/
  shared/        Snapshot contract + pure helpers (colour, CSS values, class naming, contrast)
  capture/       Runs in the page: rendered layer, authored layer, overlays, Inspect mode
  inspect/       Cascade resolution for one picked element
  inference/     Snapshot → analysis: foundations, components, tokens, a11y, opportunities
  scoring/       Area scores, AREA_WEIGHTS, grade
  savings/       Planning estimate: line items per redundant style, re-theme cost, cleanup
  insights/      The client story: pain points with real examples (findings.ts), plain-language
                 descriptions (describe.ts), stock-take and glossary (index.ts, narrative.ts)
  audit/         Bundles snapshot + analysis + score + savings; merges pages; compares audits
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

- Each capture reflects **one viewport at one moment**; add several pages for a fuller picture. Hidden content, states that aren't showing, other breakpoints and anything past the **5,000-element** cap are not measured.
- Only the **top frame** is captured, not iframes. **Closed shadow roots** can't be read.
- Stylesheets that **need cookies or fail to fetch** stay unreadable and lower the confidence level. Fetched cross-origin sheets are limited to 40 per page and 4,000,000 characters each.
- Chrome blocks extensions on **browser, extension and Web Store pages**.
- Component recognition, scale inference and every score are **heuristics**.
- Inspect **ignores hover and focus rules** (the pointer is always on the element while picking), **approximates specificity**, doesn't model **cascade layers**, and its contrast is **approximate over background images**.
- Token suggestions match on **value**, then rank by **role** (a token already used for the same kind of property, with colours split into text, background and border). A suggestion marked "Value only" may be a token meant for a different job.
- Savings figures are **planning estimates** built on editable assumptions.
