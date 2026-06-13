# Minimal static-serve container for Cloud Run.
# serve.mjs uses only Node built-ins and honors $PORT (Cloud Run injects 8080),
# so no npm install / build step is needed — just copy the site and run it.
FROM node:20-alpine
WORKDIR /app
COPY index.html ./
COPY assets ./assets
COPY data ./data
COPY scripts/serve.mjs ./scripts/serve.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "scripts/serve.mjs"]
