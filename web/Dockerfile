# Production image for Cloudflare Containers (see wrangler.jsonc). Build with --platform=linux/amd64.
FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    KNOWLEDGE_DIR=/data/knowledge \
    RUNTIME_DIR=/data/runtime \
    CASES_DIR=/app/fixtures/ws6/cases
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public
COPY --from=build /src/fixtures ./fixtures
# Ephemeral: data resets whenever the container restarts.
RUN mkdir -p /data/knowledge /data/runtime
EXPOSE 8080
CMD ["node", "server.js"]
