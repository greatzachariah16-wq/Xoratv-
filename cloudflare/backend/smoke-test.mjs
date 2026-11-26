const base = process.env.XORATV_EDGE_URL || "https://xoratv-edge-api.ericgreat668.workers.dev";
const origin = "https://xoratv-x.onrender.com";
const plannedWorkerOrigin = "https://xoratv-web.ericgreat668.workers.dev";

async function check(path, expectedStatus, validate) {
  const response = await fetch(base + path, { headers: { Origin: origin } });
  if (response.status !== expectedStatus) throw new Error(path + ": expected " + expectedStatus + ", received " + response.status);
  const body = await response.json();
  validate(body);
  console.log("PASS", path, response.status);
}

await check("/health", 200, body => {
  if (body.ok !== true || body.service !== "xoratv-edge-api") throw new Error("Invalid health response");
});
await check("/api/health", 200, body => {
  if (body.ok !== true) throw new Error("Invalid API health response");
});
await check("/api/tv/channels?limit=3", 200, body => {
  if (body.ok !== true || !Array.isArray(body.channels) || body.channels.length > 3) throw new Error("Invalid channel catalogue response");
  for (const channel of body.channels) {
    if (!channel.id || !channel.name || !/^https?:\/\//i.test(channel.streamUrl || "")) throw new Error("Channel missing direct stream URL");
  }
});
await check("/api/tv/guide?channel=bbc.uk&hours=12", 200, body => {
  if (body.ok !== true || body.channelId !== "bbc.uk" || !Array.isArray(body.programmes)) throw new Error("Invalid EPG response");
});
const plannedOrigin = await fetch(base + "/health", { headers: { Origin: plannedWorkerOrigin } });
if (plannedOrigin.status !== 200 || plannedOrigin.headers.get("access-control-allow-origin") !== plannedWorkerOrigin) throw new Error("Planned Cloudflare web origin was not allowed");
console.log("PASS planned Cloudflare web origin", plannedOrigin.status);
const feedback = await fetch(base + "/api/tv/playback-feedback", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ provider: "iptv-org", channelId: "smoke-test", transport: "direct" }),
});
if (feedback.status !== 204) throw new Error("Playback feedback endpoint returned " + feedback.status);
console.log("PASS /api/tv/playback-feedback", feedback.status);
const preflight = await fetch(base + "/api/tv/playback-feedback", {
  method: "OPTIONS",
  headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
});
if (preflight.status !== 204 || !(preflight.headers.get("access-control-allow-methods") || "").includes("POST")) throw new Error("Playback feedback CORS preflight failed");
console.log("PASS playback feedback CORS preflight", preflight.status);
const denied = await fetch(base + "/health", { headers: { Origin: "https://not-xoratv.example" } });
if (denied.status !== 403) throw new Error("Unapproved origin was not rejected");
console.log("PASS CORS origin allowlist", denied.status);
