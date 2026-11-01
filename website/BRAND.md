# Zeronix Tech: brand system

The rules every page of zeronixtech.com follows. They are built from the owner's references: Finovate (forest-green consulting site), Kollab (mint and deep-green fintech brand) and a green fintech bento. The live version is the style-guide page, **`/brand`** on the site, which is not indexed and not linked. Change a token here and in `src/app/globals.css` together.

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

One family of greens on warm paper. Lime is the action colour; mint is the highlight on dark green.

| Token | Hex | Use |
| --- | --- | --- |
| `forest-950` | `#03201A` | Deepest: footer, text on lime |
| `forest-900` | `#06352B` | Dark bands, dark cards, primary dark buttons |
| `forest-800` | `#0B4A3B` | Cards on a dark band, hover on dark |
| `forest-700` | `#12614C` | Links and icons on light |
| `lime-400` | `#B9F23F` | **Primary CTA** fill, active tab, small accents |
| `lime-500` | `#A4DC27` | CTA hover |
| `mint-300` | `#4FF0B4` | Highlights on dark: numbers, icons, underline |
| `sage-100` | `#E6F1E0` | Light feature cards, image backdrops |
| `sage-50` | `#F0F5EC` | Alternate section background |
| `paper` | `#F6F6F1` | Page background |
| `white` | `#FFFFFF` | Cards on paper |
| `ink` | `#0C1F1A` | Body text |
| `muted` | `#5A6B65` | Secondary text (5.3:1 on paper) |
| `line` | `#DCE3DB` | Borders, dividers |

**Ratio.** Roughly 60% paper and white, 25% forest, 10% sage and 5% lime/mint. Lime is never used for text on a light background, because the contrast is too low. It is a fill with forest-950 text on it.

**Not used:** blue, purple, gradients on text, glow blobs, grid backgrounds, neon shadows.

**One look.** There is no dark-mode switch. The brand already alternates light paper with deep-green bands, and a second theme would double what has to look premium.

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
- Emphasis inside a heading is a word in `forest-700` (or mint on dark), never a gradient.
- A section heading can end with a thin 64 px rule (1 px, `line` colour), as in Finovate.

## 4. Layout

- **Container:** 1240 px wide, with 24 px gutters (16 px on phones) and a 12-column grid.
- **Vertical rhythm:** sections are 112 px apart on desktop and 72 px on phones; inside a section, gaps are 48 / 32 / 16 px.
- **Framed sections:** the hero and the dark bands are rounded containers, `radius-frame`, inset 12–16 px from the screen edge, not full-bleed. This is the clearest signature taken from Finovate.
- **Section order alternates:** paper, then sage or white cards, then a forest band, then paper. Never two dark bands in a row.
- **Phones:** cards go to 2 columns for short items and 1 column for photo cards, and no page scrolls sideways.

## 5. Shape, depth, motion

- **Radius:**
  - `frame` 32 px (hero, dark bands);
  - `card` 24 px;
  - `inner` 16 px (images inside cards);
  - `control` full pill (buttons, tags, inputs).
- **Depth:** flat. Cards are white on paper, with a 1 px `line` border or none. The only shadow is a soft `0 12px 32px -16px rgb(3 32 26 / .25)` on hover.
- **Motion:**
  - 200 ms ease-out hovers;
  - the card arrow turns 45° on hover;
  - sections fade up 16 px as they scroll in (CSS only; off for reduced motion);
  - nothing loops or bounces.

## 6. Components

**Buttons (all pills, 44 px tall)**
- **Primary:** lime fill with forest-950 text, then a 32 px forest-950 circle holding a lime arrow, like Finovate's "Free Consultation" button. Use it for "Get B2B pricing".
- **Dark:** forest-900 fill with white text and a lime arrow circle.
- **Outline:** a 1 px `line` border with ink text; on a dark band, a white/20 border with white text.
- **Arrow button:** a 40 px circle with a border and a ↗ arrow that turns to → on hover. It sits in the top-right corner of clickable cards.

