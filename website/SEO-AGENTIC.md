# zeronixtech.com: agentic SEO (built 2026-11-19)

**For:** the owner and anyone who changes how AI assistants and agents use the site.
**Goes with:** `SEO-PLAN.md` (robots, llms.txt, IndexNow) and `SEO-STRATEGY.md` (competitors, keywords).

AI assistants and agents now do three things on a site: **read** it, **find out what it offers**, and **act** on it for a buyer. Each has a standard. This file lists what the site does for each, and how to check it.

## 1. Read: Markdown copies of pages

| Ask | Answer |
|---|---|
| `Accept: text/markdown` to any page below | A clean Markdown copy of that page, `Content-Type: text/markdown` |
| The same URL with `.md` added, e.g. `/products.md`, `/guides/<slug>.md` | The same copy, for tools that cannot set headers |

- Pages that have a copy: home (the llms.txt brief), `/products`, a category, a product, `/industries`, an industry, a brand, a guide, article, service or company page.
- Each copy has the canonical URL as `Source:`, the price only if it is public, and an `x-markdown-tokens` header (size estimate). The header `Content-Signal` repeats the robots policy.
- The copies are `noindex` and `/md/` is closed in robots.txt, so Google keeps ranking the HTML page.
- Code: `src/proxy.ts` (rewrite), `src/app/md/[[...path]]/route.ts`, `src/lib/agent.ts` (renderers).

## 2. Discover: where an agent finds what we offer

| Address | What it is |
|---|---|
| `Link` header on `/` | Points to the sitemap, `/llms.txt` and the API catalog (RFC 8288) |
| `/llms.txt`, `/llms-full.txt` | Brief and full catalog for assistants. Now also mentions the Markdown copies, `/mcp` and the skill |
| `/.well-known/api-catalog` | RFC 9727 linkset: the MCP endpoint, its description, its docs, the Merchant feed |
| `/.well-known/mcp/server-card.json` | MCP server card: endpoint, transport, tool list |
| `/.well-known/agent-skills/index.json` | Agent Skills index with a sha256 digest of each skill |
| `/.well-known/agent-skills/buy-business-it/SKILL.md` | The skill: how an agent should shortlist and request pricing, with the rules (no invented prices, no warranty promises, explicit consent) |
| `/.well-known/security.txt` | RFC 9116 contact (info@zeronix.ae, the Privacy page's address) |
| `robots.txt` | More AI crawlers named (anthropic-ai, GoogleOther, Bytespider, FacebookBot, Diffbot, Meta-ExternalFetcher); `Content-Signal` unchanged |
| `/feed/google.xml` | Merchant feed (already built) |

## 3. Act: the MCP server and WebMCP

**MCP server, `POST /mcp`** (Streamable HTTP, no sign-in, stateless JSON). Tools:

| Tool | Does |
|---|---|
| `search_products` | Search by words, brand, model, part number |
| `get_product` | Specs, price, availability, warranty notes, FAQ (as Markdown) |
| `list_catalog` | Categories, industries, brands |
| `find_guides` | Buying guides, comparisons, services |
| `get_company_info` | The llms.txt brief: contact, delivery, ordering, what an assistant may promise |
| `request_quote` | Sends a quote request into Website › Leads. **Refuses unless `user_confirmed` is true**; needs name and email; 3 per hour per network. Places no order, takes no payment |

Prices come back only when public (AED incl. 5% VAT) and always with a "listed price, may change" note.

**WebMCP** (`src/components/agent/web-mcp.tsx`): in browsers that offer `navigator.modelContext`, a visiting agent can call `search_products`, `open_product` and `start_quote`. `start_quote` only opens the form; the buyer sends it. Other browsers: nothing runs.

Code: `src/app/mcp/route.ts`, `src/lib/mcp-rpc.ts` (protocol), `src/lib/mcp-tools.ts` (tools). Tests: `tests/website-agent.test.ts`, `tests/website-mcp.test.ts`.

## 4. Check it

```
curl -H "Accept: text/markdown" https://zeronixtech.com/products
curl -I https://zeronixtech.com/                       # Link header
curl https://zeronixtech.com/.well-known/api-catalog
curl -s -X POST https://zeronixtech.com/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"elitebook"}}}'
```

Then: isitagentready.com (Cloudflare) on zeronixtech.com, and add `https://zeronixtech.com/mcp` as a custom connector in Claude or ChatGPT to try the tools.

## 5. Left out on purpose

- **Agentic checkout** (Google UCP, OpenAI ACP, x402): needs a payment partner and stock rules. Revisit once the Merchant Center feed is approved and Nomod orders are flowing.
- **Web Bot Auth / signed agents** and **OAuth for agents**: nothing here needs a sign-in yet.
- **Arabic copies** with hreflang: wait for search volumes.

## 6. Owner steps

1. Deploy `dev` (site image) and run the four checks above on the live domain.
2. Run isitagentready.com and note the score.
3. If `request_quote` is abused, lower the limit in `mcp-tools.ts` (`allow`) or remove the tool from `mcpTools` in `agent.ts`.
