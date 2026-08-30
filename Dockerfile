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
  && groupadd --system timeclock \
  && useradd --system --create-home --gid timeclock timeclock
COPY --from=build --chown=timeclock:timeclock /app /app
USER timeclock
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["npm", "run", "start", "--workspace", "@timeclock/web"]
