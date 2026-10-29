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

Optional settings on the same tag:

```html
<script
  src="https://PORTAL-DOMAIN/widget/zeronix-chat.js"
  data-color="#1f5fbf"
  data-title="Zeronix Sales"
  data-greeting="Hi there 👋 Looking for laptops, servers or IT solutions? Chat with our sales team."
  data-teaser-delay="6"
  data-position="right"
  defer
></script>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-color` | `#1f5fbf` | Button and header colour |
| `data-title` | `Zeronix Sales` | Header title |
| `data-greeting` | (above) | The small invitation that pops up next to the button |
| `data-teaser-delay` | `6` | Seconds before the invitation shows; `0` turns it off |
| `data-position` | `right` | `right` or `left` |

## Portal settings

- **`WEBCHAT_ORIGINS`** (env): the websites allowed to use the chat, comma separated. Default: `https://www.zeronix.ae,https://zeronix.ae`. Outside production, `localhost`, `127.0.0.1`, LAN addresses and pages opened from disk are also allowed, for testing.
- **Ring for** (admin, at the bottom of the Website tab): *every visitor on the site* (default) or *visitors who send the form*.
- Who answers: active users with the **CRM** app who are punched in. Do not disturb (or chat sound off) keeps the ring quiet; the card still shows.

## How it works

1. The page loads → `POST /api/widget/session` starts (or resumes) the visitor's chat. The token is kept in the visitor's `localStorage`, so moving between pages keeps the same chat. Every agent's portal rings.
2. `GET /api/widget/stream?token=…` (Server-Sent Events) carries agent replies, "typing", accepted/ended and who is online. While it is open the visitor counts as on the site; about 15 s after it closes for good, the ringing stops.
3. The visitor sends the lead form (`/api/widget/lead`), then chats (`/api/widget/send`). They can end it (`/api/widget/close`).
4. An agent presses **Accept**. The ringing stops everywhere, and the chat opens on the visitor's screen with the agent's first name and job title.

Requests are sent as `text/plain` JSON, so browsers send no CORS preflight. Limits per IP: 20 new chats an hour, 10 lead forms an hour, 30 messages a minute. A hidden honeypot field drops bot form fills. Visitors who left without sending the form are deleted after 7 days.

## Testing

1. `npm run dev`, sign in, and punch in (the chat only runs once you are punched in).
2. Open `http://localhost:3100/widget/demo.html` in a **private window** (a new visitor). The portal rings.
3. Fill in the form, press **Accept** in the portal and reply.

To test from the live website before launch, add the website's address to `WEBCHAT_ORIGINS` on the portal, then add the script tag to a hidden page.
