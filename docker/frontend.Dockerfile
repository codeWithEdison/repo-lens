# RepoLens frontend (TanStack Start dev server).
# https://github.com/codeWithEdison/repo-lens
# For a simple, working container we run the Vite dev server. For a production
# reverse-proxy setup, see docker/nginx.conf.
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/codeWithEdison/repo-lens"
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 5173
ENV VITE_API_URL=http://localhost:4000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
