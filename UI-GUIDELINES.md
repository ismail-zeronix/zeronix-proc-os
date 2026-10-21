# UI guidelines

How screens in the Zeronix portal are built. They come from the owner's review of the Sales app (October 2026) and apply to **every** app. Procurement, Tasks, Knowledge, Mail and Admin still need to be brought in line (see `TASKS.md`, "UI pass").

## 1. Use the space for the work

- **No big page headers.** No 3-line title + description + chip row + search box above the content. One compact toolbar row (about 36 px) holds the view toggle, a scope toggle, tabs and a short summary. The page title lives in the sidebar and the browser tab.
- **List first, board second.** A list is the default view. Switch views with an **icon toggle** (list icon, kanban icon), never with text buttons.
- **Prefer tabs, icon buttons, toggles and popovers to stacked cards.** If a page has more than two cards in a column, put them behind tabs. Secondary forms go into a tab, a dialog or a popover.
- **Add with "+", not with a big button.** A "+" icon on the column header or toolbar opens a dialog; the dialog is the same compact form as the full page. The global search is Ctrl K, so list pages do not carry their own search box unless the list is long.
- **Dense rows.** Tables use `py-1.5` rows with the title and a muted second line in one cell. On phones a table becomes a list of small cards (never sideways scrolling).
- **Content scrolls inside its panel** (a board column, a timeline), so the page does not grow past the screen.

## 2. Shell

- **Sidebar starts collapsed** to icons; the existing trigger expands it and the choice is remembered (`sidebar_state` cookie).
- **No "All apps" row** in the sidebar: the header Apps switcher does that.
- **First sidebar item is an Overview dashboard** for the app.

## 3. People

- **Always show people as avatars** (`components/user-avatar.tsx`, initials avatars by DiceBear with a palette that keeps white text readable). More than one person is shown as an **overlapping stack**, main owner on top, `+N` after three. The tooltip lists everybody.
- **Assigning is a popover on the avatars** (`assign-popover.tsx`) that saves on click. Forms use the avatar picker (`avatar-picker.tsx`). A person can only be assigned to something they are allowed to open.

## 4. Charts and numbers

- **Recharts** for charts (`components/charts/`), following the `dataviz` skill: one axis, thin marks, hairline solid grid, legend for two or more series, selective labels, tooltip lists every series, `--series-N` colour tokens (light and dark), a chart / table switch on every chart.
- **KPI tiles** (`components/kpi-tile.tsx`): label, number, change against the previous period (arrow, sign and percentage, never colour alone), optional trend line. One hero number per view.
- Single-measure bars use one colour. Do not colour bars by value.

## 5. Checks before shipping a screen

1. Does it fit a laptop screen without scrolling the page?
2. Is any text bigger or heavier than it needs to be? Is any card only there to hold a heading?
3. Phone width (390 px): no sideways scroll, one pane at a time.
4. Dark mode.
5. Keyboard and screen reader: icon buttons have `aria-label` and `title`; the state of toggles is exposed.
6. Look at it. Headless Edge with `puppeteer-core` can screenshot every page (install with `npm install --no-save puppeteer-core`).