**Tag (eyebrow).** A small outlined pill ("WHO WE ARE", "INDUSTRY", "GUIDE"), placed above headings and inside cards.

**Cards**
1. **Photo card:** a 24 px card with a tall photo (4:5) in a 16 px inner frame, then a title row with an arrow button. Used for industries, guides and team pictures.
2. **Feature card (light):** white or sage-100, with a tag top-left and an arrow top-right, a title, and a photo or UI chip at the bottom.
3. **Accent card:** a lime fill with forest text and a photo. It is the single highlight in a group of cards, used once per section.
4. **Dark card:** forest-800 on a forest-900 band, with a mint icon in a circle, a white title and white/70 text.
5. **Stat:** a big Manrope number with a lime or mint "+", "h" or "%" after it, and a muted label underneath. Stats sit in a row with hairline dividers.
6. **Product card** (now, and later in the shop):
   - a white card with a sage-50 image well;
   - a brand tag, the model name and three spec chips;
   - a "Get B2B price" pill and an "Add to quote list" icon button. Prices replace the pill once the shop is live.
7. **UI chip:** a small white rounded card floating over a photo ("UAE stock · 3-year warranty", "+12 laptops quoted"), as in the fintech references.

**Icons.** lucide at a 1.75 stroke. On light they sit in a 40 px lime circle in forest-950; on dark they are mint inside a forest-800 circle.

## 7. Imagery

- **Subject:** real people at work in UAE offices, using laptops and workstations. For example:
  - an agent with a client;
  - an architect at a dual-monitor workstation;
  - a clinic reception;
  - a server room.
- **Light and setting:** warm, natural light, in wood, glass and plant-filled interiors (Finovate).
- **Product shots:** clean, on a sage-100 background, in three-quarter view.
- **Avoid:** handshakes over globes, glowing circuit boards and futuristic blue holograms.
- **AI-generated pictures** (`scripts/site-images.ts`) may stand in until real photography exists, with these checks:
  - Before publishing, look at each one for hands, faces, garbled text and logos on devices, and generate it again if anything looks off.
  - Replace the hero and the people shots with real photos of the team and customers when you can.
- **Frames:** always rounded (16–32 px), never a hard rectangle edge-to-edge.
- **Until real photos are in:** a **photo slot** shows a sage panel with an image icon, the subject in words and the ratio, so the owner knows exactly what to shoot or upload. Slots are listed in section 9.

## 8. Logo

- **Mark:** a forest-900 rounded square with a geometric lime "Z" (two bars joined by a diagonal, cut square).
- **Wordmark:** "zeronix" in Manrope 700, lowercase, followed by "tech" in Manrope 500. On light it is forest-950 with forest-700; on dark it is white with mint.
- **Clear space:** the height of the "z" on every side. The mark alone is used for the favicon and app icon.
- The current mark is a working version until a designer finalises it.

## 9. Photo slots on the home page

| Slot | Ratio | Subject |
| --- | --- | --- |
| Hero | 16:9, landscape | A UAE office team around a table with business laptops, warm light, people on the right half |
| Feature: real estate | 4:5 | An agent with a light laptop showing a property to a client |
| Feature: design | 4:5 | An architect at a workstation with two colour-accurate monitors |
| Industry tiles | 4:3 | One per industry: the real setting (clinic desk, trading floor, classroom, hotel reception …) |
| Categories | 1:1 | Product shots on sage: a laptop, a desktop, a tower workstation, a rack server |
| Closing band | 3:2 | A delivery or setup moment: boxes of laptops being unpacked for a team |

## 10. Accessibility

- Text contrast is at least 4.5:1, and 3:1 for large text and UI borders.
- Lime is a background, never a text colour.
- Every interactive element has a visible focus ring (2 px forest-700, or mint on dark).
- Touch targets are at least 44 px.
- Decorative images have empty alt text; photo slots carry their subject as alt text.
