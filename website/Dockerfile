# zeronixtech.com public site. Built from this folder ONLY (build context ./website): the portal's code, database,
# migrations and .env are never in this image. It holds two secrets at runtime (SITE_API_KEY, REVALIDATE_SECRET).
#   docker compose -f docker-compose.prod.yml build zeronix-site

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# no portal during the build: pages are built with the fallback content and refresh from the portal at runtime
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# the server rewrites refreshed pages under .next/server (ISR), not only .next/cache, so node must own all of .next
RUN mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
