function isPublicHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
    if (/^(127|10|0)\\./.test(host) || /^192\\.168\\./.test(host) || /^169\\.254\\./.test(host)) return null;
    const private172 = host.match(/^172\\.(\\d+)\\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
    return url;
  } catch {
    return null;
  }
}

export async function handleEpgSourceRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/tv/epg-source" || request.method !== "GET") return null;
  const targetValue = url.searchParams.get("url") || "";
  const target = isPublicHttpUrl(targetValue);
  if (!target) return Response.json({ ok: false, error: "A public HTTP(S) XMLTV URL is required." }, { status: 400 });

  const proxyValue = url.searchParams.get("proxy") || "";
  let upstreamUrl = target.toString();
  if (proxyValue) {
    if (!proxyValue.includes("{url}")) {
      return Response.json({ ok: false, error: "Proxy URL must contain the {url} placeholder." }, { status: 400 });
    }
    const proxy = isPublicHttpUrl(proxyValue.replace("{url}", encodeURIComponent(target.toString())));
    if (!proxy) return Response.json({ ok: false, error: "Invalid public proxy URL." }, { status: 400 });
    upstreamUrl = proxy.toString();
  }

  const headers = new Headers({ Accept: "application/xml,text/xml,application/gzip,application/octet-stream,*/*" });
  const etag = request.headers.get("If-None-Match");
  const modified = request.headers.get("If-Modified-Since");
  if (etag) headers.set("If-None-Match", etag);
  if (modified) headers.set("If-Modified-Since", modified);

  try {
    const upstream = await fetch(upstreamUrl, { method: "GET", headers, redirect: "follow", cache: "no-store" });
    if (upstream.status === 304) return new Response(null, { status: 304, headers: { ...(upstream.headers.get("ETag") ? { ETag: upstream.headers.get("ETag")! } : {}), ...(upstream.headers.get("Last-Modified") ? { "Last-Modified": upstream.headers.get("Last-Modified")! } : {}) } });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ ok: false, error: "EPG source returned HTTP " + upstream.status }, { status: 502 });
    }
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-encoding", "content-length", "etag", "last-modified", "cache-control"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("X-EPG-Gzip", /\\.gz(?:$|[?#])/i.test(target.toString()) ? "1" : "0");
    return new Response(upstream.body, { status: 200, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EPG source could not be reached";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
