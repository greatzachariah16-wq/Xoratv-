package io.xora.app;

import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Android-only rolling HLS segment cache.
 *
 * The first frame is not handed to LibVLC until 60 seconds of playable media
 * have been downloaded into the app cache directory. A small rolling window is
 * retained locally while the playlist is refreshed in the background.
 */
final class LocalHlsBuffer {
    static final long TARGET_BUFFER_MS = 60_000L;
    private static final long RETAIN_WINDOW_MS = 300_000L;
    private static final long MAX_CACHE_BYTES = 256L * 1024L * 1024L;
    private static final long STARTUP_TIMEOUT_MS = 180_000L;
    private static final String TAG = "XoraHlsBuffer";
    private static final Pattern URI_ATTRIBUTE = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern RANGE = Pattern.compile("(\\d+)(?:@(\\d+))?");
    private static final Pattern BANDWIDTH = Pattern.compile("BANDWIDTH=(\\d+)", Pattern.CASE_INSENSITIVE);

    interface Listener {
        void onProgress(Progress progress);
    }

    static final class Progress {
        final long bufferedMillis;
        final long targetMillis;
        final int downloadedSegments;
        final int percent;
        final double speedRatio;
        final boolean healthy;
        final boolean ready;
        final boolean failed;
        final String error;
        final int httpCode;

        Progress(long bufferedMillis, int downloadedSegments, double speedRatio,
                 boolean healthy, boolean ready, boolean failed, String error, int httpCode) {
            this.bufferedMillis = bufferedMillis;
            this.targetMillis = TARGET_BUFFER_MS;
            this.downloadedSegments = downloadedSegments;
            this.percent = (int) Math.min(100L, Math.round(bufferedMillis * 100L / TARGET_BUFFER_MS));
            this.speedRatio = speedRatio;
            this.healthy = healthy;
            this.ready = ready;
            this.failed = failed;
            this.error = error == null ? "" : error;
            this.httpCode = httpCode;
        }
    }

    static final class Segment {
        final long sequence;
        final String url;
        final double duration;
        final List<String> tags;
        final String byteRange;
        final File file;
        final long sizeBytes;

        Segment(long sequence, String url, double duration, List<String> tags,
                String byteRange, File file, long sizeBytes) {
            this.sequence = sequence;
            this.url = url;
            this.duration = duration;
            this.tags = tags;
            this.byteRange = byteRange;
            this.file = file;
            this.sizeBytes = sizeBytes;
        }
    }

    private static final class PlaylistDocument {
        String url;
        String body;
        int code;
    }

    private static final class ParsedPlaylist {
        final List<String> globalTags = new ArrayList<>();
        final List<Segment> segments = new ArrayList<>();
        long mediaSequence;
        double targetDuration = 6.0;
        boolean endList;
    }

    private final Object lock = new Object();
    private final OkHttpClient client;
    private final File directory;
    private final String sessionId;
    private final int localPort;
    private final JSONObject headers;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final LinkedHashMap<Long, Segment> segments = new LinkedHashMap<>();
    private final ConcurrentHashMap<String, File> cachedResources = new ConcurrentHashMap<>();
    private final ArrayDeque<Double> recentSpeedRatios = new ArrayDeque<>();

    private volatile Listener listener;
    private volatile boolean running;
    private volatile boolean ready;
    private volatile boolean failed;
    private volatile String error = "";
    private volatile int errorCode;
    private volatile String mediaPlaylistUrl;
    private volatile String localPlaylist = "";
    private volatile long bufferedMillis;
    private volatile double speedRatio = 1.0;
    private volatile boolean healthy = true;
    private volatile long lastSequence = Long.MIN_VALUE;
    private volatile double targetDuration = 6.0;
    private volatile boolean endList;
    private volatile long downloadedBytes;

    LocalHlsBuffer(OkHttpClient client, File directory, String sessionId,
                   int localPort, JSONObject headers, Listener listener) {
        this.client = client;
        this.directory = directory;
        this.sessionId = sessionId;
        this.localPort = localPort;
        this.headers = headers == null ? new JSONObject() : headers;
        this.listener = listener;
    }

    void start() {
        synchronized (lock) {
            if (ready || failed) {
                notifyListener();
                return;
            }
            if (running) {
                notifyListener();
                return;
            }
            running = true;
        }
        executor.execute(this::run);
    }

    boolean isReady() {
        return ready;
    }

