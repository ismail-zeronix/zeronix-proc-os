FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# headless Chromium turns print pages into PDFs for emailed quotes (lib/pdf.ts); Liberation fonts match Arial/Helvetica
RUN apk add --no-cache chromium font-liberation
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# full node_modules: the entrypoint runs migrations and seed with tsx
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts && npx next start -p 3000"]
