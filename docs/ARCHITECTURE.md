# Architecture

## The flow of one audit

```
toolbar icon / Alt+Shift+S
   └─ background.js: sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        └─ panel.html (React 19)
             └─ AuditController.capture()            (inside the click: may request <all_urls>)
                  └─ ChromeBridge.capture(tab)
                       1. executeScript(files: capture.js)        installs window.__dslintCapture (versioned, idempotent)
                       2. executeScript(listUnreadableSheets)     cross-origin sheets the CSSOM won't expose
                       3. panel fetches ≤ 40 of them, credentials omitted, ≤ 4,000,000 chars each
                       4. executeScript(capture, [fetched])       → CapturedPage (JSON-compatible)
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

**Authored layer**: a CSS inventory from the CSSOM of every readable sheet: document sheets, adopted sheets, sheets in open shadow roots, fetched cross-origin sheets (parsed with `replaceSync`, `@import` removed) and inline `style` attributes. Per design-relevant declaration: value kind (token, literal or keyword), referenced tokens, selector, sheet, interaction states, media condition and whether it matches, and how many elements the rule matches. Plus custom-property definitions and the scopes that redefine them (theming), hover and focus coverage of interactive elements, how focus is drawn, outlines removed without a replacement, and class-naming conventions.

## Inference

`analyse(snapshot)` (`src/inference/index.ts`) builds an `ElementView` per element (inherited styles resolved, subtree facts bubbled up) and runs:

- **Foundations**: colour (role groups and ΔE clustering), typography (modular-scale fit), spacing (base-unit fit), shape, elevation and motion.
- **Components**: recognition by tag, role and shape, then variants by signature properties, and near-duplicate variants (up to three barely visible differences).
- **Tokens**: coverage by category, theme scopes, unused tokens, and role-aware swap suggestions.
- **Accessibility**: contrast against the composited backdrop, and unnamed buttons and links.
- **Confidence**: everything the capture could not see.
- **Opportunities**: one rule per concern, ranked by severity, each with rough effort hours.

## Multi-page audits

Each page is captured and saved as its own snapshot. The Pages view keeps an ordered list of them (`collection:pages` in storage). **Audit N pages** loads them and calls `mergeSnapshots()` (`src/audit/merge.ts`), which produces one ordinary `PageSnapshot`:

- **Elements:** concatenated, with page-scoped selectors (`"1::.btn"`, see `shared/page-scope.ts`).
- **Shared CSS:** de-duplicated.
- **Interaction counts:** summed.
- **Pages list:** kept on `snapshot.pages`.

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
- `tests/capture.test.ts` runs the real capture code on `fixtures/demo-page.html` under jsdom.
- `tests/storage-controller.test.ts` drives the `AuditController` through the `FakeBridge`: the permission prompt on first capture only, tab switching, dismissals and inspect picks.
- The preview harness (`npm run preview`) runs the real panel and capture code in a browser without installing the extension.
