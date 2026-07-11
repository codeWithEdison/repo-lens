# RepoLens API server image.
# https://github.com/codeWithEdison/repo-lens
# Build context must be the repository root so ../shared is available.
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/codeWithEdison/repo-lens"
ENV NODE_ENV=production
WORKDIR /app
# Shared contracts consumed via the @shared path alias (../shared).
COPY shared ./shared
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
# Workspace is a mounted volume shared with the worker.
RUN mkdir -p /workspace && chown -R node:node /workspace /app
USER node
ENV WORKSPACE_ROOT=/workspace
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
WORKDIR /app/server
CMD ["npm", "run", "start"]
