package io.xora.app;

import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.ResponseBody;

/**
 * Per-device HLS proxy. It binds exclusively to loopback and streams media
 * from provider origins using the resolver-supplied request headers.
 */
public final class LocalHlsProxy extends NanoHTTPD {
    private static final String TAG = "XoraLocalHlsProxy";
    private static final int FIRST_PORT = 8787;
    private static final int LAST_PORT = 8797;
    private static final long SESSION_TTL_MS = 45L * 60L * 1000L;
    private static final int MAX_PLAYLIST_BYTES = 4 * 1024 * 1024;
    private static final Pattern URI_ATTRIBUTE = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern CONTENT_RANGE = Pattern.compile("bytes\\s+(\\d+)-(\\d+)/", Pattern.CASE_INSENSITIVE);

    private static final class Session {
        final String id;
        final String upstreamUrl;
        final JSONObject headers;
        volatile long lastAccessAt;

        Session(String id, String upstreamUrl, JSONObject headers) {
            this.id = id;
            this.upstreamUrl = upstreamUrl;
            this.headers = headers == null ? new JSONObject() : headers;
            this.lastAccessAt = System.currentTimeMillis();
        }
    }

    private final OkHttpClient client;
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final int listeningPort;

    private LocalHlsProxy(OkHttpClient client, int port) throws IOException {
        super("127.0.0.1", port);
        this.client = client;
        start(5000, false);
        this.listeningPort = getListeningPort();
    }

    public static LocalHlsProxy start(OkHttpClient client) throws IOException {
        IOException lastError = null;
        for (int port = FIRST_PORT; port <= LAST_PORT; port++) {
            try {
                LocalHlsProxy proxy = new LocalHlsProxy(client, port);
                Log.i(TAG, "Local HLS proxy listening on 127.0.0.1:" + proxy.listeningPort);
                return proxy;
            } catch (IOException error) {
                lastError = error;
            }
        }
        throw new IOException("No available local HLS proxy port in range 8787-8797.", lastError);
    }

    public String createSession(String upstreamUrl, JSONObject headers) throws IOException {
        if (!isHttpUrl(upstreamUrl)) throw new IOException("Unsupported upstream stream URL.");
        String id = UUID.randomUUID().toString().replace("-", "");
        sessions.put(id, new Session(id, upstreamUrl, headers));
        String localUrl = "http://127.0.0.1:" + listeningPort + "/play/" + id;
        String host = safeHost(upstreamUrl);
        Log.d(TAG, "Created session " + id + " for " + host);
        return localUrl;
    }

    public void clearSessions() {
        sessions.clear();
    }

    @Override
    public void stop() {
        sessions.clear();
        super.stop();
    }

    @Override
    public Response serve(IHTTPSession request) {
        okhttp3.Response upstreamResponse = null;
        try {
            cleanupExpiredSessions();
            String[] parts = request.getUri().split("/");
            if (parts.length < 3) return textResponse(Response.Status.NOT_FOUND, "Not found");
            String route = parts[1];
            String sessionId = parts[2];
            Session session = sessions.get(sessionId);
            if (session == null) return textResponse(Response.Status.GONE, "Playback session expired");
            session.lastAccessAt = System.currentTimeMillis();

            String upstreamUrl;
            if ("play".equals(route)) {
                upstreamUrl = session.upstreamUrl;
            } else if ("resource".equals(route)) {
                upstreamUrl = request.getParms().get("url");
                if (!isHttpUrl(upstreamUrl)) return textResponse(Response.Status.BAD_REQUEST, "Invalid media URL");
            } else {
                return textResponse(Response.Status.NOT_FOUND, "Not found");
            }

            String method = request.getMethod().name();
            Request.Builder builder = new Request.Builder().url(upstreamUrl);
            if ("HEAD".equals(method)) builder.head();
            else if ("GET".equals(method)) builder.get();
            else return textResponse(Response.Status.METHOD_NOT_ALLOWED, "Method not allowed");

            builder.header("Accept-Encoding", "identity");
            Iterator<String> names = session.headers.keys();
            while (names.hasNext()) {
                String name = names.next();
                String value = session.headers.optString(name, "");
                if (!value.isEmpty() && isAllowedRequestHeader(name)) builder.header(name, value);
            }
            String range = request.getHeaders().get("range");
            if (range != null && !range.isEmpty()) builder.header("Range", range);

            upstreamResponse = client.newCall(builder.build()).execute();
            final okhttp3.Response upstream = upstreamResponse;
            ResponseBody body = upstream.body();
            String contentType = upstream.header("Content-Type", "application/octet-stream");
            String finalUrl = upstream.request().url().toString();
            boolean playlist = isPlaylist(finalUrl, contentType);

            if (playlist && body != null && "GET".equals(method)) {
                byte[] bytes = readBounded(body.byteStream(), MAX_PLAYLIST_BYTES);
                String text = new String(bytes, StandardCharsets.UTF_8);
                String rewritten = rewritePlaylist(text, finalUrl, session.id);
                upstream.close();
                Response response = newFixedLengthResponse(
                    Response.Status.lookup(upstream.code()) == null ? Response.Status.OK : Response.Status.lookup(upstream.code()),
                    "application/vnd.apple.mpegurl",
                    rewritten
                );
                addCommonHeaders(response);
                return response;
            }

            long length = body == null ? 0 : body.contentLength();
            if (length < 0 && upstream.code() == 206) {
                Matcher rangeMatch = CONTENT_RANGE.matcher(upstream.header("Content-Range", ""));
                if (rangeMatch.find()) {
                    try {
                        length = Long.parseLong(rangeMatch.group(2))
                            - Long.parseLong(rangeMatch.group(1)) + 1L;
                    } catch (NumberFormatException ignored) {
                        length = -1L;
                    }
                }
            }
            InputStream stream = body == null ? new java.io.ByteArrayInputStream(new byte[0])
                : new FilterInputStream(body.byteStream()) {
                    @Override
                    public void close() throws IOException {
                        try { super.close(); } finally { upstream.close(); }
                    }
                };
            Response.IStatus status = Response.Status.lookup(upstream.code());
            if (status == null) status = Response.Status.INTERNAL_ERROR;
            Response response = length >= 0
                ? newFixedLengthResponse(status, contentType, stream, length)
                : newChunkedResponse(status, contentType, stream);
            for (String header : new String[] {
                "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Cache-Control"
            }) {
                String value = upstream.header(header);
                if (value != null) response.addHeader(header, value);
            }
            addCommonHeaders(response);
            Log.v(TAG, "Relayed " + request.getUri() + " from " + safeHost(finalUrl) + " (" + upstream.code() + ")");
            return response;
        } catch (Exception error) {
            if (upstreamResponse != null) upstreamResponse.close();
            Log.w(TAG, "Local HLS request failed: " + error.getClass().getSimpleName());
            return textResponse(Response.Status.INTERNAL_ERROR, "Upstream media request failed");
        }
    }

