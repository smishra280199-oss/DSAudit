# Architecture

## The flow of one audit

```
toolbar icon / Alt+Shift+S
   └─ background.js: sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        └─ panel.html (React 19)
             └─ AuditController.capture()            (inside the click: may request <all_urls>)
                  └─ ChromeBridge.capture(tab)
                       1. executeScript(files: capture.js)        installs window.__dslintCapture (versioned, idempotent)
                       2. executeScript(settle)                   waits for load, fonts, lazy content and a quiet DOM (capped)
                       3. executeScript(listUnreadableSheets)     cross-origin sheets the CSSOM won't expose
                       4. panel fetches ≤ 40 of them, credentials omitted, ≤ 4,000,000 chars each
                       5. executeScript(capture, [fetched])       → CapturedPage (JSON-compatible), incl. raw tech signals
                       6. executeScript(probeRuntime, MAIN world) framework globals and DOM expandos → technology.runtime
                  └─ runAudit(snapshot)   analyse → score → estimate savings   (pure functions)
                  └─ SnapshotStore.save   chrome.storage.local: index key + one key per snapshot
```

Nothing is injected in advance: the manifest declares no content scripts.

## Layers and dependency rules

| Layer | May depend on | Notes |
| --- | --- | --- |
| `shared/` | nothing | The `PageSnapshot` contract and pure helpers. Ships in both the page and the panel. |
| `capture/`, `inspect/` | `shared/` | Runs in the inspected page. Takes a `Document`, so the same code serves the extension, the preview iframe and jsdom tests. No `chrome.*` except `capture/entry.ts`. |
| `inference/`, `scoring/`, `savings/`, `audit/`, `insights/`, `report/` | `shared/` and each other, downwards | Pure and deterministic. Analyses are never stored; they are recomputed from the snapshot. |
| `storage/` | `shared/`, `savings/` | Talks to a `KeyValueStore`, never to `chrome.storage` directly. |
| `adapters/bridge/` | everything above | The only place browser APIs are used. |
| `adapters/extension/panel/` | everything above | `AuditController` owns state and calls the Bridge. Views read state through `useAuditState()` and call controller methods. |

## The snapshot

`PageSnapshot` (`src/shared/snapshot.ts`) has two layers.

**Rendered layer**: a depth-first walk from `<body>` (open shadow roots included, script/style/metadata and hidden elements skipped, capped at 5,000 elements). Per element: tag, curated attributes, classes, own visible text, a short selector for highlighting, its rect, and computed styles. Inherited properties (colour, font size, weight, family, line height) are recorded only where they differ from the parent; the rest only where they are not defaults. Root custom properties come from the root element's computed style.

Selectors are built by a `SelectorBuilder` shared across the walk (`capture/selector.ts`): the shortest `tag.class:nth-of-type()` path that matches only that element, with no depth cap (a selector matching several elements would highlight and photograph the wrong one). Uniqueness is decided structurally from cached sibling positions and a memo of shared ancestor depth, not by a `querySelectorAll` per candidate, which kept capture linear on large pages (about 4× faster at the 5,000-element cap). `visibility: hidden` elements aren't recorded but their children are walked, since a child can be visible.

**Settle** (`capture/settle.ts`): before reading, capture waits for `load` and web fonts, scrolls once through pages taller than 1.5 viewports (80 ms a step, at most 20 steps, then restores the scroll) so lazy sections and scroll-reveal animations render, then waits for 400 ms without DOM mutations (at most 2.5 s). The result is stored on `snapshot.settle`; a page that never went quiet lowers confidence.

**Technology signals** (`capture/tech-signals.ts`): generic raw facts with no framework knowledge: generator tags, script and link URLs (host + path), asset hosts, `<html>`/`<body>` attributes, an attribute-name census with hashed suffixes folded (`data-v-*`), class prefixes, app-root ids, custom element names and inline-script ids and globals. The isolated world can't see page globals, so the Chrome bridge also runs `capture/runtime-probe.ts` with `world: 'MAIN'` (a self-contained, read-only function) to read framework globals and DOM expandos such as `__reactFiber$…` and `__vue_app__`; element ids exposed as `window[id]` are ignored.

**Authored layer**: a CSS inventory from the CSSOM of every readable sheet: document sheets, adopted sheets, sheets in open shadow roots, fetched cross-origin sheets (parsed with `replaceSync`, `@import` removed) and inline `style` attributes. Per design-relevant declaration: value kind (token, literal or keyword), referenced tokens, selector, sheet, interaction states, media condition and whether it matches, and how many elements the rule matches. Plus custom-property definitions and the scopes that redefine them (theming), hover and focus coverage of interactive elements, how focus is drawn, outlines removed without a replacement, and class-naming conventions.

## Inference

`analyse(snapshot)` (`src/inference/index.ts`) builds an `ElementView` per element (inherited styles resolved, subtree facts bubbled up), then the **structure pass** (`inference/structure.ts`) annotates each view in one top-down pass:

