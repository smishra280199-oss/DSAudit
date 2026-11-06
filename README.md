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

1. **Capture page** (or press `C` in the panel). After reading the page, System Audit scrolls through it and **photographs every element the report cites**: one example of each component style, each text size, near-copy colours and every accessibility failure. Sticky headers and cookie banners are hidden for each shot and the page is put back as it was. Text contrast is then re-checked against the real pixels behind the letters, so text on photos or dark panels isn't misreported. A page takes about 10–30 seconds.
   **Capture site** (`⋯` menu) does this for up to six pages in one go: it finds the site's main pages in its navigation (one per page type, so two product pages count once), lets you tick or add pages, visits each in this tab, then audits them together and returns to where you started. The first time, Chrome asks for optional access to all sites. Without it, only the tab you opened the panel on can be read and cross-origin stylesheets are skipped.
2. **Several pages?** Open **Pages** (key `7`) and press **Add this page** on each page as you click through the site. Then press **Audit N pages**. Findings that only show up across pages, such as a brand colour in four shades or headings built differently on two pages, are then caught. Findings say which page they were seen on, and highlighting works on whichever of those pages is open.
3. **Overview**: what the client will read. It shows the headline cost, four key numbers, "something they may not know", the findings in report order and the stock-take. Use a finding's menu to leave it out of the report.
4. **Opportunities** (key `4`): every change ordered by impact, with area chips, an impact filter and an impact/effort matrix where quick wins (high or medium impact, small effort) are outlined. Open one for why it matters, an at-a-glance grid (type of change, impact, effort, affected, confidence, based on), the proposed change and where it happens. **Copy as task** puts it on the clipboard as Markdown for a ticket or an AI agent.
5. **Report** (key `5`): the business case, in three versions:
   - **Executive summary**: what a design system would have saved so far (hours, team-time equivalent, likely range and confidence), yearly cost, one-time fix and break-even, simplify and reuse, where the time went, return on closing the gaps, the cost of a typical change, what we found and the recommended next steps. Copy it, or download a printable one-pager (HTML) or Markdown.
   - **Detailed report**: every opportunity as a task with its evidence and the audit's limits. Copy it, or download Markdown or the raw JSON.
   - **Outreach** (only you see this): a lead-fit score with reasons and the angle most likely to land, a ready-to-send checklist, and first drafts (subject lines, email, LinkedIn message, follow-up) for a founder, design lead or engineering lead, built from their own product. Drafts never quote a price or an hour figure for the fixes.
   - **Your team's numbers**: cost per hour, currency, screens in the product, new screens a year, hours per new screen, design-system speed-up, visual changes a year, and effort per item. Every change recalculates the page and is saved.
6. **Components** opens with **Side by side**: every style of each kind of element (buttons, inputs, badges, links, headings) redrawn from the page in a grid, numbered, with near-copies ("Copy of #1") and one-offs marked. Select a tile to find it on the page.
7. **Foundations** opens with **Your design system, extracted**: the product's own colours, text sizes, weights, fonts, spacing, corners and shadows turned into a starter set of tokens, with near-copies merged and stray values mapped to the nearest step. Download it as CSS variables or design-token JSON (W3C format, readable by Tokens Studio and Style Dictionary).
8. **Overview** includes an **Accessibility check**: six automated WCAG checks (text contrast 1.4.3, visible focus 2.4.7, named controls 4.1.2, form labels 1.3.1, alt text 1.1.1 and tap-target size 2.5.8 from WCAG 2.2), each with pass/fail, who it affects and a link to the offending elements. It names what still needs a manual review, so it never reads as a certificate.
9. **Inspect**: the detailed evidence for any element. Select any value to highlight it on the page.

**Client report.** Set your agency, name, contact details and an optional personal note once under `⋯` → *Report details…*. The client name comes from the page and can be changed per site. Then press **Download PDF report**. The report is a design-system health check in five short parts, organised the way a design system is built:

1. **Summary.** Overall health and the three layer scores (Foundations, Components, Accessibility), the estimated yearly cost, and the three things to fix first, each with screenshots of the real elements.
2. **Foundations** (the token layer). The real palette with near-copies marked and where each copy is used; every text size shown as a screenshot of real text at that size; a spacing ruler with off-grid values in red; corner styles; and how much of each foundation goes through tokens. Tokens are not a separate area: they are how well each foundation is managed.
3. **Components.** Every style of every button, input, link, heading, badge and card, photographed from the site and numbered, with near-copies and one-offs marked.
4. **Accessibility.** The WCAG checks, pass or fail, with the failing elements photographed and annotated (e.g. "1.5:1, needs 4.5").
5. **Next steps.** The design system extracted from their product, what we'd do first, how you can help, and how the numbers were worked out.

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
  business/      The business case (avoidable hours, yearly cost, break-even, ranked
                 opportunities, quick wins) and outreach (lead fit, message drafts)
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
- Savings figures are **planning estimates** built on editable assumptions. Business-case figures carry a likely range that widens as capture confidence drops; per-instance work is scaled from the pages captured to the screens in the product.