    private String rewritePlaylist(String playlist, String finalUrl, String sessionId) {
        StringBuilder output = new StringBuilder(playlist.length() + 256);
        String[] lines = playlist.split("\\r?\\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (!trimmed.isEmpty()) {
                if (trimmed.startsWith("#")) {
                    Matcher matcher = URI_ATTRIBUTE.matcher(line);
                    StringBuffer rewritten = new StringBuffer();
                    while (matcher.find()) {
                        String replacement = localResourceUrl(finalUrl, matcher.group(1), sessionId);
                        matcher.appendReplacement(rewritten, Matcher.quoteReplacement("URI=\"" + replacement + "\""));
                    }
                    matcher.appendTail(rewritten);
                    line = rewritten.toString();
                } else {
                    line = localResourceUrl(finalUrl, trimmed, sessionId);
                }
            }
            output.append(line);
            if (i < lines.length - 1) output.append('\n');
        }
        return output.toString();
    }

    private String localResourceUrl(String baseUrl, String reference, String sessionId) {
        // Data URIs are embedded payloads, not network requests.
        if (reference != null && reference.regionMatches(true, 0, "data:", 0, 5)) return reference;
        try {
            URI resolved = new URI(baseUrl).resolve(new URI(reference));
            String absolute = resolved.toString();
            if (!isHttpUrl(absolute)) return localUnavailableUrl(sessionId);
            return "http://127.0.0.1:" + listeningPort + "/resource/" + sessionId
                + "?url=" + URLEncoder.encode(absolute, "UTF-8");
        } catch (Exception ignored) {
            // Never leave an unparsed provider URL in a playlist sent to LibVLC.
            return localUnavailableUrl(sessionId);
        }
    }

    private String localUnavailableUrl(String sessionId) {
        return "http://127.0.0.1:" + listeningPort + "/unsupported/" + sessionId;
    }

    private boolean isPlaylist(String url, String contentType) {
        String type = contentType == null ? "" : contentType.toLowerCase();
        String path = url == null ? "" : url.toLowerCase();
        return type.contains("mpegurl") || type.contains("vnd.apple") || path.contains(".m3u8");
    }

    private boolean isHttpUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (host == null || uri.getUserInfo() != null
                || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return false;
            String normalizedHost = host.toLowerCase(java.util.Locale.US);
            if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
                normalizedHost = normalizedHost.substring(1, normalizedHost.length() - 1);
            }
            return !("localhost".equals(normalizedHost)
                || normalizedHost.endsWith(".localhost")
                || "127.0.0.1".equals(normalizedHost)
                || "::1".equals(normalizedHost));
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isAllowedRequestHeader(String name) {
        if (name == null || name.trim().isEmpty()) return false;
        String normalized = name.toLowerCase(java.util.Locale.US);
        // Preserve resolver-supplied origin headers, including provider-specific X-* headers,
        // while preventing hop-by-hop, host, range, and proxy credentials from being spoofed.
        return !("host".equals(normalized)
            || "connection".equals(normalized)
            || "content-length".equals(normalized)
            || "transfer-encoding".equals(normalized)
            || "accept-encoding".equals(normalized)
            || "range".equals(normalized)
            || "te".equals(normalized)
            || "trailer".equals(normalized)
            || "upgrade".equals(normalized)
            || normalized.startsWith("proxy-"));
    }

    private byte[] readBounded(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximum) throw new IOException("Playlist exceeds size limit");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Session> entry : sessions.entrySet()) {
            if (now - entry.getValue().lastAccessAt > SESSION_TTL_MS) sessions.remove(entry.getKey(), entry.getValue());
        }
    }

    private String safeHost(String value) {
        try { return new URI(value).getHost(); } catch (Exception ignored) { return "unknown"; }
    }

    private void addCommonHeaders(Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Cache-Control", "no-store");
    }

    private Response textResponse(Response.Status status, String message) {
        Response response = newFixedLengthResponse(status, "text/plain; charset=utf-8", message);
        addCommonHeaders(response);
        return response;
    }
}
