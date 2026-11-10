# Zeronix Tech: brand system

The rules every page of zeronixtech.com follows. The layout comes from the owner's references (Finovate, Kollab, a fintech bento); the colours are the Zeronix OS navy and mint. The live version is the style-guide page, **`/brand`** on the site, which is not indexed and not linked. Change a token here and in `src/app/globals.css` together.

## 1. Positioning and voice

- **Who we are:** the UAE partner that matches business IT to the work a team does. We are not a box shifter.
- **Promise:** *Business IT, matched to your industry.* That means UAE stock, local warranty and corporate pricing.
- **Voice:** plain, confident and specific.
  - Name the model, the spec and the industry.
  - Short sentences.
  - No hype words ("revolutionary", "cutting-edge", "seamless").
  - No exclamation marks.
- **Tone by place:**
  - Hero: one strong line.
  - Cards: one sentence.
  - Guides: expert and helpful.
  - CTAs: verb first ("Get B2B pricing", "See the setups").

## 2. Colour

**Deep navy + mint** (chosen by the owner on 2026-11-10, replacing the first navy/mint look): the same colours as the Zeronix OS app icon. Navy carries trust and the B2B tone; mint is the one action colour. Components use **role** tokens, never colour names, so a future change is only the `--zx-*` values at the top of `src/app/globals.css`.

| Role token | Hex | Use |
| --- | --- | --- |
| `brand-950` | `#081A31` | Deepest: footer, top bar, text on mint |
| `brand-900` | `#0F2747` | Dark bands, dark cards, primary dark buttons |
| `brand-800` | `#18375F` | Cards on a dark band, hover on dark |
| `brand-700` | `#1D4F8A` | Links, icons and heading emphasis on light (7.8:1 on canvas) |
| `cta` | `#2BD9A0` | **Primary CTA** fill, active tab, cart buttons, small accents |
| `cta-strong` | `#1FC48D` | CTA hover |
| `highlight` | `#5EEBC0` | Highlights on dark: numbers, icons, one emphasised word |
| `surface` | `#E9EFF6` | Light feature cards, product image wells |
| `surface-soft` | `#F2F5F9` | Alternate section background |
| `canvas` | `#F7F8FA` | Page background |
| `white` | `#FFFFFF` | Cards on canvas |
| `ink` | `#0E1A2B` | Body text (16.5:1 on canvas) |
| `muted-ink` | `#5A6577` | Secondary text (5.5:1 on canvas) |
| `line` | `#DDE3EC` | Borders, dividers |

**Ratio.** Roughly 60% canvas and white, 25% navy, 10% surface and 5% mint. Mint is a fill with brand-950 text on it (9.6:1), or text on navy (8.2:1); never text on a light background.

**Not used:** purple, bright "electric" blues, gradients on text, glow blobs, grid backgrounds, neon shadows.

**One look.** There is no dark-mode switch. The brand already alternates light canvas with deep navy bands.

## 3. Typography

| Role | Font | Size (desktop / mobile) | Weight / tracking |
| --- | --- | --- | --- |
| Display (hero) | Manrope | 64 / 40 px, line height 1.05 | 500, -0.035em |
| H2 (section) | Manrope | 46 / 32 px, line height 1.1 | 500, -0.025em |
| H3 (card) | Manrope | 20 / 18 px, line height 1.3 | 600, -0.01em |
| Lead | Figtree | 19 / 17 px, line height 1.6 | 400 |
| Body | Figtree | 16 px, line height 1.65 | 400 |
| Tag / eyebrow | Figtree | 11 px, uppercase | 600, +0.12em |
| Numbers (stats, prices) | Manrope | 40–56 px, tabular | 500 |

- Headings are **medium weight, not bold**. That calm, confident look is what makes the references feel premium.
- Emphasis inside a heading is a word in `brand-700` (or mint on dark), never a gradient.
- A section heading can end with a thin 64 px rule (1 px, `line` colour), as in Finovate.

## 4. Layout

- **Container:** 1240 px wide, with 24 px gutters (16 px on phones) and a 12-column grid.
- **Vertical rhythm:** sections are 112 px apart on desktop and 72 px on phones; inside a section, gaps are 48 / 32 / 16 px.
- **Framed sections:** the hero and the dark bands are rounded containers, `radius-frame`, inset 12–16 px from the screen edge, not full-bleed. This is the clearest signature taken from Finovate.
- **Section order alternates:** canvas, then surface or white cards, then a navy band, then canvas. Never two dark bands in a row.
- **Phones:** cards go to 2 columns for short items and 1 column for photo cards, and no page scrolls sideways.

## 5. Shape, depth, motion

- **Radius:**
  - `frame` 32 px (hero, dark bands);
  - `card` 24 px;
  - `inner` 16 px (images inside cards);
  - `control` full pill (buttons, tags, inputs).
