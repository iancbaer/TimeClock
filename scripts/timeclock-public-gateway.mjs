import { createServer, request as upstreamRequest } from "node:http";
import { timingSafeEqual } from "node:crypto";

const listenHost = "127.0.0.1";
const listenPort = Number(process.env.TIMECLOCK_GATEWAY_PORT ?? "3110");
const upstreamHost = "127.0.0.1";
const upstreamPort = 3100;
const configuredDeviceKey = process.env.KIOSK_DEVICE_KEY?.trim() ?? "";
const allowedOrigins = new Set(["https://localhost", "capacitor://localhost"]);

if (configuredDeviceKey.length < 32) {
  throw new Error("KIOSK_DEVICE_KEY must be at least 32 characters.");
}

function keyMatches(provided) {
  if (!provided) return false;
  const actual = Buffer.from(provided);
  const expected = Buffer.from(configuredDeviceKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function applyCors(response, origin) {
  if (!origin || !allowedOrigins.has(origin)) return;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-TimeClock-Device-Key");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Vary", "Origin");
}

function json(response, status, body, origin) {
  applyCors(response, origin);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

const server = createServer((incoming, outgoing) => {
  const origin = incoming.headers.origin;
  const path = new URL(incoming.url ?? "/", "http://localhost").pathname;
  const isHealth = path === "/api/health";
  const isKiosk = path.startsWith("/api/kiosk/");

  if (incoming.method === "OPTIONS") {
    if ((isHealth || isKiosk) && origin && allowedOrigins.has(origin)) {
      applyCors(outgoing, origin);
      outgoing.writeHead(204);
      outgoing.end();
    } else {
      json(outgoing, 403, { error: "This app origin is not allowed." }, origin);
    }
    return;
  }

  if (!isHealth && !isKiosk) {
    json(outgoing, 404, { error: "Not found." }, origin);
    return;
  }

  if (isKiosk && !keyMatches(incoming.headers["x-timeclock-device-key"])) {
    json(outgoing, 401, { error: "This TimeClock app is not authorized for TRESA." }, origin);
    return;
  }

  const headers = { ...incoming.headers, host: `${upstreamHost}:${upstreamPort}` };
  delete headers.connection;
  delete headers["x-timeclock-device-key"];

  const upstream = upstreamRequest({
    hostname: upstreamHost,
    port: upstreamPort,
    path: incoming.url,
    method: incoming.method,
    headers,
    timeout: 15_000,
  }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders["access-control-allow-origin"];
    delete responseHeaders["access-control-allow-methods"];
    delete responseHeaders["access-control-allow-headers"];
    delete responseHeaders["access-control-max-age"];
    delete responseHeaders.vary;
    applyCors(outgoing, origin);
    outgoing.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.pipe(outgoing);
  });

  upstream.on("timeout", () => upstream.destroy(new Error("TRESA TimeClock timed out.")));
  upstream.on("error", () => {
    if (!outgoing.headersSent) json(outgoing, 502, { error: "TRESA TimeClock is temporarily unavailable." }, origin);
    else outgoing.end();
  });
  incoming.pipe(upstream);
});

server.listen(listenPort, listenHost, () => {
  console.log(`TimeClock public gateway listening on http://${listenHost}:${listenPort}`);
});
