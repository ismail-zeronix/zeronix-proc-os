# Website app (portal side)

Server code for the public website's control panel (WEBSITE-PLAN.md, TASKS.md Phase 17):

- posts and the Markdown import;
- the SEO checks;
- the site settings;
- the read-only site API;
- the analytics events and rollups;
- the Search Console import.

The admin pages are in `src/app/(app)/website/`, and the API the public site calls is in `src/app/api/site/`.

The public site itself is in the top-level `website/` folder and has its own Docker image.

**Database.** Everything here reads and writes the website's **own database** through `siteDb` (`src/db/site.ts`, tables in `src/db/site-schema.ts`, migrations in `src/db/site-migrations/`, `npm run db:site:generate`). Nothing outside the Website code may import it; a test checks that. A link to a ZeronixOS record (a user, a procurement product, a CRM deal) is a plain id, and the code reads that record with `db` from the ZeronixOS database (`authors.ts`, `searchPortalProducts`, `lead-actions.ts`).
