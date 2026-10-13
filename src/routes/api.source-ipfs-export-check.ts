import { createFileRoute } from "@tanstack/react-router";

const EXPORTS = [
  { year: "2018", cid: "Qmb2JizJSE5HCmzP6qKiRPmamGdgV6Aes2UudzYrgphfvC", reportedSize: "5.97 MiB" },
  { year: "2019", cid: "QmZgP278dJHA5RZgsD1kVQM2Jzmo5sN8Z7Aoj179j3G49c", reportedSize: "10.24 MiB" },
  { year: "2020", cid: "QmZcMDBpAso15QqaGeG4jtiKavXmQkFBEPhGHxNGkD9qcN", reportedSize: "20.12 MiB" },
  { year: "2021", cid: "QmP8E1rio395xfZDk4SWRygC3P13Jfyy1ycDxoyEXRyNAA", reportedSize: "456.52 MiB" },
];
const GATEWAYS = ["https://ipfs.io", "https://dweb.link", "https://gateway.ipfs.io"];
const TIMEOUT_MS = 7000;

async function probe(gateway: string, cid: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${gateway}/ipfs/${cid}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "XoraTV-SourceLab/1.0", "Accept": "application/octet-stream" },
    });
    return {
      gateway,
      status: response.status,
      reachable: response.ok && !/text\/html/i.test(response.headers.get("content-type") || ""),
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      finalUrl: response.url,
    };
  } catch (error) {
    return { gateway, reachable: false, error: error instanceof Error ? error.name : "request-failed" };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/source-ipfs-export-check")({
  server: {
    handlers: {
      GET: async () => {
        const results = await Promise.all(EXPORTS.map(async (item) => {
          const probes = await Promise.all(GATEWAYS.map((gateway) => probe(gateway, item.cid)));
          return { ...item, reachable: probes.some((item) => item.reachable), probes };
        }));
        return Response.json({
          ok: true,
          checkedAt: new Date().toISOString(),
          purpose: "Check whether historical IPFS Search CID-index exports are retrievable. This endpoint only sends HEAD requests; it does not download, pin, or store export files.",
          results,
          nextStep: results.some((item) => item.reachable)
            ? "At least one export is reachable. Use the reported gateway and confirm the response format before importing."
            : "No export was reachable through the tested gateways from this Render service. This does not prove the CIDs are unavailable on the IPFS network.",
        }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
