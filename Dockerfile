# ZeronixOS production image: Next.js standalone server, non-root, no dev dependencies, no secrets.
#   docker compose -f docker-compose.prod.yml build      (production, see production/README.md)
#   docker compose up -d --build                          (office / local stack, docker-compose.yml)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Migrations and the first-admin seed run outside Next.js; bundle them to plain JS so the final image needs no tsx
RUN node_modules/.bin/esbuild scripts/migrate.ts scripts/seed.ts --bundle --platform=node --target=node22 \
      --format=cjs --external:pg-native --outdir=dist-scripts

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# headless Chromium turns print pages into PDFs for emailed quotes (lib/pdf.ts); Liberation fonts match Arial/Helvetica
RUN apk add --no-cache chromium font-liberation
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# App files stay root-owned (read-only for the app user); only the cache and uploaded files are writable
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/dist-scripts ./scripts
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh \
 && mkdir -p .next/cache data/files \
 && chown -R node:node .next/cache data
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
