# trello-bridge — localhost-only NestJS bridge to a Trello board.
#
# Build:  docker build -t trello-bridge .
# Run:    docker run -d --name trello-bridge \
#           --env-file .env \
#           -p 127.0.0.1:4646:4646 \
#           trello-bridge
#
# Credentials come from .env via --env-file (the in-app walk-up
# dotenv loader can't see host files from inside the container). Publish
# the port on 127.0.0.1 only — the bridge has no auth of its own.
# No board env var: every /cards request supplies its own board via the
# X-Trello-Board header (400 without it) — see README.md.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    # 0.0.0.0 is required inside the container for the published port to
    # work; localhost-only is enforced by `-p 127.0.0.1:4646:4646` above.
    HOST=0.0.0.0 \
    PORT=4646
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# GET /health reads its own version from here at runtime.
COPY --from=build /app/package.json ./package.json
EXPOSE 4646
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/main.js"]
