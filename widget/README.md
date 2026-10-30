# Zeronix website chat widget

The chat button for **www.zeronix.ae**. Visitors fill in a short lead form and chat live with the sales team; chats arrive in the portal (chat widget → **Website** tab), which rings until someone accepts.

| File | What it is |
| --- | --- |
| `zeronix-chat.js` | The whole widget: one plain JavaScript file, no libraries. It draws inside a Shadow DOM, so the website's CSS cannot affect it (or the reverse). |
| `demo.html` | A stand-in for the website, for testing: `http://localhost:3100/widget/demo.html` |

The portal serves both files from this folder (`src/app/widget/[file]/route.ts`), so a change here goes live with the next portal deploy.

## Add it to the website

Paste one line into the `<head>` of every page (in WordPress: a header/footer scripts plugin, or the theme's `header.php`):

```html
<script src="https://PORTAL-DOMAIN/widget/zeronix-chat.js" defer></script>
```

Replace `PORTAL-DOMAIN` with the portal's public address. The widget works out the portal address from this `src`.

It uses the zeronix.ae theme (teal `#019297`, dark `#042A2D`, green `#4CAF50`, cream `#F2F1ED`, Raleway). Optional settings on the same tag:

```html
<script
  src="https://PORTAL-DOMAIN/widget/zeronix-chat.js"
  data-color="#019297"
  data-dark="#042A2D"
  data-title="Zeronix Sales"
  data-greeting="Hi there 👋 Welcome to Zeronix. Ask us anything."
  data-quick="I need a quote|Is this in stock?|Talk to a sales person"
  data-popup-delay="20"
  data-popup-scroll="60"
  data-position="right"
  defer
></script>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-color` | `#019297` | Buttons and the visitor's bubbles |
| `data-dark` | `#042A2D` | Header |
| `data-title` | `Zeronix Sales` | Header title |
| `data-greeting` | (a welcome line) | The first message the visitor sees |
| `data-quick` | three quick replies | Buttons under the greeting, separated by `|` |
| `data-popup-delay` | `20` | Seconds on the site before the chat pops up; `0` = never |
| `data-popup-scroll` | `60` | Or when they have scrolled this far down a page (%); `0` = never |
| `data-position` | `right` | `right` or `left` |

The chat pops up once per visit (browser tab session). On a computer it opens; on a phone it shows a small invitation next to the button instead, so the page is not covered.

| `data-precise-location` | `true` | After the visitor sends the form, ask the browser for their exact location (`false` = never ask) |

## What the portal learns about a visitor

Shown on **Chat › Website chats**, in the panel beside the chat:

- **Contact:** the form (name, email, phone, company, question).
- **Location:** city, region, postal code, network owner and internet provider from their IP address (ipwho.is, falling back to ipinfo.io; no prompt; city level). Their exact place (area and street, from OpenStreetMap) only if they allow the browser's location prompt, which is asked once, after they have sent the form. There is also a small map and their local time.
- **Device:** phone, tablet or desktop. The model, system and version come from Chrome/Edge/Android client hints; iPhones only say "iPhone". Also the browser, screen and window size, CPU cores, memory, touch, connection type and speed, languages, and dark or light mode.
- **Visit:** where they came from, the landing page, campaign tags (`utm_*`, `gclid`, `fbclid`, `msclkid`), how many visits this browser has made and since when, and earlier chats from the same browser.
- **Pages visited:** every page with time, how long they stayed (time in front, sent when they leave the page) and how far they scrolled.

All of it is stored on the chat (`web_chats.client`, `geo`, `pages`, and the `snapshot` JSON when the chat ends). The website's privacy policy should mention the chat and this information.

## Portal settings

- **`WEBCHAT_ORIGINS`** (env): the websites allowed to use the chat, comma separated. Default: `https://www.zeronix.ae,https://zeronix.ae`. Outside production, `localhost`, `127.0.0.1`, LAN addresses and pages opened from disk are also allowed, for testing.
- **Ring for** (admin, at the bottom of the Website tab): *every visitor on the site* (default) or *visitors who send the form*.
- Who answers: active users with the **CRM** app who are punched in. Do not disturb (or chat sound off) keeps the ring quiet; the card still shows.

## How it works

1. The page loads → `POST /api/widget/session` starts (or resumes) the visitor's chat. The token is kept in the visitor's `localStorage`, so moving between pages keeps the same chat. Every agent's portal rings.
2. `GET /api/widget/stream?token=…` (Server-Sent Events) carries agent replies, "typing", accepted/ended and who is online. While it is open the visitor counts as on the site; about 15 s after it closes for good, the ringing stops.
3. The visitor sees the greeting first. As soon as they start typing (or tap a quick reply), a short form appears in the chat (name, email, phone, company); their question is sent with it (`/api/widget/lead`). Then they chat (`/api/widget/send`).
4. An agent presses **Accept**. The ringing stops everywhere, and the chat opens on the visitor's screen with the agent's first name and job title.
5. "End" asks inside the chat (no browser pop-up) and offers a call back instead. After the chat ends (either side), the visitor can rate it: 1-5 stars, ready-made feedback chips and a comment (`/api/widget/feedback`). The whole chat, the visitor's details, the pages they visited and the rating are kept as JSON on the chat (`web_chats.snapshot`).

Requests are sent as `text/plain` JSON, so browsers send no CORS preflight. Limits per IP: 20 new chats an hour, 10 lead forms an hour, 30 messages a minute. A hidden honeypot field drops bot form fills. Visitors who left without sending the form are deleted after 7 days.

## Testing

1. `npm run dev`, sign in, and punch in (the chat only runs once you are punched in).
2. Open `http://localhost:3100/widget/demo.html` in a **private window** (a new visitor). The portal rings.
3. Fill in the form, press **Accept** in the portal and reply.

To test from the live website before launch, add the website's address to `WEBCHAT_ORIGINS` on the portal, then add the script tag to a hidden page.