- **Depth:** flat. Cards are white on canvas, with a 1 px `line` border or none. The only shadow is a soft `0 12px 32px -16px brand-950 at 25%` on hover.
- **Motion:**
  - 200 ms ease-out hovers;
  - the card arrow turns 45° on hover;
  - sections fade up 16 px as they scroll in (CSS only; off for reduced motion);
  - nothing loops or bounces.

## 6. Components

**Buttons (all pills, 44 px tall)**
- **Primary:** mint fill with brand-950 text, then a 32 px brand-950 circle holding a mint arrow, like Finovate's "Free Consultation" button. Use it for "Get B2B pricing".
- **Dark:** brand-900 fill with white text and a mint arrow circle.
- **Outline:** a 1 px `line` border with ink text; on a dark band, a white/20 border with white text.
- **Arrow button:** a 40 px circle with a border and a ↗ arrow that turns to → on hover. It sits in the top-right corner of clickable cards.

**Tag (eyebrow).** A small outlined pill ("WHO WE ARE", "INDUSTRY", "GUIDE"), placed above headings and inside cards.

**Cards**
1. **Photo card:** a 24 px card with a tall photo (4:5) in a 16 px inner frame, then a title row with an arrow button. Used for industries, guides and team pictures.
2. **Feature card (light):** white or surface, with a tag top-left and an arrow top-right, a title, and a photo or UI chip at the bottom.
3. **Accent card:** a mint fill with navy text and a photo. It is the single highlight in a group of cards, used once per section.
4. **Dark card:** brand-800 on a brand-900 band, with a mint icon in a circle, a white title and white/70 text.
5. **Stat:** a big Manrope number with a mint or mint "+", "h" or "%" after it, and a muted label underneath. Stats sit in a row with hairline dividers.
6. **Product card** (now, and later in the shop):
   - a white card with a surface-soft image well;
   - a brand tag, the model name and three spec chips;
   - a "Get B2B price" pill and an "Add to quote list" icon button. Prices replace the pill once the shop is live.
7. **UI chip:** a small white rounded card floating over a photo ("UAE stock · 3-year warranty", "+12 laptops quoted"), as in the fintech references.

**Icons.** lucide at a 1.75 stroke. On light they sit in a 40 px mint circle in brand-950; on dark they are mint inside a brand-800 circle.

## 7. Imagery

- **Subject:** real people at work in UAE offices, using laptops and workstations. For example:
  - an agent with a client;
  - an architect at a dual-monitor workstation;
  - a clinic reception;
  - a server room.
- **Light and setting:** warm, natural light, in wood, glass and plant-filled interiors (Finovate).
- **Product shots:** clean, on a surface background, in three-quarter view.
- **Avoid:** handshakes over globes, glowing circuit boards and futuristic blue holograms.
- **AI-generated pictures** (`scripts/site-images.ts`) may stand in until real photography exists, with these checks:
  - Before publishing, look at each one for hands, faces, garbled text and logos on devices, and generate it again if anything looks off.
  - Replace the hero and the people shots with real photos of the team and customers when you can.
- **Frames:** always rounded (16–32 px), never a hard rectangle edge-to-edge.
- **Until real photos are in:** a **photo slot** shows a surface panel with an image icon, the subject in words and the ratio, so the owner knows exactly what to shoot or upload. Slots are listed in section 9.

## 8. Logo

- **Mark:** a brand-900 rounded square with a geometric mint "Z" (two bars joined by a diagonal, cut square).
- **Wordmark:** "zeronix" in Manrope 700, lowercase, followed by "tech" in Manrope 500. On light it is brand-950 with brand-700; on dark it is white with mint.
- **Clear space:** the height of the "z" on every side. The mark alone is used for the favicon and app icon.
- The current mark is a working version until a designer finalises it.

## 9. Photo slots on the home page

| Slot | Ratio | Subject |
| --- | --- | --- |
| Hero | 16:9, landscape | A UAE office team around a table with business laptops, warm light, people on the right half |
| Feature: real estate | 4:5 | An agent with a light laptop showing a property to a client |
| Feature: design | 4:5 | An architect at a workstation with two colour-accurate monitors |
| Industry tiles | 4:3 | One per industry: the real setting (clinic desk, trading floor, classroom, hotel reception …) |
| Categories | 1:1 | Product shots on surface: a laptop, a desktop, a tower workstation, a rack server |
| Closing band | 3:2 | A delivery or setup moment: boxes of laptops being unpacked for a team |

## 10. Accessibility

- Text contrast is at least 4.5:1, and 3:1 for large text and UI borders.
- Lime is a background, never a text colour.
- Every interactive element has a visible focus ring (2 px brand-700, or mint on dark).
- Touch targets are at least 44 px.
- Decorative images have empty alt text; photo slots carry their subject as alt text.