- `role`: control, navigation, form, media, text, container, decorative or structural.
- `excluded`: not the product's own interface (third-party widget roots by id or class, visually hidden, off-screen, zero-size). Inherited for widgets and off-screen drawers. Excluded views are left out of foundations and components.
- `merged`: a repeat (aria-hidden clones, a control nested in a same-size control, a control's inner skin). Left out of components; a control with a skin takes the skin's look.
- `control`, `ariaHidden`, `exempt`: nearest control ancestor and inherited flags, so later checks don't walk ancestors per element.

Size and position rules apply only when the snapshot has geometry (jsdom reports 0×0). `summariseStructure` produces the counts shown under "About this capture". Then it runs:

- **Foundations**: colour (role groups and ΔE clustering), typography (modular-scale fit), spacing (base-unit fit), shape, elevation and motion.
- **Components**: recognition by tag, role and shape, then variants by signature properties, and near-duplicate variants (up to three barely visible differences).
- **Tokens**: coverage by category, theme scopes, unused tokens, and role-aware swap suggestions.
- **Accessibility**: contrast against the composited backdrop, and unnamed buttons and links.
- **Confidence**: everything the capture could not see.
- **Opportunities**: one rule per concern, ranked by severity, each with rough effort hours.
- **Technology** (`inference/technology.ts`): a rule table of clues over the raw signals, each definitive, strong or supporting. Confirmed = one definitive or two strong; probable = one strong or two supporting; possible = one supporting (listed apart, never as detected). Implied technologies are added (Next.js → React, Elementor → WordPress); React on Framer or Wix is marked as the platform's own runtime. The primary result is the most specific category found (builder › e-commerce › CMS › generator › meta-framework › UI framework); libraries, CSS frameworks and page builders never become primary, and a store plugin yields to its CMS. With nothing reliable, the result is "Unknown / custom implementation suspected" at low confidence with a reason.

Component recognition skips excluded and merged views, requires an `<a>` to be a real control (href, role or tabindex) before it can be a button, counts a roleless clickable div shaped like a button as a button, treats a link around a heading or image as a card, and folds card wrappers (an inner box within 24 px of its card) and full-width bands holding two or more cards.

## Evidence screenshots

After the DOM capture, `insights/evidence-plan.ts` picks the elements the report will cite (one per component style and text size, near-copy colours, contrast candidates and accessibility failures) in page order. `adapters/bridge/evidence.ts` drives `capture/shots.ts` frame by frame: the page scrolls a target to the middle, hides fixed and sticky layers that don't contain it, and reports every requested element that is fully visible and uncovered; the panel screenshots the tab (`captureVisibleTab`, at most about two a second) and crops each one. Plain text is cropped to its text box, boxed elements to their border box. For text, the most common non-text colour inside the box is stored as `backdrop`, and `analyseAccessibility` uses it instead of the DOM's guess. Crops live on `snapshot.evidence`, keyed by selector (page-scoped after a merge).

## Multi-page audits

Each page is captured and saved as its own snapshot. The Pages view keeps an ordered list of them (`collection:pages` in storage). **Audit N pages** loads them and calls `mergeSnapshots()` (`src/audit/merge.ts`), which produces one ordinary `PageSnapshot`:

- **Elements:** concatenated, with page-scoped selectors (`"1::.btn"`, see `shared/page-scope.ts`).
- **Shared CSS:** de-duplicated.
- **Interaction counts:** summed.
- **Pages list:** kept on `snapshot.pages`.
- **Technology signals:** unioned (counts summed), so a framework loaded on only some pages is still found.

The Pages view keeps the selection in React state and prunes it against the live list (`panel/selection.ts`), so pages removed elsewhere never stay selected. `removeManyFromCollection` removes any number of pages in one storage write; `moveInCollection` reorders. Removing pages from the audit never deletes their snapshots.

Inference, scoring and reports then run unchanged. Findings use the page scope to say *where* something was seen, and the controller filters highlight selectors to the page that is open.

## From findings to a client report

```
analysis ─▶ savings          one line per style family (in use, needed, excess, yearly cost) + re-theme cost
audit    ─▶ insights/findings.ts   pain points: their own elements, colours and pages as evidence
         ─▶ insights/index.ts      personal intro, hook, headline numbers, stock-take, glossary
         ─▶ report/pdf | html | markdown   three renderers of the same ExecutiveSummary
```

`business/index.ts` builds the business case on top of the same audit: avoidable hours so far by cause (extra variants, hand-built copies, one-off style decisions, missing focus states), the yearly cost (the report's inconsistency figure plus slower new screens), the one-time fix from effort sizes, break-even, the cost of a typical change, and opportunities ranked by impact then effort with quick wins flagged. The Report tab, the executive one-pager, the detailed Markdown and page 1 of the PDF all read it. `business/outreach.ts` is for the sender only: lead fit, the angle to lead with, message drafts and a ready-to-send checklist.

The report deliberately contains only the client's problems and what they cost: no cleanup estimates, no prices. Every money figure traces back to a stock-take line. The wording lives in `insights/` next to the data it describes. `insights/describe.ts` turns elements into things a reader recognises: "the “Upgrade plan” button on /pricing", "a purple". The PDF uses only patterns from the reference boards: title and subtitle headings, white hairline cards, grey table header bands, grey chips, and status shown as a coloured dot.

## Testing

- Pure modules are tested with hand-built snapshots (`tests/helpers.ts`).
- `tests/capture.test.ts` runs the real capture code on `fixtures/demo-page.html` under jsdom; `tests/capture-engine.test.ts` covers visibility, selector uniqueness on repetitive pages, shadow roots and settle.
- `tests/structure.test.ts` covers element selection (what's counted, excluded and merged); `tests/technology.test.ts` runs detection against `fixtures/tech/` and edge cases; `tests/bulk-pages.test.ts` covers bulk selection and removal.
- `tests/storage-controller.test.ts` drives the `AuditController` through the `FakeBridge`: the permission prompt on first capture only, tab switching, dismissals and inspect picks.
- The preview harness (`npm run preview`) runs the real panel and capture code in a browser without installing the extension.