    boolean isFailed() {
        return failed;
    }

    String getPlaylist() {
        return localPlaylist;
    }

    File getCachedResource(String url, long sequence) {
        return cachedResources.get(resourceKey(url, sequence));
    }

    void setListener(Listener next) {
        listener = next;
        notifyListener();
    }

    void stop() {
        running = false;
        executor.shutdownNow();
        synchronized (lock) {
            segments.clear();
            cachedResources.clear();
        }
        deleteRecursively(directory);
    }

    private void run() {
        long startedAt = System.currentTimeMillis();
        try {
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IOException("Could not create the Android stream cache.");
            }

            PlaylistDocument first = fetchPlaylist(mediaPlaylistUrl == null ? null : mediaPlaylistUrl);
            if (first == null) {
                // The session's origin URL is supplied by the caller below.
                throw new IOException("The stream playlist could not be loaded.");
            }
            mediaPlaylistUrl = first.url;
            if (isMasterPlaylist(first.body)) {
                String variant = chooseVariant(first.url, first.body);
                if (variant == null) throw new IOException("The HLS master playlist has no playable variant.");
                PlaylistDocument media = fetchPlaylist(variant);
                if (media == null) throw new IOException("The HLS media playlist could not be loaded.");
                mediaPlaylistUrl = media.url;
            }

            while (running) {
                if (System.currentTimeMillis() - startedAt > STARTUP_TIMEOUT_MS && !ready) {
                    fail("slow", 0, "Slow internet connection. The 60-second stream buffer could not fill.");
                    return;
                }

                PlaylistDocument document = fetchPlaylist(mediaPlaylistUrl);
                if (document == null) {
                    if (!ready) throw new IOException("The stream playlist could not be refreshed.");
                    sleep(1500L);
                    continue;
                }
                mediaPlaylistUrl = document.url;
                if (isMasterPlaylist(document.body)) {
                    String variant = chooseVariant(document.url, document.body);
                    if (variant == null) throw new IOException("The HLS master playlist has no playable variant.");
                    PlaylistDocument media = fetchPlaylist(variant);
                    if (media == null) throw new IOException("The HLS media playlist could not be loaded.");
                    mediaPlaylistUrl = media.url;
                    document = media;
                }

                ParsedPlaylist parsed = parsePlaylist(document.url, document.body);
                targetDuration = Math.max(1.0, parsed.targetDuration);
                endList = parsed.endList;

                for (Segment pending : parsed.segments) {
                    if (!running) return;
                    synchronized (lock) {
                        if (segments.containsKey(pending.sequence)) continue;
                    }
                    long downloadStart = System.nanoTime();
                    File file = downloadSegment(pending);
                    long elapsedMs = Math.max(1L, (System.nanoTime() - downloadStart) / 1_000_000L);
                    long size = file.length();
                    double ratio = pending.duration * 1000.0 / elapsedMs;
                    synchronized (lock) {
                        if (segments.containsKey(pending.sequence)) {
                            // The same media sequence may appear in successive live playlists.
                            // Keep the first complete copy.
                            //noinspection ResultOfMethodCallIgnored
                            file.delete();
                        } else {
                            Segment cached = new Segment(
                                pending.sequence, pending.url, pending.duration,
                                new ArrayList<>(pending.tags), pending.byteRange, file, size
                            );
                            segments.put(cached.sequence, cached);
                            cachedResources.put(resourceKey(cached.url, cached.sequence), cached.file);
                            downloadedBytes += size;
                            recentSpeedRatios.addLast(ratio);
                            while (recentSpeedRatios.size() > 5) recentSpeedRatios.removeFirst();
                            recalculateHealth();
                            pruneCache();
                            rebuildPlaylist(parsed.globalTags);
                        }
                    }
                    notifyListener();
                }

                synchronized (lock) {
                    recalculateBufferedDuration();
                    rebuildPlaylist(parsed.globalTags);
                    if (!ready && bufferedMillis >= TARGET_BUFFER_MS) ready = true;
                    if (!ready && parsed.endList && bufferedMillis > 0L) {
                        // Short VOD/event playlists cannot publish 60 seconds.
                        ready = true;
                    }
                }
                notifyListener();

                if (parsed.endList) {
                    if (!ready && bufferedMillis < TARGET_BUFFER_MS) {
                        sleep(1000L);
                    } else {
                        return;
                    }
                } else {
                    long pollMs = Math.max(1000L, Math.min(5000L, Math.round(targetDuration * 500.0)));
                    sleep(pollMs);
                }
            }
        } catch (BufferHttpException http) {
            fail(http.code == 403 || http.code == 451 ? "region" :
                 (http.code == 404 || http.code == 410 ? "down" : "slow"),
                 http.code, http.getMessage());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            Log.w(TAG, "HLS segment prebuffer failed: " + exception.getClass().getSimpleName());
            fail("slow", 0, "Slow internet connection. The stream could not maintain its download buffer.");
        }
    }

    // Called by LocalHlsProxy after the local playback session has been created.
    void setOriginUrl(String url) {
        if (mediaPlaylistUrl == null) mediaPlaylistUrl = url;
    }

    private PlaylistDocument fetchPlaylist(String url) throws IOException {
        if (url == null || url.trim().isEmpty()) return null;
        Request.Builder builder = new Request.Builder().url(url).get()
            .header("Accept", "application/vnd.apple.mpegurl, application/x-mpegURL, */*")
            .header("Accept-Encoding", "identity");
        applyHeaders(builder);
        try (Response response = client.newCall(builder.build()).execute()) {
            if (response.code() == 403 || response.code() == 451
                || response.code() == 404 || response.code() == 410) {
                throw new BufferHttpException(response.code(), "The channel source rejected the request.");
            }
            if (!response.isSuccessful()) return null;
            ResponseBody body = response.body();
            if (body == null) return null;
            String text = body.string();
            if (text.length() > 4 * 1024 * 1024) throw new IOException("HLS playlist is too large.");
            PlaylistDocument document = new PlaylistDocument();
            document.url = response.request().url().toString();
            document.body = text;
            document.code = response.code();
            return document;
        }
    }

    private void applyHeaders(Request.Builder builder) {
        java.util.Iterator<String> names = headers.keys();
        while (names.hasNext()) {
            String name = names.next();
            String value = headers.optString(name, "");
            if (value == null || value.isEmpty()) continue;
            String n = name.toLowerCase(Locale.US);
            if ("host".equals(n) || "connection".equals(n) || "content-length".equals(n)
                || "transfer-encoding".equals(n) || "accept-encoding".equals(n)
                || "range".equals(n) || n.startsWith("proxy-")) continue;
            builder.header(name, value);
        }
    }

    private boolean isMasterPlaylist(String text) {
        return text != null && text.contains("#EXT-X-STREAM-INF");
    }

    private String chooseVariant(String baseUrl, String master) throws IOException {
        String[] lines = master.split("\\r?\\n");
        String chosen = null;
        long chosenBandwidth = -1L;
        String lowest = null;
        long lowestBandwidth = Long.MAX_VALUE;
        long preferredMaximum = 4_500_000L;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
            Matcher matcher = BANDWIDTH.matcher(line);
            long bandwidth = matcher.find() ? Long.parseLong(matcher.group(1)) : 1_000_000L;
            int next = i + 1;
            while (next < lines.length && (lines[next].trim().isEmpty() || lines[next].trim().startsWith("#"))) next++;
            if (next >= lines.length) continue;
            String candidate = resolve(baseUrl, lines[next].trim());
            if (bandwidth < lowestBandwidth) {
                lowestBandwidth = bandwidth;
                lowest = candidate;
            }
            if (bandwidth <= preferredMaximum && bandwidth > chosenBandwidth) {
                chosenBandwidth = bandwidth;
                chosen = candidate;
            }
        }
        return chosen != null ? chosen : lowest;
    }

    private ParsedPlaylist parsePlaylist(String baseUrl, String body) throws IOException {
        ParsedPlaylist parsed = new ParsedPlaylist();
        String[] lines = body.split("\\r?\\n");
        List<String> pendingTags = new ArrayList<>();
        double pendingDuration = -1.0;
        String pendingRange = null;
        long sequence = 0L;
        boolean sawSequence = false;
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
                try {
                    sequence = Long.parseLong(line.substring(line.indexOf(':') + 1).trim());
                    sawSequence = true;
                } catch (NumberFormatException ignored) { }
                continue;
            }
            if (line.startsWith("#EXT-X-TARGETDURATION:")) {
                try { parsed.targetDuration = Double.parseDouble(line.substring(line.indexOf(':') + 1).trim()); }
                catch (NumberFormatException ignored) { }
                continue;
            }
            if ("#EXT-X-ENDLIST".equals(line)) {
                parsed.endList = true;
                continue;
            }
            if (line.startsWith("#EXTINF:")) {
                pendingTags.add(line);
                try {
                    String value = line.substring(8);
                    int comma = value.indexOf(',');
                    pendingDuration = Double.parseDouble(comma >= 0 ? value.substring(0, comma) : value);
                } catch (NumberFormatException ignored) {
                    pendingDuration = targetDuration;
                }
                continue;
            }
            if (line.startsWith("#EXT-X-BYTERANGE:")) {
                pendingRange = line.substring(line.indexOf(':') + 1).trim();
                continue;
            }
            if (line.startsWith("#")) {
                if (parsed.segments.isEmpty() && pendingDuration < 0.0
                    && (line.startsWith("#EXT-X-VERSION:")
                        || line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")
                        || line.startsWith("#EXT-X-PLAYLIST-TYPE:")
                        || line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:"))) {
                    parsed.globalTags.add(line);
                } else {
                    pendingTags.add(line);
                }
                continue;
            }
            String absolute = resolve(baseUrl, line);
            long segmentSequence = (sawSequence ? sequence : 0L) + parsed.segments.size();
            double duration = pendingDuration > 0.0 ? pendingDuration : parsed.targetDuration;
            parsed.segments.add(new Segment(segmentSequence, absolute, duration,
                new ArrayList<>(pendingTags), pendingRange, null, 0L));
            pendingTags.clear();
            pendingDuration = -1.0;
            pendingRange = null;
        }
        if (parsed.segments.isEmpty()) {
            throw new IOException("The HLS playlist contains no downloadable media segments.");
        }
        parsed.mediaSequence = parsed.segments.get(0).sequence;
        return parsed;
    }

    private File downloadSegment(Segment segment) throws IOException {
        String suffix = digest(segment.url + "|" + segment.sequence + "|" + segment.byteRange);
        File destination = new File(directory, "segment-" + segment.sequence + "-" + suffix + ".bin");
        if (destination.isFile() && destination.length() > 0L) return destination;
        File temporary = new File(directory, destination.getName() + ".part");
        Request.Builder builder = new Request.Builder().url(segment.url).get()
            .header("Accept-Encoding", "identity");
        applyHeaders(builder);
        if (segment.byteRange != null) {
            String range = segment.byteRange.trim();
            Matcher matcher = RANGE.matcher(range);
            if (!matcher.matches()) throw new IOException("Unsupported HLS byte range.");
            long length = Long.parseLong(matcher.group(1));
            long offset = matcher.group(2) == null ? 0L : Long.parseLong(matcher.group(2));
            builder.header("Range", "bytes=" + offset + "-" + (offset + length - 1L));
        }
        long bytes = 0L;
        try (Response response = client.newCall(builder.build()).execute()) {
            if (response.code() == 403 || response.code() == 451
                || response.code() == 404 || response.code() == 410) {
                throw new BufferHttpException(response.code(), "The media segment is not available.");
            }
            if (!response.isSuccessful()) throw new IOException("A media segment could not be downloaded.");
            ResponseBody body = response.body();
            if (body == null) throw new IOException("The media segment was empty.");
            try (InputStream input = body.byteStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (!running) throw new IOException("Buffering was cancelled.");
                    output.write(buffer, 0, read);
                    bytes += read;
                    if (bytes > 128L * 1024L * 1024L) throw new IOException("A single HLS segment exceeded the cache limit.");
                }
                output.flush();
            }
        }
        if (bytes <= 0L) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            throw new IOException("The media segment was empty.");
        }
        if (!temporary.renameTo(destination)) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            throw new IOException("Could not finalize the local media segment.");
        }
        return destination;
    }

    private void rebuildPlaylist(List<String> currentGlobalTags) {
        if (segments.isEmpty()) {
            localPlaylist = "";
            return;
        }
        List<Segment> snapshot = new ArrayList<>(segments.values());
        Collections.sort(snapshot, Comparator.comparingLong(s -> s.sequence));
        StringBuilder output = new StringBuilder(1024 + snapshot.size() * 180);
        output.append("#EXTM3U\n");
        for (String tag : currentGlobalTags) output.append(rewriteTag(tag)).append('\n');
        int actualTargetDuration = Math.max(1, (int) Math.ceil(targetDuration));
        for (Segment segment : snapshot) actualTargetDuration = Math.max(actualTargetDuration, (int) Math.ceil(segment.duration));
        output.append("#EXT-X-TARGETDURATION:").append(actualTargetDuration).append('\n');
        output.append("#EXT-X-MEDIA-SEQUENCE:").append(snapshot.get(0).sequence).append('\n');
        for (Segment segment : snapshot) {
            for (String tag : segment.tags) {
                if (tag.startsWith("#EXT-X-BYTERANGE:")) continue;
                output.append(rewriteTag(tag)).append('\n');
            }
            output.append("#EXTINF:").append(String.format(Locale.US, "%.3f", segment.duration)).append(",\n");
            output.append(localSegmentUrl(segment.url, segment.sequence)).append('\n');
        }
        if (endList) output.append("#EXT-X-ENDLIST\n");
        localPlaylist = output.toString();
    }

    private String rewriteTag(String tag) {
        Matcher matcher = URI_ATTRIBUTE.matcher(tag);
        StringBuffer output = new StringBuffer();
        while (matcher.find()) {
            String local = localResourceUrl(matcher.group(1));
            matcher.appendReplacement(output, Matcher.quoteReplacement("URI=\"" + local + "\""));
        }
        matcher.appendTail(output);
        return output.toString();
    }

    private String localSegmentUrl(String absoluteUrl, long sequence) {
        try {
            return localResourceUrl(absoluteUrl) + "&seq=" + sequence;
        } catch (Exception ignored) {
            return localResourceUrl(absoluteUrl);
        }
    }

    private String localResourceUrl(String reference) {
        try {
            String absolute = resolve(mediaPlaylistUrl, reference);
            return "http://127.0.0.1:" + localPort + "/resource/" + sessionId
                + "?url=" + URLEncoder.encode(absolute, "UTF-8");
        } catch (Exception ignored) {
            return "http://127.0.0.1:" + localPort + "/unsupported/" + sessionId;
        }
    }

    private String resolve(String baseUrl, String reference) throws IOException {
        try {
            return new URI(baseUrl).resolve(new URI(reference)).toString();
        } catch (Exception exception) {
            throw new IOException("An HLS playlist contains an invalid media URL.", exception);
        }
    }

    private String resourceKey(String url, long sequence) {
        return url + "|" + sequence;
    }

    private void recalculateBufferedDuration() {
        long total = 0L;
        for (Segment segment : segments.values()) total += Math.round(segment.duration * 1000.0);
        bufferedMillis = total;
    }

    private void recalculateHealth() {
        if (recentSpeedRatios.isEmpty()) {
            speedRatio = 1.0;
            healthy = true;
            return;
        }
        double total = 0.0;
        for (double ratio : recentSpeedRatios) total += ratio;
        speedRatio = total / recentSpeedRatios.size();
        healthy = recentSpeedRatios.size() < 3 || speedRatio >= 1.05;
    }

    private void pruneCache() {
        recalculateBufferedDuration();
        long bytes = 0L;
        for (Segment segment : segments.values()) bytes += segment.sizeBytes;
        while (segments.size() > 1 && (bufferedMillis > RETAIN_WINDOW_MS || bytes > MAX_CACHE_BYTES)) {
            Long oldest = segments.keySet().iterator().next();
            Segment removed = segments.remove(oldest);
            if (removed == null) break;
            bytes -= removed.sizeBytes;
            cachedResources.remove(resourceKey(removed.url, removed.sequence));
            //noinspection ResultOfMethodCallIgnored
            removed.file.delete();
            recalculateBufferedDuration();
        }
    }

    private void notifyListener() {
        Listener target = listener;
        if (target == null) return;
        Progress snapshot;
        synchronized (lock) {
            snapshot = new Progress(
                bufferedMillis, segments.size(), speedRatio, healthy, ready, failed, error, errorCode
            );
        }
        try { target.onProgress(snapshot); }
        catch (RuntimeException ignored) { }
    }

    private void fail(String kind, int code, String message) {
        failed = true;
        error = (kind == null ? "" : kind) + ":" + (message == null ? "" : message);
        errorCode = code;
        notifyListener();
    }

    private void sleep(long millis) throws InterruptedException {
        if (running) Thread.sleep(millis);
    }

    private String digest(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (int i = 0; i < 8; i++) result.append(String.format(Locale.US, "%02x", hash[i]));
            return result.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static final class BufferHttpException extends IOException {
        final int code;
        BufferHttpException(int code, String message) {
            super(message);
            this.code = code;
        }
    }
}
