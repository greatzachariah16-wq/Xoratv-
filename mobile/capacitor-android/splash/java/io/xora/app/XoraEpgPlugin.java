package io.xora.app;

import android.util.Base64;

import com.getcapacitor.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.io.RandomAccessFile;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "XoraEpg")
public class XoraEpgPlugin extends Plugin {
    private static final String FILE_NAME = "xora-epg.xml";
    private static final int READ_CHUNK_MAX = 64 * 1024;
    private static final long MAX_EXPANDED_BYTES = 1024L * 1024L * 1024L;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(120, java.util.concurrent.TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build();

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String proxyUrl = call.getString("proxyUrl");
        final String etag = call.getString("etag");
        final String lastModified = call.getString("lastModified");
        final boolean force = call.getBoolean("force", false);
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("A valid HTTP or HTTPS XMLTV URL is required.");
            return;
        }
        EXECUTOR.execute(() -> {
            try {
                IOExceptionHolder lastError = new IOExceptionHolder();
                JSObject result = null;
                try {
                    result = downloadOne(url, etag, lastModified, force);
                } catch (Exception error) {
                    lastError.error = error;
                }
                if (result == null && proxyUrl != null && !proxyUrl.isEmpty() && !proxyUrl.equals(url)) {
                    try {
                        result = downloadOne(proxyUrl, etag, lastModified, force);
                    } catch (Exception error) {
                        lastError.error = error;
                    }
                }
                if (result == null) {
                    String message = lastError.error == null ? "XMLTV download failed." : lastError.error.getMessage();
                    call.reject(message == null ? "XMLTV download failed." : message);
                } else {
                    call.resolve(result);
                }
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "XMLTV download failed." : error.getMessage());
            }
        });
    }

    private JSObject downloadOne(String url, String etag, String lastModified, boolean force) throws Exception {
        Request.Builder requestBuilder = new Request.Builder()
            .url(url)
            .get()
            .header("Accept", "application/xml,text/xml,application/gzip,*/*;q=0.8")
            .header("Accept-Encoding", "identity")
            .header("User-Agent", "XoraTV-EPG/1.0");
        if (!force && etag != null && !etag.isEmpty()) requestBuilder.header("If-None-Match", etag);
        if (!force && lastModified != null && !lastModified.isEmpty()) requestBuilder.header("If-Modified-Since", lastModified);

        try (Response response = client.newCall(requestBuilder.build()).execute()) {
            if (response.code() == 304) {
                JSObject unchanged = new JSObject();
                unchanged.put("status", "not-modified");
                unchanged.put("etag", response.header("ETag", etag));
                unchanged.put("lastModified", response.header("Last-Modified", lastModified));
                unchanged.put("finalUrl", response.request().url().toString());
                return unchanged;
            }
            if (!response.isSuccessful()) throw new java.io.IOException("XMLTV server returned HTTP " + response.code());
            ResponseBody body = response.body();
            if (body == null) throw new java.io.IOException("XMLTV response was empty.");

            File cache = getContext().getCacheDir();
            File temporary = new File(cache, FILE_NAME + ".part");
            File target = new File(cache, FILE_NAME);
            long written = 0L;
            try (
                InputStream raw = new BufferedInputStream(body.byteStream(), 32 * 1024);
                PushbackInputStream input = new PushbackInputStream(raw, 2)
            ) {
                int first = input.read();
                int second = input.read();
                boolean gzip = first == 0x1f && second == 0x8b;
                if (second >= 0) input.unread(second);
                if (first >= 0) input.unread(first);
                InputStream decoded = gzip ? new GZIPInputStream(input, 32 * 1024) : input;
                try (InputStream source = decoded;
                     BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temporary), 32 * 1024)) {
                    byte[] buffer = new byte[32 * 1024];
                    int count;
                    while ((count = source.read(buffer)) != -1) {
                        written += count;
                        if (written > MAX_EXPANDED_BYTES) throw new java.io.IOException("XMLTV file exceeds the 1 GB safety limit.");
                        output.write(buffer, 0, count);
                    }
                    output.flush();
                }
            } catch (Exception error) {
                if (temporary.exists()) temporary.delete();
                throw error;
            }
            if (target.exists() && !target.delete()) {
                temporary.delete();
                throw new java.io.IOException("Could not replace the previous XMLTV cache.");
            }
            if (!temporary.renameTo(target)) {
                temporary.delete();
                throw new java.io.IOException("Could not finalise the XMLTV cache file.");
            }

            JSObject downloaded = new JSObject();
            downloaded.put("status", "downloaded");
            downloaded.put("fileName", FILE_NAME);
            downloaded.put("bytes", written);
            downloaded.put("etag", response.header("ETag"));
            downloaded.put("lastModified", response.header("Last-Modified"));
            downloaded.put("finalUrl", response.request().url().toString());
            downloaded.put("contentType", response.header("Content-Type"));
            return downloaded;
        }
    }

    @PluginMethod
    public void readChunk(PluginCall call) {
        String fileName = call.getString("fileName");
        long offset = call.getLong("offset", 0L);
        int length = call.getInt("length", READ_CHUNK_MAX);
        if (!FILE_NAME.equals(fileName) || offset < 0 || length < 1 || length > READ_CHUNK_MAX) {
            call.reject("Invalid XMLTV chunk request.");
            return;
        }
        EXECUTOR.execute(() -> {
            File file = new File(getContext().getCacheDir(), FILE_NAME);
            if (!file.exists()) {
                call.reject("Cached XMLTV file is missing.");
                return;
            }
            try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
                if (offset >= input.length()) {
                    JSObject empty = new JSObject();
                    empty.put("data", "");
                    empty.put("bytes", 0);
                    call.resolve(empty);
                    return;
                }
                input.seek(offset);
                byte[] buffer = new byte[(int) Math.min(length, input.length() - offset)];
                int count = input.read(buffer);
                if (count < 0) count = 0;
                byte[] actual = count == buffer.length ? buffer : java.util.Arrays.copyOf(buffer, count);
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(actual, Base64.NO_WRAP));
                result.put("bytes", count);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not read XMLTV cache: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String fileName = call.getString("fileName");
        if (!FILE_NAME.equals(fileName)) {
            call.reject("Invalid XMLTV cache file.");
            return;
        }
        File file = new File(getContext().getCacheDir(), FILE_NAME);
        if (file.exists()) file.delete();
        call.resolve();
    }

    private static final class IOExceptionHolder {
        Exception error;
    }
}
