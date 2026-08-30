FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system nanshe \
  && useradd --system --create-home --gid nanshe nanshe
COPY --from=build --chown=nanshe:nanshe /app /app
USER nanshe
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["npm", "run", "start", "--workspace", "@nanshe/web"]
