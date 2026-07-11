# RepoLens analysis worker image.
# https://github.com/codeWithEdison/repo-lens
# Build context must be the repository root so ../shared is available.
FROM node:22-alpine AS deps
WORKDIR /app/worker
COPY worker/package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/codeWithEdison/repo-lens"
ENV NODE_ENV=production
# Git is required for cloning repositories.
RUN apk add --no-cache git openssh-client ca-certificates
WORKDIR /app
COPY shared ./shared
COPY --from=deps /app/worker/node_modules ./worker/node_modules
COPY worker ./worker
RUN mkdir -p /workspace && chown -R node:node /workspace /app
USER node
ENV WORKSPACE_ROOT=/workspace
# Never allow Git to prompt for credentials.
ENV GIT_TERMINAL_PROMPT=0
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1
WORKDIR /app/worker
CMD ["npm", "run", "start"]
