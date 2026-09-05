import { createServer } from 'node:http';
import { request as upstreamRequest } from 'node:https';

const target = new URL('https://timeclock.whichmore.com');
const deviceKey = process.env.KIOSK_DEVICE_KEY;
if (!deviceKey || deviceKey.length < 32) throw new Error('Existing kiosk device authorization is required.');

// Compatibility for installed clients that still use the original TRESA URL.
// This process never connects to the old TRESA database or accepts local writes.
createServer((request, response) => {
  const headers = { ...request.headers, host: target.hostname, 'x-timeclock-device-key': deviceKey };
  delete headers.connection;
  const upstream = upstreamRequest({ hostname: target.hostname, port: 443, path: request.url, method: request.method, headers, timeout: 20000 }, (remote) => {
    response.writeHead(remote.statusCode ?? 502, remote.headers);
    remote.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Cloud service timeout')));
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'TimeClock cloud service is temporarily unavailable. Saved offline punches will retry.' }));
    } else response.end();
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
}).listen(3100, () => console.log('TimeClock compatibility bridge listening on port 3100.'));
