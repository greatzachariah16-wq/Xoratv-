package io.xora.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.coordinatorlayout.widget.CoordinatorLayout;

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
    private enum PlayerMode {
        PINNED, THEATER, FULLSCREEN, TABLET
    }

    private static volatile XoraVlcPlugin activeInstance;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<String> streamUrls = new ArrayList<>();

    private FrameLayout rootContainer;
    private FrameLayout playerOverlay;
    private FrameLayout videoFrame;
    private VLCVideoLayout videoLayout;
    private TextView statusText;
    private LinearLayout controls;
    private TextView playButton;
    private TextView muteButton;
    private TextView modeButton;
    private View.OnLayoutChangeListener rootLayoutListener;

    private WebView webView;
    private ViewGroup webViewParent;
    private ViewGroup.LayoutParams originalWebViewParams;
    private int originalWebViewVisibility = View.VISIBLE;
    private int originalSystemUiVisibility = -1;

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean audioFocusHeld;
    private boolean resumeAfterFocusGain;
    private boolean playingBeforeAppPause;

    private int currentStreamIndex;
    private boolean userPaused;
    private boolean isMuted;
    private boolean playbackFailed;
    private boolean decoderFallbackAttempted;
    private boolean pipRequested;
    private boolean pipMode;
    private boolean userCloseRequested;
    private long playerGeneration;
    private long playbackAttemptGeneration;
    private Runnable streamStartupTimeout;
    private PlayerMode mode = PlayerMode.PINNED;

    private final AudioManager.OnAudioFocusChangeListener audioFocusListener = change -> {
        mainHandler.post(() -> handleAudioFocusChange(change));
    };

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (mediaPlayer != null && mediaPlayer.isPlaying()
            && !pipRequested && !isActivityInPipMode()) {
            playingBeforeAppPause = true;
            mediaPlayer.pause();
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (pipRequested && !isActivityInPipMode()) {
            pipRequested = false;
            pipMode = false;
            restoreWebViewForNormalMode();
            applyModeLayout();
            emitPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
        }
        if (mediaPlayer != null && playingBeforeAppPause && !userPaused && !playbackFailed
            && !isActivityInPipMode()) {
            requestAudioFocus();
            mediaPlayer.play();
        }
        playingBeforeAppPause = false;
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        if (playerOverlay != null) {
            if (mode == PlayerMode.TABLET && newConfig.smallestScreenWidthDp < 600) {
                mode = PlayerMode.PINNED;
            }
            mainHandler.post(this::applyModeLayout);
        }
    }

    @Override
    protected void handleOnDestroy() {
        closePlayerInternal(false);
        if (activeInstance == this) activeInstance = null;
        mainHandler.removeCallbacksAndMessages(null);
        super.handleOnDestroy();
    }

    public static void dispatchPictureInPictureModeChanged(boolean inPictureInPictureMode) {
        XoraVlcPlugin plugin = activeInstance;
        if (plugin == null) return;
        plugin.mainHandler.post(() -> plugin.onPictureInPictureModeChanged(inPictureInPictureMode));
    }

    private void onPictureInPictureModeChanged(boolean inPictureInPictureMode) {
        pipMode = inPictureInPictureMode;
        if (inPictureInPictureMode) {
            pipRequested = true;
        } else if (pipRequested) {
            pipRequested = false;
            restoreWebViewForNormalMode();
        }
        applyModeLayout();
        emitPlaybackState(
            mediaPlayer != null && mediaPlayer.isPlaying(),
            false,
            playbackFailed,
            false
        );
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String fallbackUrl1 = call.getString("fallbackUrl1");
        String fallbackUrl2 = call.getString("fallbackUrl2");

        if (!isSecureUrl(url)) {
            call.reject("A secure stream URL is required.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                closePlayerInternal(false);
                streamUrls.clear();
                streamUrls.add(url);
                if (isSecureUrl(fallbackUrl1) && !streamUrls.contains(fallbackUrl1)) {
                    streamUrls.add(fallbackUrl1);
                }
                if (isSecureUrl(fallbackUrl2) && !streamUrls.contains(fallbackUrl2)) {
                    streamUrls.add(fallbackUrl2);
                }

                currentStreamIndex = 0;
                userPaused = false;
                isMuted = false;
                playbackFailed = false;
                decoderFallbackAttempted = false;
                playingBeforeAppPause = false;
                pipRequested = false;
                pipMode = false;

                createNativePlayerViews();
                startCurrentStream(true);
                call.resolve();
            } catch (Exception error) {
                closePlayerInternal(false);
                call.reject("Could not start this channel.", error);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            closePlayerInternal(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void togglePlayback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            togglePlaybackInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void toggleMute(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            toggleMuteInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void cycleMode(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cycleModeInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void retry(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            retryCurrentStream();
            call.resolve();
        });
    }

    @PluginMethod
    public void enterPictureInPicture(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean entered = enterPictureInPictureInternal();
            if (entered) call.resolve();
            else call.reject("Picture-in-picture is not available on this device.");
        });
    }

    private boolean isSecureUrl(String url) {
        if (url == null || url.trim().isEmpty()) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme());
    }

    // Retain the per-channel decoder exception. It must not affect other channels.
    private boolean prefersSoftwareDecoder(String streamUrl) {
        if (streamUrl == null) return false;
        String channel = Uri.parse(streamUrl).getQueryParameter("channel");
        return "tna-wrestling-pluto".equals(channel)
            || "wrestling-legends-tv".equals(channel);
    }

    private void createNativePlayerViews() {
        rootContainer = getActivity().findViewById(android.R.id.content);
        if (rootContainer == null) {
            throw new IllegalStateException("The Android player container is unavailable.");
        }

        webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || !(webView.getParent() instanceof ViewGroup)) {
            throw new IllegalStateException("The XoraTV WebView is unavailable.");
        }

        webViewParent = (ViewGroup) webView.getParent();
        originalWebViewParams = copyLayoutParams(webView.getLayoutParams());
        originalWebViewVisibility = webView.getVisibility();

        if (mode == PlayerMode.TABLET
            && getContext().getResources().getConfiguration().smallestScreenWidthDp < 600) {
            mode = PlayerMode.PINNED;
        }
        if (getContext().getResources().getConfiguration().smallestScreenWidthDp >= 600) {
            mode = PlayerMode.TABLET;
        } else {
            mode = PlayerMode.PINNED;
        }

        playerOverlay = new FrameLayout(getContext());
        playerOverlay.setBackgroundColor(Color.BLACK);
        playerOverlay.setElevation(dp(28));

        videoFrame = new FrameLayout(getContext());
        videoFrame.setBackgroundColor(Color.BLACK);
        videoLayout = new VLCVideoLayout(getContext());
        videoFrame.addView(videoLayout, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        playerOverlay.addView(videoFrame);

        statusText = new TextView(getContext());
        statusText.setText("Connecting to channel…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(dp(14), dp(9), dp(14), dp(9));
        statusText.setBackground(roundedBackground(0xB8000000, dp(10)));
        statusText.setClickable(true);
        statusText.setFocusable(true);
        statusText.setOnClickListener(view -> retryCurrentStream());
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        videoFrame.addView(statusText, statusParams);

        controls = new LinearLayout(getContext());
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(6), dp(5), dp(6), dp(5));
        controls.setBackgroundColor(0xF014101B);

        playButton = addControl("PAUSE", controls, this::togglePlaybackInternal);
        muteButton = addControl("MUTE", controls, this::toggleMuteInternal);
        modeButton = addControl("PINNED", controls, this::cycleModeInternal);
        addControl("PIP", controls, this::enterPictureInPictureInternal);
        addControl("CLOSE", controls, this::closeFromNativeControls);

        playerOverlay.addView(controls);
        rootContainer.addView(playerOverlay, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.START
        ));

        rootLayoutListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (playerOverlay != null) applyModeLayout();
        };
        rootContainer.addOnLayoutChangeListener(rootLayoutListener);

        ArrayList<String> options = new ArrayList<>();
        options.add("--network-caching=4000");
        options.add("--live-caching=4000");
        options.add("--drop-late-frames");
        options.add("--skip-frames");
        libVLC = new LibVLC(getContext(), options);

        playerGeneration++;
        applyModeLayout();
    }

    private ViewGroup.LayoutParams copyLayoutParams(ViewGroup.LayoutParams params) {
        if (params == null) {
            return new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
        }
        if (params instanceof CoordinatorLayout.LayoutParams) {
            return new CoordinatorLayout.LayoutParams((CoordinatorLayout.LayoutParams) params);
        }
        if (params instanceof FrameLayout.LayoutParams) {
            return new FrameLayout.LayoutParams((FrameLayout.LayoutParams) params);
        }
        if (params instanceof ViewGroup.MarginLayoutParams) {
            return new ViewGroup.MarginLayoutParams((ViewGroup.MarginLayoutParams) params);
        }
        return new ViewGroup.LayoutParams(params);
    }

    private TextView addControl(String label, LinearLayout parent, Runnable action) {
        TextView button = new TextView(getContext());
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(10);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(3), dp(8), dp(3), dp(8));
        button.setSingleLine(true);
        button.setFocusable(true);
        button.setClickable(true);
        button.setBackground(roundedBackground(0x33FFFFFF, dp(8)));
        button.setOnClickListener(view -> action.run());

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            0,
            dp(42),
            1f
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        parent.addView(button, params);
        return button;
    }

    private GradientDrawable roundedBackground(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(1), 0x33FFFFFF);
        return drawable;
    }

    private void applyModeLayout() {
        if (playerOverlay == null || rootContainer == null) return;

        int width = rootContainer.getWidth();
        int height = rootContainer.getHeight();
        if (width <= 0 || height <= 0) {
            width = getContext().getResources().getDisplayMetrics().widthPixels;
            height = getContext().getResources().getDisplayMetrics().heightPixels;
        }

        int controlsHeight = dp(54);
        int panelWidth = width;
        int videoHeight;
        int overlayHeight;
        int overlayWidth;
        int overlayLeft = 0;
        int overlayTop = 0;

        if (pipMode || isActivityInPipMode()) {
            setWebViewVisibility(View.GONE);
            controls.setVisibility(View.GONE);
            statusText.setVisibility(View.GONE);

            FrameLayout.LayoutParams pipOverlay = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.TOP | Gravity.START
            );
            playerOverlay.setLayoutParams(pipOverlay);
            videoFrame.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ));
            return;
        }

        controls.setVisibility(View.VISIBLE);

        switch (mode) {
            case THEATER:
                videoHeight = Math.min(
                    Math.round(height * 0.56f),
                    Math.round(width * 0.76f)
                );
                videoHeight = Math.max(videoHeight, Math.min(dp(220), height - controlsHeight));
                overlayWidth = width;
                overlayHeight = Math.min(height, videoHeight + controlsHeight);
                setWebViewRegion(0, overlayHeight, width, Math.max(1, height - overlayHeight));
                break;

            case FULLSCREEN:
                videoHeight = Math.max(1, height - controlsHeight);
                overlayWidth = width;
                overlayHeight = height;
                setWebViewVisibility(View.GONE);
                break;

            case TABLET:
                panelWidth = Math.max(dp(300), Math.round(width * 0.42f));
                panelWidth = Math.min(panelWidth, Math.round(width * 0.55f));
                videoHeight = Math.min(
                    Math.round(panelWidth * 9f / 16f),
                    Math.max(1, height - controlsHeight)
                );
                overlayWidth = panelWidth;
                overlayHeight = height;
                setWebViewRegion(panelWidth, 0, Math.max(1, width - panelWidth), height);
                break;

            case PINNED:
            default:
                videoHeight = Math.round(width * 9f / 16f);
                videoHeight = Math.min(videoHeight, Math.max(1, height - controlsHeight));
                overlayWidth = width;
                overlayHeight = Math.min(height, videoHeight + controlsHeight);
                setWebViewRegion(0, overlayHeight, width, Math.max(1, height - overlayHeight));
                break;
        }

        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            overlayWidth,
            overlayHeight,
            Gravity.TOP | Gravity.START
        );
        overlayParams.leftMargin = overlayLeft;
        overlayParams.topMargin = overlayTop;
        playerOverlay.setLayoutParams(overlayParams);

        FrameLayout.LayoutParams videoParams;
        if (mode == PlayerMode.TABLET) {
            videoParams = new FrameLayout.LayoutParams(
                overlayWidth,
                videoHeight,
                Gravity.TOP | Gravity.CENTER_HORIZONTAL
            );
        } else {
            videoParams = new FrameLayout.LayoutParams(
                overlayWidth,
                videoHeight,
                Gravity.TOP | Gravity.START
            );
        }
        videoFrame.setLayoutParams(videoParams);

        FrameLayout.LayoutParams controlParams = new FrameLayout.LayoutParams(
            overlayWidth,
            controlsHeight,
            Gravity.BOTTOM | Gravity.START
        );
        controls.setLayoutParams(controlParams);

        modeButton.setText(mode.name());
        updateControlLabels();
        if (mode == PlayerMode.FULLSCREEN) {
            enterImmersiveSystemUi();
        } else {
            restoreSystemUi();
        }
    }

    private void setWebViewRegion(int left, int top, int width, int height) {
        if (webView == null || webViewParent == null) return;

        if (webViewParent instanceof CoordinatorLayout
            && originalWebViewParams instanceof CoordinatorLayout.LayoutParams) {
            CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(
                (CoordinatorLayout.LayoutParams) originalWebViewParams
            );
            params.width = width;
            params.height = height;
            params.setMargins(left, top, 0, 0);
            webView.setLayoutParams(params);
            webView.setVisibility(View.VISIBLE);
        } else {
            // Do not force incompatible native layout params into an unknown host.
            webView.setVisibility(View.VISIBLE);
        }
    }

    private void setWebViewVisibility(int visibility) {
        if (webView == null) return;
        webView.setVisibility(visibility);
    }

    private void restoreWebViewForNormalMode() {
        if (webView == null) return;
        if (originalWebViewParams != null) {
            webView.setLayoutParams(copyLayoutParams(originalWebViewParams));
        }
        webView.setVisibility(originalWebViewVisibility);
    }

    private void enterImmersiveSystemUi() {
        if (getActivity() == null) return;
        View decor = getActivity().getWindow().getDecorView();
        if (originalSystemUiVisibility < 0) {
            originalSystemUiVisibility = decor.getSystemUiVisibility();
        }
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void restoreSystemUi() {
        if (getActivity() == null || originalSystemUiVisibility < 0) return;
        getActivity().getWindow().getDecorView().setSystemUiVisibility(originalSystemUiVisibility);
        originalSystemUiVisibility = -1;
    }

    private void cycleModeInternal() {
        if (playerOverlay == null || pipMode) return;

        boolean tablet = getContext().getResources().getConfiguration().smallestScreenWidthDp >= 600;
        switch (mode) {
            case PINNED:
                mode = PlayerMode.THEATER;
                break;
            case THEATER:
                mode = PlayerMode.FULLSCREEN;
                break;
            case FULLSCREEN:
                mode = tablet ? PlayerMode.TABLET : PlayerMode.PINNED;
                break;
            case TABLET:
            default:
                mode = PlayerMode.PINNED;
                break;
        }
        applyModeLayout();
        emitPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
    }

    private void togglePlaybackInternal() {
        if (mediaPlayer == null || playbackFailed) {
            retryCurrentStream();
            return;
        }
        if (mediaPlayer.isPlaying()) {
            userPaused = true;
            mediaPlayer.pause();
            emitPlaybackState(false, false, false, false);
        } else {
            userPaused = false;
            requestAudioFocus();
            mediaPlayer.play();
        }
        updateControlLabels();
    }

    private void toggleMuteInternal() {
        isMuted = !isMuted;
        if (mediaPlayer != null) mediaPlayer.setVolume(isMuted ? 0 : 100);
        updateControlLabels();
        emitPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
    }

    private void updateControlLabels() {
        if (playButton != null) {
            playButton.setText(mediaPlayer != null && mediaPlayer.isPlaying() ? "PAUSE" : "PLAY");
        }
        if (muteButton != null) muteButton.setText(isMuted ? "UNMUTE" : "MUTE");
        if (modeButton != null) modeButton.setText(mode.name());
    }

    private boolean enterPictureInPictureInternal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || mediaPlayer == null) return false;
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9))
                .build();
            pipRequested = true;
            boolean entered = getActivity().enterPictureInPictureMode(params);
            if (!entered) {
                pipRequested = false;
                return false;
            }
            pipMode = true;
            applyModeLayout();
            return true;
        } catch (Exception error) {
            pipRequested = false;
            return false;
        }
    }

    private boolean isActivityInPipMode() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getActivity() != null
            && getActivity().isInPictureInPictureMode();
    }

    private void requestAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
        }
        if (audioManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(audioFocusListener, mainHandler)
                    .setWillPauseWhenDucked(true)
                    .build();
            }
            audioFocusHeld = audioManager.requestAudioFocus(audioFocusRequest)
                == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            audioFocusHeld = audioManager.requestAudioFocus(
                audioFocusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
    }

    private void handleAudioFocusChange(int change) {
        if (mediaPlayer == null) return;

        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            mediaPlayer.setVolume(isMuted ? 0 : 100);
            if (resumeAfterFocusGain && !userPaused && !playbackFailed) {
                mediaPlayer.play();
            }
            resumeAfterFocusGain = false;
            updateControlLabels();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            mediaPlayer.setVolume(isMuted ? 0 : 35);
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            resumeAfterFocusGain = mediaPlayer.isPlaying() && !userPaused;
            mediaPlayer.pause();
            updateControlLabels();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
            resumeAfterFocusGain = false;
            mediaPlayer.pause();
            updateControlLabels();
        }
    }

    private void abandonAudioFocus() {
        if (audioManager != null && audioFocusHeld) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            } else {
                audioManager.abandonAudioFocus(audioFocusListener);
            }
        }
        audioFocusHeld = false;
        resumeAfterFocusGain = false;
    }

    private void startCurrentStream(boolean usePreferredDecoder) {
        if (libVLC == null || videoLayout == null || currentStreamIndex >= streamUrls.size()) return;

        clearStartupTimeout();
        final long activePlayerGeneration = playerGeneration;
        final long activeAttemptGeneration = ++playbackAttemptGeneration;
        final String selectedUrl = streamUrls.get(currentStreamIndex);

        MediaPlayer previousPlayer = mediaPlayer;
        mediaPlayer = null;
        releaseMediaPlayer(previousPlayer);

        final MediaPlayer activePlayer = new MediaPlayer(libVLC);
        activePlayer.attachViews(videoLayout, null, false, false);
        mediaPlayer = activePlayer;

        boolean preferSoftware = prefersSoftwareDecoder(selectedUrl);
        boolean useHardwareDecoder = preferSoftware ? !usePreferredDecoder : usePreferredDecoder;

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

        activePlayer.setVolume(isMuted ? 0 : 100);
        playbackFailed = false;
        setPlayerStatus("Connecting to channel…", true);
        requestAudioFocus();
        activePlayer.play();

        Runnable timeout = () -> {
            if (!isCurrentPlayer(activePlayer, activePlayerGeneration, activeAttemptGeneration)) return;
            if (userPaused || playbackFailed || activePlayer.isPlaying()) return;
            if (!tryNextStream()) failPlayback();
        };
        streamStartupTimeout = timeout;
        mainHandler.postDelayed(timeout, 25000);
        updateControlLabels();
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
            // The previous stream may already have stopped while it was replaced.
        }
    }

    private boolean tryNextStream() {
        if (mediaPlayer == null || userPaused || playbackFailed) return false;

        if (currentStreamIndex + 1 < streamUrls.size()) {
            currentStreamIndex++;
            decoderFallbackAttempted = false;
            startCurrentStream(true);
            return true;
        }

        if (!decoderFallbackAttempted) {
            decoderFallbackAttempted = true;
            startCurrentStream(false);
            return true;
        }
        return false;
    }

    private void retryCurrentStream() {
        if (streamUrls.isEmpty() || libVLC == null || videoLayout == null) return;
        userPaused = false;
        playbackFailed = false;
        currentStreamIndex = 0;
        decoderFallbackAttempted = false;
        startCurrentStream(true);
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
                setPlayerStatus("Connecting to channel…", true);
                emitPlaybackState(false, true, false, false);
                break;
            case MediaPlayer.Event.Buffering:
                setPlayerStatus("Buffering…", true);
                emitPlaybackState(false, true, false, false);
                break;
            case MediaPlayer.Event.Playing:
                clearStartupTimeout();
                playbackFailed = false;
                setPlayerStatus("", false);
                updateControlLabels();
                emitPlaybackState(true, false, false, false);
                break;
            case MediaPlayer.Event.Paused:
                updateControlLabels();
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

    private void setPlayerStatus(String message, boolean visible) {
        if (statusText == null) return;
        if (visible) {
            statusText.setText(message);
            statusText.setVisibility(View.VISIBLE);
        } else {
            statusText.setVisibility(View.GONE);
        }
    }

    private void failPlayback() {
        playbackFailed = true;
        clearStartupTimeout();
        setPlayerStatus("Unable to play this channel. Tap to retry.", true);
        updateControlLabels();
        emitPlaybackState(false, false, true, false);
    }

    private void emitPlaybackState(boolean playing, boolean waiting, boolean failed, boolean closed) {
        JSObject state = new JSObject();
        state.put("playing", playing);
        state.put("waiting", waiting);
        state.put("failed", failed);
        state.put("closed", closed);
        state.put("muted", isMuted);
        state.put("mode", mode.name().toLowerCase());
        state.put("pip", pipMode);
        state.put("userClosed", closed && userCloseRequested);
        notifyListeners("playbackState", state);
    }

    private void closeFromNativeControls() {
        userCloseRequested = true;
        closePlayerInternal(true);
        userCloseRequested = false;
    }

    private int dpValue(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private int dp(int value) {
        return dpValue(value);
    }

    private void closePlayerInternal(boolean notifyClosed) {
        playerGeneration++;
        playbackAttemptGeneration++;
        clearStartupTimeout();
        abandonAudioFocus();

        if (rootContainer != null && rootLayoutListener != null) {
            rootContainer.removeOnLayoutChangeListener(rootLayoutListener);
        }

        MediaPlayer previousPlayer = mediaPlayer;
        mediaPlayer = null;
        releaseMediaPlayer(previousPlayer);

        LibVLC previousLibVLC = libVLC;
        libVLC = null;
        if (previousLibVLC != null) previousLibVLC.release();

        restoreWebViewForNormalMode();
        restoreSystemUi();

        if (playerOverlay != null && playerOverlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) playerOverlay.getParent()).removeView(playerOverlay);
        }

        rootContainer = null;
        playerOverlay = null;
        videoFrame = null;
        videoLayout = null;
        statusText = null;
        controls = null;
        playButton = null;
        muteButton = null;
        modeButton = null;
        webView = null;
        webViewParent = null;
        originalWebViewParams = null;
        streamUrls.clear();
        currentStreamIndex = 0;
        userPaused = false;
        playbackFailed = false;
        decoderFallbackAttempted = false;
        playingBeforeAppPause = false;
        pipRequested = false;
        pipMode = false;
        isMuted = false;

        if (notifyClosed) emitPlaybackState(false, false, false, true);
    }
}
