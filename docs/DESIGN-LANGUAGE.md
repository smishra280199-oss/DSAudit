# Design language

The panel and the exported report follow one visual language, taken from the reference boards. Every value lives in `src/adapters/extension/panel/styles/tokens.css`; components never use raw values.

## Principles

- **Quiet surfaces, one loud accent.** A neutral grey canvas, white cards and hairline borders. Glossy magenta is reserved for the primary action, the selected state and counts.
- **Compact and legible.** 13px body, 12px secondary and 11px labels. Titles are semibold, never bold.
- **Pills and soft corners.** Buttons, segmented controls and search fields are pills. Cards use a 12px radius, menus 12px, rows and items 8px.
- **Tactile where you touch.** Toggles and slider thumbs are skeuomorphic, with a glossy knob in an inset track that turns green when on. Tooltips are dark and glossy, with keycaps for shortcuts.
- **Status is a dot, not a fill.** Like the reference's "● Production", status shows as a small coloured dot beside a grey chip or label. Chips, numbers and cards stay neutral. There are no tinted pills, no coloured headline numbers, no one-sided accent strokes and no uppercase eyebrow labels.
- **Lists lift on hover.** Rows are separated by hairlines. A hovered row becomes a raised white card and reveals its `⋯` menu. A selected row gets a magenta bar on its left edge.

## Tokens (light / dark)

| Token | Light | Dark |
| --- | --- | --- |
| `--canvas` | `#f6f6f6` | `#0e0e0e` |
| `--surface` | `#ffffff` | `#191919` |
| `--surface-sunken` | `#f1f1f1` | `#121212` |
| `--border` | `#ebebeb` | `#262626` |
| `--text` / `--text-secondary` / `--text-tertiary` | `#171717` / `#6b6b6b` / `#a3a3a3` | `#ededed` / `#a1a1a1` / `#6e6e6e` |
| `--accent-top` → `--accent-bottom` | `#ff52f6` → `#df00d4` | same |
| `--danger` / `--warning` / `--success` | `#e5484d` / `#e29a12` / `#2fb344` | same, with translucent soft fills |

Spacing uses a 4px base (`--space-1` … `--space-8`). Radius steps are 4, 6, 8, 12, 16 and full. Shadows come in four steps: `--shadow-card` (hairline ring), `--shadow-raised` (lifted rows, selected segments), `--shadow-popover` (menus, dialogs) and `--shadow-accent` (the glossy primary button).

## Components (`src/adapters/extension/panel/ui`)

| Component | Reference pattern |
| --- | --- |
| `Button` primary / secondary / ghost / danger | Magenta "Create agent", "Save", "Cancel" |
| `IconButton` | Grey circular hover state behind the paperclip and `⋯` |
| `Segmented` | "All \| Mine" |
| `Search` | Pill search field with a leading icon |
| `Row` + `List` | Agent and thread lists, with lifted hover and a selected bar |
| `Menu` | "Thread actions", with a red "Delete" |
| `Tooltip` + `Kbd` | "Upload images or files ⌘ ⇧ U" |
| `Toggle` | Tactile Off / On switches |
| `Slider` | Stepped "Compute units" slider |
| `Dialog` | "Settings" dialog with sections and a Cancel / Save footer |
| `Badge` | "App" chip and status pills |
| `Avatar` | Round leading visual (the site's favicon) |

## Layout

The side panel uses the reference's narrow (mobile) layout: a sticky header (view title over the page host, primary action, `⋯` menu), a scrolling stack of cards, and a bottom icon tab bar whose active item sits in a sunken rounded square. The panel follows the browser's light or dark scheme, and so does the exported report.
