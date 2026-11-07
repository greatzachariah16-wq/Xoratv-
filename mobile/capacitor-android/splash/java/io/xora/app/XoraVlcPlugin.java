package io.xora.app;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

@CapacitorPlugin(name = "XoraVlc")
public class XoraVlcPlugin extends Plugin {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<String> streamUrls = new ArrayList<>();

    private FrameLayout playerOverlay;
    private VLCVideoLayout videoLayout;
    private TextView statusText;
    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;

    private int currentStreamIndex;
    private boolean userPaused;
    private boolean playbackFailed;
    private boolean decoderFallbackAttempted;
    private boolean playingBeforeAppPause;
    private long playerGeneration;
    private long playbackAttemptGeneration;
    private Runnable streamStartupTimeout;

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            playingBeforeAppPause = true;
            mediaPlayer.pause();
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (mediaPlayer != null && playingBeforeAppPause && !userPaused && !playbackFailed) {
            mediaPlayer.play();
        }
        playingBeforeAppPause = false;
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String fallbackUrl1 = call.getString("fallbackUrl1");
        String fallbackUrl2 = call.getString("fallbackUrl2");
        JSObject bounds = call.getObject("bounds");

        if (!isSecureUrl(url)) {
            call.reject("A secure stream URL is required.");
            return;
        }
        if (bounds == null || bounds.optDouble("width", 0) <= 0 || bounds.optDouble("height", 0) <= 0) {
            call.reject("The player position is unavailable.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                closePlayerInternal(false);
                streamUrls.clear();
                streamUrls.add(url);
                if (isSecureUrl(fallbackUrl1) && !streamUrls.contains(fallbackUrl1)) streamUrls.add(fallbackUrl1);
                if (isSecureUrl(fallbackUrl2) && !streamUrls.contains(fallbackUrl2)) streamUrls.add(fallbackUrl2);
                currentStreamIndex = 0;
                userPaused = false;
                playbackFailed = false;
                decoderFallbackAttempted = false;
                playingBeforeAppPause = false;

                createInlinePlayer(bounds);
                startCurrentStream(true);
                call.resolve();
            } catch (Exception error) {
                closePlayerInternal(false);
                call.reject("Could not start this channel.", error);
            }
        });
    }

    @PluginMethod
    public void updateBounds(PluginCall call) {
        JSObject bounds = call.getObject("bounds");
        if (bounds == null) {
            call.reject("Player position is unavailable.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            applyBounds(bounds);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            closePlayerInternal(true);
            call.resolve();
        });
    }

    private boolean isSecureUrl(String url) {
        if (url == null || url.trim().isEmpty()) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme());
    }

    // Pluto wrestling feeds need the software decoder on affected Android devices.
    // Match only these fixed XSports channel IDs; all other channels keep the
    // existing hardware-first LibVLC behavior.
    private boolean prefersSoftwareDecoder(String streamUrl) {
        if (streamUrl == null) return false;
        String channel = Uri.parse(streamUrl).getQueryParameter("channel");
        return "tna-wrestling-pluto".equals(channel)
            || "wrestling-legends-tv".equals(channel);
    }

    private void createInlinePlayer(JSObject bounds) {
        FrameLayout content = getActivity().findViewById(android.R.id.content);
        if (content == null) throw new IllegalStateException("Player container is unavailable.");

        playerOverlay = new FrameLayout(getContext());
        playerOverlay.setBackgroundColor(Color.BLACK);
        playerOverlay.setElevation(dp(24));
        GradientDrawable outline = new GradientDrawable();
        outline.setColor(Color.BLACK);
        outline.setCornerRadius(dp(12));
        playerOverlay.setBackground(outline);
        playerOverlay.setClipToOutline(true);

        videoLayout = new VLCVideoLayout(getContext());
        GradientDrawable videoMask = new GradientDrawable();
        videoMask.setColor(Color.BLACK);
        videoMask.setCornerRadius(dp(12));
        videoLayout.setBackground(videoMask);
        videoLayout.setClipToOutline(true);
        playerOverlay.addView(videoLayout, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Keep status feedback inside the video frame without persistent controls.
        statusText = new TextView(getContext());
        statusText.setText("Loading…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(dp(12), dp(8), dp(12), dp(8));
        statusText.setBackgroundColor(0x66000000);
        statusText.setClickable(false);
        statusText.setFocusable(false);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        playerOverlay.addView(statusText, statusParams);

        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            dp((int) Math.round(bounds.optDouble("width", 0))),
            dp((int) Math.round(bounds.optDouble("height", 0)))
        );
        content.addView(playerOverlay, overlayParams);
        applyBounds(bounds);

        ArrayList<String> options = new ArrayList<>();
        options.add("--network-caching=4000");
        options.add("--live-caching=4000");
        options.add("--drop-late-frames");
        options.add("--skip-frames");
        libVLC = new LibVLC(getContext(), options);
        // Each stream attempt creates its own MediaPlayer. This prevents queued
        // events from a previous source from being mistaken for the next source.
        playerGeneration++;
    }

    private void applyBounds(JSObject bounds) {
        if (playerOverlay == null || getActivity() == null) return;

        FrameLayout content = getActivity().findViewById(android.R.id.content);
        WebView webView = getBridge().getWebView();
        if (content == null || webView == null) return;

        int[] webLocation = new int[2];
        int[] contentLocation = new int[2];
        webView.getLocationOnScreen(webLocation);
        content.getLocationOnScreen(contentLocation);

        float density = getContext().getResources().getDisplayMetrics().density;
        int left = webLocation[0] - contentLocation[0]
            + Math.round((float) bounds.optDouble("left", 0) * density);
        int top = webLocation[1] - contentLocation[1]
            + Math.round((float) bounds.optDouble("top", 0) * density);
        int width = Math.max(1, Math.round((float) bounds.optDouble("width", 1) * density));
        int height = Math.max(1, Math.round((float) bounds.optDouble("height", 1) * density));

        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) playerOverlay.getLayoutParams();
        params.width = width;
        params.height = height;
        params.leftMargin = left;
        params.topMargin = top;
        params.gravity = Gravity.TOP | Gravity.LEFT;
        playerOverlay.setLayoutParams(params);
        playerOverlay.setVisibility(bounds.optBoolean("visible", true) ? View.VISIBLE : View.INVISIBLE);
    }

    private void startCurrentStream(boolean usePreferredDecoder) {
        if (libVLC == null || videoLayout == null || currentStreamIndex >= streamUrls.size()) return;

        clearStartupTimeout();
        final long activePlayerGeneration = playerGeneration;
        final long activeAttemptGeneration = ++playbackAttemptGeneration;
        final String selectedUrl = streamUrls.get(currentStreamIndex);

        // Detach the previous attempt before releasing it. A delayed callback from
        // that player is rejected by both player identity and generation checks.
        MediaPlayer previousPlayer = mediaPlayer;
        mediaPlayer = null;
        releaseMediaPlayer(previousPlayer);

        final MediaPlayer activePlayer = new MediaPlayer(libVLC);
        activePlayer.attachViews(videoLayout, null, false, false);
        mediaPlayer = activePlayer;

        boolean preferSoftwareDecoder = prefersSoftwareDecoder(selectedUrl);
        boolean useHardwareDecoder = preferSoftwareDecoder
            ? !usePreferredDecoder
            : usePreferredDecoder;

        activePlayer.setEventListener(event -> {
            if (getActivity() == null) return;
            getActivity().runOnUiThread(() ->
                handlePlayerEvent(activePlayer, activePlayerGeneration, activeAttemptGeneration, event)
            );
        });

        Media media = new Media(libVLC, Uri.parse(selectedUrl));
        media.setHWDecoderEnabled(useHardwareDecoder, false);
        media.addOption(":network-caching=4000");
        media.addOption(":live-caching=4000");
        media.addOption(":http-reconnect");
        activePlayer.setMedia(media);
        media.release();

        playbackFailed = false;
        if (statusText != null) {
            statusText.setText("Loading…");
            statusText.setVisibility(View.VISIBLE);
        }

        activePlayer.play();
        Runnable timeout = () -> {
            if (!isCurrentPlayer(activePlayer, activePlayerGeneration, activeAttemptGeneration)) return;
            if (userPaused || playbackFailed || activePlayer.isPlaying()) return;
            if (!tryNextStream()) failPlayback();
        };
        streamStartupTimeout = timeout;
        mainHandler.postDelayed(timeout, 25000);
    }

    private boolean isCurrentPlayer(
        MediaPlayer candidate,
        long candidatePlayerGeneration,
        long candidateAttemptGeneration
    ) {
        return candidate != null
            && candidate == mediaPlayer
            && candidatePlayerGeneration == playerGeneration
            && candidateAttemptGeneration == playbackAttemptGeneration;
    }

    private void clearStartupTimeout() {
        if (streamStartupTimeout != null) {
            mainHandler.removeCallbacks(streamStartupTimeout);
            streamStartupTimeout = null;
        }
    }

    private void releaseMediaPlayer(MediaPlayer player) {
        if (player == null) return;
        try {
            player.setEventListener(null);
            player.stop();
            player.detachViews();
            player.release();
        } catch (Exception ignored) {
            // The attempt may already have stopped while its source was replaced.
        }
    }

    private boolean tryNextStream() {
        if (mediaPlayer == null || userPaused || playbackFailed) return false;

        if (currentStreamIndex + 1 < streamUrls.size()) {
            currentStreamIndex++;
            decoderFallbackAttempted = false;
            switchStream(true);
            return true;
        }

        // Try the opposite decoder once for the current source. Pluto wrestling
        // channels prefer software; every other channel keeps hardware-first.
        if (!decoderFallbackAttempted) {
            decoderFallbackAttempted = true;
            switchStream(false);
            return true;
        }
        return false;
    }

    private void switchStream(boolean usePreferredDecoder) {
        startCurrentStream(usePreferredDecoder);
    }

    private void handlePlayerEvent(
        MediaPlayer eventPlayer,
        long eventPlayerGeneration,
        long eventAttemptGeneration,
        MediaPlayer.Event event
    ) {
        if (!isCurrentPlayer(eventPlayer, eventPlayerGeneration, eventAttemptGeneration)) return;

        switch (event.type) {
            case MediaPlayer.Event.Opening:
            case MediaPlayer.Event.Buffering:
                emitPlaybackState(false, true, false, false);
                break;
            case MediaPlayer.Event.Playing:
                clearStartupTimeout();
                playbackFailed = false;
                if (statusText != null) statusText.setVisibility(View.GONE);
                emitPlaybackState(true, false, false, false);
                break;
            case MediaPlayer.Event.Paused:
                emitPlaybackState(false, false, false, false);
                break;
            case MediaPlayer.Event.Stopped:
            case MediaPlayer.Event.EncounteredError:
                clearStartupTimeout();
                if (userPaused) break;
                if (!tryNextStream()) failPlayback();
                break;
            default:
                break;
        }
    }

    private void failPlayback() {
        playbackFailed = true;
        clearStartupTimeout();
        if (statusText != null) {
            statusText.setText("Unable to play this channel. Please try again.");
            statusText.setVisibility(View.VISIBLE);
        }
        emitPlaybackState(false, false, true, false);
    }

    private void emitPlaybackState(boolean playing, boolean waiting, boolean failed, boolean closed) {
        JSObject state = new JSObject();
        state.put("playing", playing);
        state.put("waiting", waiting);
        state.put("failed", failed);
        state.put("closed", closed);
        notifyListeners("playbackState", state);
    }

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private void closePlayerInternal(boolean notifyClosed) {
        // Invalidate every queued event/timeout before stopping native resources.
        playerGeneration++;
        playbackAttemptGeneration++;
        clearStartupTimeout();

        MediaPlayer previousPlayer = mediaPlayer;
        mediaPlayer = null;
        releaseMediaPlayer(previousPlayer);

        LibVLC previousLibVLC = libVLC;
        libVLC = null;
        if (previousLibVLC != null) previousLibVLC.release();

        if (playerOverlay != null && playerOverlay.getParent() instanceof FrameLayout) {
            ((FrameLayout) playerOverlay.getParent()).removeView(playerOverlay);
        }
        playerOverlay = null;
        videoLayout = null;
        statusText = null;
        streamUrls.clear();
        currentStreamIndex = 0;
        userPaused = false;
        playbackFailed = false;
        decoderFallbackAttempted = false;
        playingBeforeAppPause = false;

        if (notifyClosed) emitPlaybackState(false, false, false, true);
    }
}
