package io.xora.app;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
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
    private LinearLayout controlsBar;
    private TextView statusText;
    private Button playPauseButton;
    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;

    private int currentStreamIndex;
    private boolean userPaused;
    private boolean playbackFailed;
    private boolean retryInProgress;
    private boolean softwareDecoderAttempted;
    private boolean playingBeforeAppPause;

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

    private final Runnable streamStartupTimeout = () -> {
        if (mediaPlayer == null || userPaused || playbackFailed || mediaPlayer.isPlaying()) return;
        if (!tryNextStream()) failPlayback();
    };

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
                retryInProgress = false;
                softwareDecoderAttempted = false;

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
        playerOverlay.addView(videoLayout, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        controlsBar = new LinearLayout(getContext());
        controlsBar.setGravity(Gravity.CENTER_VERTICAL);
        controlsBar.setOrientation(LinearLayout.HORIZONTAL);
        controlsBar.setPadding(dp(10), dp(4), dp(10), dp(4));
        controlsBar.setBackgroundColor(0x99000000);

        statusText = new TextView(getContext());
        statusText.setText("Loading…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        controlsBar.addView(statusText, new LinearLayout.LayoutParams(0, dp(44), 1f));

        playPauseButton = makeButton("Pause");
        playPauseButton.setOnClickListener(view -> togglePlayback());
        controlsBar.addView(playPauseButton);

        Button closeButton = makeButton("Close");
        closeButton.setOnClickListener(view -> closePlayerInternal(true));
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(40)
        );
        closeParams.leftMargin = dp(8);
        controlsBar.addView(closeButton, closeParams);

        FrameLayout.LayoutParams controlsParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        );
        playerOverlay.addView(controlsBar, controlsParams);

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
        mediaPlayer = new MediaPlayer(libVLC);
        mediaPlayer.attachViews(videoLayout, null, false, false);
        mediaPlayer.setEventListener(event -> {
            if (getActivity() == null) return;
            getActivity().runOnUiThread(() -> handlePlayerEvent(event));
        });
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

        float density = getResources().getDisplayMetrics().density;
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

    private void startCurrentStream(boolean hardwareDecoder) {
        if (mediaPlayer == null || currentStreamIndex >= streamUrls.size()) return;

        String selectedUrl = streamUrls.get(currentStreamIndex);
        Media media = new Media(libVLC, Uri.parse(selectedUrl));
        media.setHWDecoderEnabled(hardwareDecoder, false);
        media.addOption(":network-caching=4000");
        media.addOption(":live-caching=4000");
        media.addOption(":http-reconnect");
        mediaPlayer.setMedia(media);
        media.release();

        playbackFailed = false;
        if (statusText != null) {
            statusText.setText("Loading…");
            statusText.setVisibility(View.VISIBLE);
        }
        if (playPauseButton != null) playPauseButton.setText("Pause");

        mainHandler.removeCallbacks(streamStartupTimeout);
        mediaPlayer.play();
        mainHandler.postDelayed(streamStartupTimeout, 25000);
    }

    private boolean tryNextStream() {
        if (mediaPlayer == null || userPaused) return false;

        if (currentStreamIndex + 1 < streamUrls.size()) {
            currentStreamIndex++;
            softwareDecoderAttempted = false;
            switchStream(true);
            return true;
        }
        if (!softwareDecoderAttempted) {
            softwareDecoderAttempted = true;
            switchStream(false);
            return true;
        }
        return false;
    }

    private void switchStream(boolean hardwareDecoder) {
        retryInProgress = true;
        startCurrentStream(hardwareDecoder);
        mainHandler.postDelayed(() -> retryInProgress = false, 2500);
    }

    private void handlePlayerEvent(MediaPlayer.Event event) {
        if (mediaPlayer == null) return;
        switch (event.type) {
            case MediaPlayer.Event.Opening:
            case MediaPlayer.Event.Buffering:
                emitPlaybackState(false, true, false, false);
                break;
            case MediaPlayer.Event.Playing:
                mainHandler.removeCallbacks(streamStartupTimeout);
                playbackFailed = false;
                if (statusText != null) statusText.setVisibility(View.GONE);
                if (playPauseButton != null) playPauseButton.setText("Pause");
                emitPlaybackState(true, false, false, false);
                break;
            case MediaPlayer.Event.Paused:
                if (playPauseButton != null) playPauseButton.setText("Play");
                emitPlaybackState(false, false, false, false);
                break;
            case MediaPlayer.Event.Stopped:
                mainHandler.removeCallbacks(streamStartupTimeout);
                if (retryInProgress || userPaused) break;
                if (!tryNextStream()) failPlayback();
                break;
            case MediaPlayer.Event.EncounteredError:
                mainHandler.removeCallbacks(streamStartupTimeout);
                if (!tryNextStream()) failPlayback();
                break;
            default:
                break;
        }
    }

    private void togglePlayback() {
        if (mediaPlayer == null) return;
        if (playbackFailed) {
            currentStreamIndex = 0;
            softwareDecoderAttempted = false;
            userPaused = false;
            playbackFailed = false;
            startCurrentStream(true);
        } else if (mediaPlayer.isPlaying()) {
            userPaused = true;
            mediaPlayer.pause();
        } else {
            userPaused = false;
            mediaPlayer.play();
        }
    }

    private void failPlayback() {
        playbackFailed = true;
        mainHandler.removeCallbacks(streamStartupTimeout);
        if (statusText != null) {
            statusText.setText("Unable to play this channel. Please try again.");
            statusText.setVisibility(View.VISIBLE);
        }
        if (playPauseButton != null) playPauseButton.setText("Retry");
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

    private Button makeButton(String label) {
        Button button = new Button(getContext());
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setMinHeight(dp(40));
        button.setPadding(dp(12), 0, dp(12), 0);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFFB15232));
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void closePlayerInternal(boolean notifyClosed) {
        mainHandler.removeCallbacks(streamStartupTimeout);

        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.detachViews();
                mediaPlayer.release();
            } catch (Exception ignored) {
                // The player may already have been released during navigation.
            }
            mediaPlayer = null;
        }
        if (libVLC != null) {
            libVLC.release();
            libVLC = null;
        }
        if (playerOverlay != null && playerOverlay.getParent() instanceof FrameLayout) {
            ((FrameLayout) playerOverlay.getParent()).removeView(playerOverlay);
        }
        playerOverlay = null;
        videoLayout = null;
        controlsBar = null;
        statusText = null;
        playPauseButton = null;
        streamUrls.clear();
        currentStreamIndex = 0;
        userPaused = false;
        playbackFailed = false;
        retryInProgress = false;
        softwareDecoderAttempted = false;

        if (notifyClosed) emitPlaybackState(false, false, false, true);
    }
}
