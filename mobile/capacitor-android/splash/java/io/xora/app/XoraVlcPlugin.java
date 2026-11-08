package io.xora.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.Gravity;
import android.graphics.drawable.GradientDrawable.Orientation;
import android.text.TextUtils;
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
import java.net.Authenticator;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.URI;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.Credentials;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@CapacitorPlugin(name = "XoraVlc")
public class XoraVlcPlugin extends Plugin {
    private enum PlayerMode { PINNED, THEATER, FULLSCREEN, TABLET }
    private enum PlaybackState { IDLE, OFFLINE, CONNECTING, BUFFERING, PLAYING, ERR_REGION, ERR_CHANNEL_DOWN, ERR_TIMEOUT, ERR_UNKNOWN }

    private static volatile XoraVlcPlugin activeInstance;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<String> streamUrls = new ArrayList<>();
    private final ExecutorService probeExecutor = Executors.newSingleThreadExecutor();

    private FrameLayout rootContainer;
    private FrameLayout playerOverlay;
    private FrameLayout videoFrame;
    private VLCVideoLayout videoLayout;
    private LinearLayout topBar;
    private LinearLayout bottomBar;
    private LinearLayout statusCard;
    private TextView channelTitleView;
    private TextView statusIconView;
    private TextView statusMessageView;
    private TextView retryButton;
    private TextView offlineBanner;
    private TextView playButton;
    private TextView muteButton;
    private TextView fullscreenButton;
    private View.OnLayoutChangeListener rootLayoutListener;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile boolean networkUsable;
    private OkHttpClient probeClient;
    private PlaybackState playbackState = PlaybackState.IDLE;
    private String channelId = "";
    private String channelTitle = "Live TV";
    private String lastStreamUrl = "";
    private String lastStateMessage = "";
    private int retryCount;
    private boolean stallRestarted;
    private long bufferingStartedAt;
    private Runnable retryTask;
    private Runnable bufferingStallTask;
    private Runnable controlsHideTask;
    private static final long[] RETRY_DELAYS_MS = {1000L, 2000L, 4000L};

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
        if (getActivity() != null) {
            getActivity().setVolumeControlStream(AudioManager.STREAM_MUSIC);
        }
        registerConnectivityCallback();
    }

    private void registerConnectivityCallback() {
        connectivityManager = (ConnectivityManager) getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                updateNetworkFor(network);
            }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                updateNetworkUsable(capabilities);
            }
            @Override public void onLost(Network network) {
                mainHandler.post(() -> refreshNetworkState());
            }
        };
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception error) {
            android.util.Log.w("XoraVlc", "Could not register network callback", error);
        }
        refreshNetworkState();
    }

    private void updateNetworkFor(Network network) {
        if (connectivityManager == null) return;
        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
        updateNetworkUsable(capabilities);
    }

    private void updateNetworkUsable(NetworkCapabilities capabilities) {
        boolean usable = capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        mainHandler.post(() -> applyNetworkUsable(usable));
    }

    private void refreshNetworkState() {
        if (connectivityManager == null) {
            applyNetworkUsable(false);
            return;
        }
        Network active = connectivityManager.getActiveNetwork();
        NetworkCapabilities capabilities = active == null ? null : connectivityManager.getNetworkCapabilities(active);
        boolean usable = capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        applyNetworkUsable(usable);
    }

    private void applyNetworkUsable(boolean usable) {
        boolean changed = networkUsable != usable;
        networkUsable = usable;
        if (!usable && !streamUrls.isEmpty() && playbackState != PlaybackState.IDLE) {
            clearRetryTask();
            clearStartupTimeout();
            clearBufferingStallTask();
            if (mediaPlayer != null) {
                try { mediaPlayer.pause(); } catch (Exception ignored) { }
            }
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
        } else if (usable && changed && playbackState == PlaybackState.OFFLINE && !streamUrls.isEmpty()) {
            retryCount = 0;
            stallRestarted = false;
            if (userPaused) {
                setPlaybackState(PlaybackState.IDLE, "Playback paused", false);
            } else {
                startCurrentStream(true);
            }
        }
    }

    private void unregisterConnectivityCallback() {
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); }
            catch (Exception ignored) { }
        }
        networkCallback = null;
        connectivityManager = null;
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
        refreshNetworkState();
        if (pipRequested && !isActivityInPipMode()) {
            pipRequested = false;
            pipMode = false;
            restoreWebViewForNormalMode();
            applyModeLayout();
            emitLegacyPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
        }
        if (mediaPlayer != null && playingBeforeAppPause && !userPaused && !playbackFailed
            && !isActivityInPipMode()) {
            if (networkUsable) {
                requestAudioFocus();
                mediaPlayer.play();
            } else {
                setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            }
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
        unregisterConnectivityCallback();
        closePlayerInternal(false);
        if (activeInstance == this) activeInstance = null;
        mainHandler.removeCallbacksAndMessages(null);
        probeExecutor.shutdownNow();
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
        emitLegacyPlaybackState(
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
        String requestedChannelId = call.getString("channelId");
        String requestedTitle = call.getString("title");

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
                channelId = requestedChannelId == null || requestedChannelId.trim().isEmpty()
                    ? Uri.parse(url).getQueryParameter("channel") : requestedChannelId;
                if (channelId == null) channelId = "";
                channelTitle = requestedTitle == null || requestedTitle.trim().isEmpty() ? "Live TV" : requestedTitle;
                lastStreamUrl = url;
                userPaused = false;
                isMuted = false;
                playbackFailed = false;
                decoderFallbackAttempted = false;
                playingBeforeAppPause = false;
                pipRequested = false;
                pipMode = false;
                retryCount = 0;
                stallRestarted = false;

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
        topBar = new LinearLayout(getContext());
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(12), dp(7), dp(12), dp(16));
        topBar.setBackground(new GradientDrawable(Orientation.TOP_BOTTOM,
            new int[] {0xD9000000, 0x00000000}));
        channelTitleView = new TextView(getContext());
        channelTitleView.setText(channelTitle);
        channelTitleView.setTextColor(Color.WHITE);
        channelTitleView.setTextSize(13);
        channelTitleView.setTypeface(null, android.graphics.Typeface.BOLD);
        channelTitleView.setSingleLine(true);
        channelTitleView.setEllipsize(TextUtils.TruncateAt.END);
        topBar.addView(channelTitleView, new LinearLayout.LayoutParams(0, dp(32), 1f));
        TextView liveBadge = new TextView(getContext());
        liveBadge.setText("LIVE");
        liveBadge.setTextColor(Color.WHITE);
        liveBadge.setTextSize(9);
        liveBadge.setTypeface(null, android.graphics.Typeface.BOLD);
        liveBadge.setGravity(Gravity.CENTER);
        liveBadge.setPadding(dp(8), dp(5), dp(8), dp(5));
        liveBadge.setBackground(roundedBackground(0xD9B84832, dp(20)));
        topBar.addView(liveBadge, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(26)));

        bottomBar = new LinearLayout(getContext());
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setGravity(Gravity.CENTER);
        bottomBar.setPadding(dp(9), dp(18), dp(9), dp(6));
        bottomBar.setBackground(new GradientDrawable(Orientation.BOTTOM_TOP,
            new int[] {0xD9000000, 0x00000000}));
        playButton = addIconControl("Ⅱ", "Pause", bottomBar, this::togglePlaybackInternal);
        muteButton = addIconControl("♫", "Mute", bottomBar, this::toggleMuteInternal);
        fullscreenButton = addIconControl("⛶", "Fullscreen", bottomBar, this::toggleFullscreenInternal);
        addIconControl("▣", "Picture in picture", bottomBar, this::enterPictureInPictureInternal);
        addIconControl("×", "Close player", bottomBar, this::closeFromNativeControls);

        statusCard = new LinearLayout(getContext());
        statusCard.setOrientation(LinearLayout.HORIZONTAL);
        statusCard.setGravity(Gravity.CENTER);
        statusCard.setPadding(dp(13), dp(10), dp(13), dp(10));
        statusCard.setBackground(roundedBackground(0xE51B1715, dp(12)));
        statusIconView = new TextView(getContext());
        statusIconView.setText("↻");
        statusIconView.setTextColor(Color.WHITE);
        statusIconView.setTextSize(16);
        statusCard.addView(statusIconView, new LinearLayout.LayoutParams(dp(24), dp(24)));
        statusMessageView = new TextView(getContext());
        statusMessageView.setTextColor(Color.WHITE);
        statusMessageView.setTextSize(12);
        statusMessageView.setSingleLine(true);
        statusMessageView.setEllipsize(TextUtils.TruncateAt.END);
        statusCard.addView(statusMessageView, new LinearLayout.LayoutParams(0, dp(28), 1f));
        retryButton = new TextView(getContext());
        retryButton.setText("Retry");
        retryButton.setTextColor(0xFFFFDCCB);
        retryButton.setTextSize(12);
        retryButton.setGravity(Gravity.CENTER);
        retryButton.setPadding(dp(8), 0, dp(4), 0);
        retryButton.setOnClickListener(view -> retryCurrentStream());
        statusCard.addView(retryButton, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(44)));
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER);
        statusParams.setMargins(dp(18), 0, dp(18), 0);
        videoFrame.addView(statusCard, statusParams);

        offlineBanner = new TextView(getContext());
        offlineBanner.setText("You're offline. Playback resumes automatically.");
        offlineBanner.setTextColor(Color.WHITE);
        offlineBanner.setTextSize(10);
        offlineBanner.setGravity(Gravity.CENTER);
        offlineBanner.setSingleLine(true);
        offlineBanner.setPadding(dp(10), dp(5), dp(10), dp(5));
        offlineBanner.setBackground(roundedBackground(0xD91B1715, dp(8)));
        FrameLayout.LayoutParams offlineParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        offlineParams.topMargin = dp(56);
        videoFrame.addView(offlineBanner, offlineParams);
        offlineBanner.setVisibility(View.GONE);

        videoFrame.addView(topBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, dp(58), Gravity.TOP));
        videoFrame.addView(bottomBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, dp(66), Gravity.BOTTOM));
        videoFrame.setOnClickListener(view -> toggleControlsVisibility());

        playerOverlay.addView(videoFrame);
        rootContainer.addView(playerOverlay, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.START));

        rootLayoutListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (playerOverlay != null) applyModeLayout();
        };
        rootContainer.addOnLayoutChangeListener(rootLayoutListener);

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

    private TextView addIconControl(String glyph, String description, LinearLayout parent, Runnable action) {
        TextView button = new TextView(getContext());
        button.setText(glyph);
        button.setContentDescription(description);
        button.setTextColor(Color.WHITE);
        button.setTextSize(23);
        button.setGravity(Gravity.CENTER);
        button.setFocusable(true);
        button.setClickable(true);
        button.setBackground(roundedBackground(0x44FFFFFF, dp(12)));
        button.setOnClickListener(view -> {
            action.run();
            showControlsAndScheduleHide();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1f);
        params.setMargins(dp(4), 0, dp(4), 0);
        parent.addView(button, params);
        return button;
    }

    private void toggleControlsVisibility() {
        if (topBar == null || bottomBar == null) return;
        boolean visible = topBar.getVisibility() != View.VISIBLE;
        setControlsVisible(visible);
        if (visible) showControlsAndScheduleHide();
    }

    private void setControlsVisible(boolean visible) {
        int visibility = visible ? View.VISIBLE : View.GONE;
        if (topBar != null) topBar.setVisibility(visibility);
        if (bottomBar != null) bottomBar.setVisibility(visibility);
    }

    private void showControlsAndScheduleHide() {
        setControlsVisible(true);
        if (controlsHideTask != null) mainHandler.removeCallbacks(controlsHideTask);
        controlsHideTask = () -> setControlsVisible(false);
        mainHandler.postDelayed(controlsHideTask, 3000L);
    }

    private void clearControlsTask() {
        if (controlsHideTask != null) mainHandler.removeCallbacks(controlsHideTask);
        controlsHideTask = null;
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

        int panelWidth = width;
        int videoHeight;
        int overlayHeight;
        int overlayWidth;
        if (pipMode || isActivityInPipMode()) {
            setWebViewVisibility(View.GONE);
            setControlsVisible(false);
            if (statusCard != null) statusCard.setVisibility(View.GONE);
            if (offlineBanner != null) offlineBanner.setVisibility(View.GONE);
            playerOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.TOP | Gravity.START));
            videoFrame.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            return;
        }

        setControlsVisible(true);
        switch (mode) {
            case THEATER:
                videoHeight = Math.min(Math.round(height * 0.56f), Math.round(width * 0.76f));
                videoHeight = Math.max(videoHeight, Math.min(dp(220), height));
                overlayWidth = width;
                overlayHeight = Math.min(height, videoHeight);
                setWebViewRegion(0, overlayHeight, width, Math.max(1, height - overlayHeight));
                break;
            case FULLSCREEN:
                videoHeight = height;
                overlayWidth = width;
                overlayHeight = height;
                setWebViewVisibility(View.GONE);
                break;
            case TABLET:
                panelWidth = Math.max(dp(300), Math.round(width * 0.42f));
                panelWidth = Math.min(panelWidth, Math.round(width * 0.55f));
                videoHeight = Math.min(Math.round(panelWidth * 9f / 16f), height);
                overlayWidth = panelWidth;
                overlayHeight = height;
                setWebViewRegion(panelWidth, 0, Math.max(1, width - panelWidth), height);
                break;
            case PINNED:
            default:
                // Match the Live TV featured player target: min(420dp, 55vh).
                videoHeight = Math.min(dp(420), Math.round(height * 0.55f));
                videoHeight = Math.max(1, Math.min(videoHeight, height));
                overlayWidth = width;
                overlayHeight = videoHeight;
                setWebViewRegion(0, overlayHeight, width, Math.max(1, height - overlayHeight));
                break;
        }

        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            overlayWidth, overlayHeight, Gravity.TOP | Gravity.START);
        playerOverlay.setLayoutParams(overlayParams);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
            overlayWidth, videoHeight,
            mode == PlayerMode.TABLET ? Gravity.TOP | Gravity.CENTER_HORIZONTAL : Gravity.TOP | Gravity.START);
        videoFrame.setLayoutParams(videoParams);
        if (mode == PlayerMode.FULLSCREEN) enterImmersiveSystemUi();
        else restoreSystemUi();
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
        emitLegacyPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
    }

    private void togglePlaybackInternal() {
        if (streamUrls.isEmpty()) return;
        if (!networkUsable) {
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            return;
        }
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            userPaused = true;
            mediaPlayer.pause();
            updateControlLabels();
            setPlaybackState(PlaybackState.IDLE, "Playback paused", false);
        } else {
            userPaused = false;
            retryCount = 0;
            startCurrentStream(true);
        }
    }

    private void toggleMuteInternal() {
        isMuted = !isMuted;
        if (mediaPlayer != null) mediaPlayer.setVolume(isMuted ? 0 : 100);
        updateControlLabels();
        emitLegacyPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
    }

    private void toggleFullscreenInternal() {
        if (mode == PlayerMode.FULLSCREEN) mode = PlayerMode.PINNED;
        else mode = PlayerMode.FULLSCREEN;
        applyModeLayout();
        emitLegacyPlaybackState(mediaPlayer != null && mediaPlayer.isPlaying(), false, playbackFailed, false);
    }

    private void updateControlLabels() {
        if (playButton != null) {
            boolean playing = mediaPlayer != null && mediaPlayer.isPlaying();
            playButton.setText(playing ? "Ⅱ" : "▶");
            playButton.setContentDescription(playing ? "Pause" : "Play");
        }
        if (muteButton != null) {
            muteButton.setText(isMuted ? "🔇" : "♫");
            muteButton.setContentDescription(isMuted ? "Muted" : "Sound on");
        }
        if (fullscreenButton != null) {
            fullscreenButton.setText(mode == PlayerMode.FULLSCREEN ? "⛶" : "⛶");
            fullscreenButton.setContentDescription(mode == PlayerMode.FULLSCREEN ? "Exit fullscreen" : "Fullscreen");
        }
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
        if (videoLayout == null || currentStreamIndex >= streamUrls.size()) return;
        if (!networkUsable) {
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            return;
        }
        if (libVLC == null) {
            ArrayList<String> options = new ArrayList<>();
            options.add("--network-caching=4000");
            options.add("--live-caching=4000");
            options.add("--drop-late-frames");
            options.add("--skip-frames");
            libVLC = new LibVLC(getContext(), options);
        }
        clearStartupTimeout();
        clearRetryTask();
        clearBufferingStallTask();
        final long activePlayerGeneration = playerGeneration;
        final long activeAttemptGeneration = ++playbackAttemptGeneration;
        final String selectedUrl = streamUrls.get(currentStreamIndex);
        lastStreamUrl = selectedUrl;

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
                handlePlayerEvent(activePlayer, activePlayerGeneration, activeAttemptGeneration, event));
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
        setPlaybackState(PlaybackState.CONNECTING, "Connecting to channel…", false);
        requestAudioFocus();
        activePlayer.play();

        Runnable timeout = () -> {
            if (!isCurrentPlayer(activePlayer, activePlayerGeneration, activeAttemptGeneration)) return;
            if (userPaused || activePlayer.isPlaying() || playbackState == PlaybackState.OFFLINE) return;
            diagnoseAndRecover(PlaybackState.ERR_TIMEOUT, "Network too slow");
        };
        streamStartupTimeout = timeout;
        mainHandler.postDelayed(timeout, 25000L);
        updateControlLabels();
        showControlsAndScheduleHide();
    }

    private boolean isCurrentPlayer(MediaPlayer candidate, long generation, long attempt) {
        return candidate != null && candidate == mediaPlayer
            && generation == playerGeneration && attempt == playbackAttemptGeneration;
    }

    private void clearStartupTimeout() {
        if (streamStartupTimeout != null) mainHandler.removeCallbacks(streamStartupTimeout);
        streamStartupTimeout = null;
    }

    private void clearBufferingStallTask() {
        if (bufferingStallTask != null) mainHandler.removeCallbacks(bufferingStallTask);
        bufferingStallTask = null;
        bufferingStartedAt = 0L;
    }

    private void clearRetryTask() {
        if (retryTask != null) mainHandler.removeCallbacks(retryTask);
        retryTask = null;
    }

    private void releaseMediaPlayer(MediaPlayer player) {
        if (player == null) return;
        try {
            player.setEventListener(null);
            player.stop();
            player.detachViews();
            player.release();
        } catch (Exception ignored) {
            // A replaced stream may already have stopped.
        }
    }

    private void retryCurrentStream() {
        if (streamUrls.isEmpty() || videoLayout == null) return;
        if (!networkUsable) {
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            return;
        }
        retryCount = 0;
        userPaused = false;
        playbackFailed = false;
        currentStreamIndex = 0;
        stallRestarted = false;
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
                setPlaybackState(PlaybackState.CONNECTING, "Connecting to channel…", false);
                break;
            case MediaPlayer.Event.Buffering:
                if (event.getBuffering() < 100f) {
                    setPlaybackState(PlaybackState.BUFFERING, "Buffering…", false);
                    if (bufferingStallTask == null) {
                        bufferingStartedAt = android.os.SystemClock.elapsedRealtime();
                        bufferingStallTask = () -> {
                            bufferingStallTask = null;
                            if (!isCurrentPlayer(eventPlayer, eventPlayerGeneration, eventAttemptGeneration)
                                || playbackState == PlaybackState.OFFLINE) return;
                            if (!networkUsable) {
                                setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
                            } else if (!stallRestarted) {
                                stallRestarted = true;
                                startCurrentStream(true);
                            } else {
                                diagnoseAndRecover(PlaybackState.ERR_TIMEOUT, "Network too slow");
                            }
                        };
                        mainHandler.postDelayed(bufferingStallTask, 15000L);
                    }
                } else {
                    clearBufferingStallTask();
                }
                break;
            case MediaPlayer.Event.Playing:
                clearStartupTimeout();
                clearBufferingStallTask();
                clearRetryTask();
                retryCount = 0;
                stallRestarted = false;
                playbackFailed = false;
                setPlaybackState(PlaybackState.PLAYING, "Playing", false);
                updateControlLabels();
                break;
            case MediaPlayer.Event.Paused:
                updateControlLabels();
                emitLegacyPlaybackState(false, false, false, false);
                break;
            case MediaPlayer.Event.EncounteredError:
                clearStartupTimeout();
                clearBufferingStallTask();
                if (!userPaused) diagnoseAndRecover(PlaybackState.ERR_UNKNOWN, "Unable to play this channel");
                break;
            case MediaPlayer.Event.Stopped:
                clearStartupTimeout();
                break;
            default:
                break;
        }
    }

    private void diagnoseAndRecover(PlaybackState fallbackState, String fallbackMessage) {
        if (!networkUsable) {
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            return;
        }
        final String probeUrl = lastStreamUrl;
        final long probePlayerGeneration = playerGeneration;
        final long probeAttemptGeneration = playbackAttemptGeneration;
        if (probeUrl == null || probeUrl.trim().isEmpty()) {
            completeOrScheduleRetry(fallbackState, fallbackMessage);
            return;
        }
        probeExecutor.execute(() -> {
            PlaybackState detected = fallbackState;
            String message = fallbackMessage;
            try {
                Request request = new Request.Builder()
                    .url(probeUrl)
                    .header("Range", "bytes=0-0")
                    .get()
                    .build();
                try (Response response = getProbeClient().newCall(request).execute()) {
                    int code = response.code();
                    if (code == 403 || code == 451) {
                        detected = PlaybackState.ERR_REGION;
                        message = "Not available in your region";
                    } else if (code == 404 || code == 410) {
                        detected = PlaybackState.ERR_CHANNEL_DOWN;
                        message = "Channel is offline";
                    } else if (code == 408 || code == 504) {
                        detected = PlaybackState.ERR_TIMEOUT;
                        message = "Network too slow";
                    } else if (!response.isSuccessful() && code != 206) {
                        detected = PlaybackState.ERR_UNKNOWN;
                        message = "Unable to play this channel";
                    } else {
                        detected = fallbackState;
                        message = fallbackMessage;
                    }
                }
            } catch (InterruptedIOException timeout) {
                detected = PlaybackState.ERR_TIMEOUT;
                message = "Network too slow";
            } catch (Exception error) {
                detected = PlaybackState.ERR_UNKNOWN;
                message = "Unable to play this channel";
            }
            final PlaybackState finalState = detected;
            final String finalMessage = message;
            mainHandler.post(() -> {
                if (probePlayerGeneration != playerGeneration
                    || probeAttemptGeneration != playbackAttemptGeneration) return;
                completeOrScheduleRetry(finalState, finalMessage);
            });
        });
    }

    private OkHttpClient getProbeClient() {
        if (probeClient != null) return probeClient;
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .writeTimeout(4, TimeUnit.SECONDS)
            .callTimeout(4, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true);
        try {
            ProxySelector selector = ProxySelector.getDefault();
            if (selector != null && lastStreamUrl != null) {
                List<Proxy> proxies = selector.select(URI.create(lastStreamUrl));
                for (Proxy proxy : proxies) {
                    if (proxy != null && proxy.type() == Proxy.Type.HTTP) {
                        builder.proxy(proxy);
                        break;
                    }
                }
            }
        } catch (Exception ignored) {
            // OkHttp falls back to the platform's default route when no HTTP proxy is configured.
        }
        builder.proxyAuthenticator((route, response) -> {
            if (response.request().header("Proxy-Authorization") != null) return null;
            PasswordAuthentication credentials = Authenticator.requestPasswordAuthentication(
                route.address().url().host(),
                route.socketAddress().getAddress(),
                route.socketAddress().getPort(),
                "http",
                response.message(),
                "http",
                route.address().url().url(),
                Authenticator.RequestorType.PROXY
            );
            if (credentials == null) return null;
            return response.request().newBuilder()
                .header("Proxy-Authorization", Credentials.basic(
                    credentials.getUserName(), new String(credentials.getPassword())))
                .build();
        });
        probeClient = builder.build();
        return probeClient;
    }

    private void completeOrScheduleRetry(PlaybackState finalState, String message) {
        if (!networkUsable) {
            setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
            return;
        }
        if (finalState == PlaybackState.ERR_REGION || finalState == PlaybackState.ERR_CHANNEL_DOWN) {
            playbackFailed = true;
            setPlaybackState(finalState, message, false);
            updateControlLabels();
            return;
        }
        if (retryCount < RETRY_DELAYS_MS.length) {
            long delay = RETRY_DELAYS_MS[retryCount++];
            setPlaybackState(PlaybackState.CONNECTING, "Reconnecting…", false);
            clearRetryTask();
            retryTask = () -> {
                retryTask = null;
                if (!networkUsable) {
                    setPlaybackState(PlaybackState.OFFLINE, "You're offline. Playback resumes automatically.", false);
                    return;
                }
                if (currentStreamIndex + 1 < streamUrls.size()) {
                    currentStreamIndex++;
                    startCurrentStream(true);
                } else if (!decoderFallbackAttempted) {
                    decoderFallbackAttempted = true;
                    startCurrentStream(false);
                } else {
                    currentStreamIndex = 0;
                    decoderFallbackAttempted = false;
                    startCurrentStream(true);
                }
            };
            mainHandler.postDelayed(retryTask, delay);
        } else {
            playbackFailed = true;
            setPlaybackState(finalState, message, false);
            updateControlLabels();
        }
    }

    private void setPlaybackState(PlaybackState next, String message, boolean userClosed) {
        if (next == null) next = PlaybackState.ERR_UNKNOWN;
        String safeMessage = message == null ? "" : message;
        if (playbackState == next && lastStateMessage.equals(safeMessage) && !userClosed) return;
        playbackState = next;
        lastStateMessage = safeMessage;
        if (statusCard != null) {
            boolean visible = next != PlaybackState.PLAYING && next != PlaybackState.IDLE && next != PlaybackState.OFFLINE;
            statusCard.setVisibility(visible ? View.VISIBLE : View.GONE);
        }
        if (statusIconView != null) {
            String glyph = next == PlaybackState.CONNECTING ? "↻"
                : next == PlaybackState.BUFFERING ? "◌"
                : next == PlaybackState.ERR_REGION || next == PlaybackState.ERR_CHANNEL_DOWN
                    || next == PlaybackState.ERR_TIMEOUT || next == PlaybackState.ERR_UNKNOWN ? "!" : "•";
            statusIconView.setText(glyph);
        }
        if (statusMessageView != null) statusMessageView.setText(safeMessage);
        if (retryButton != null) {
            boolean canRetry = next == PlaybackState.ERR_REGION || next == PlaybackState.ERR_CHANNEL_DOWN
                || next == PlaybackState.ERR_TIMEOUT || next == PlaybackState.ERR_UNKNOWN;
            retryButton.setVisibility(canRetry ? View.VISIBLE : View.GONE);
        }
        if (offlineBanner != null) offlineBanner.setVisibility(next == PlaybackState.OFFLINE ? View.VISIBLE : View.GONE);

        JSObject event = new JSObject();
        event.put("state", next.name());
        event.put("channelId", channelId);
        event.put("message", safeMessage);
        if (userClosed) event.put("userClosed", true);
        notifyListeners("stateChanged", event);

        boolean playing = next == PlaybackState.PLAYING;
        boolean waiting = next == PlaybackState.CONNECTING || next == PlaybackState.BUFFERING;
        boolean failed = next == PlaybackState.ERR_REGION || next == PlaybackState.ERR_CHANNEL_DOWN
            || next == PlaybackState.ERR_TIMEOUT || next == PlaybackState.ERR_UNKNOWN;
        emitLegacyPlaybackState(playing, waiting, failed, next == PlaybackState.IDLE && userClosed);
    }

    private void emitLegacyPlaybackState(boolean playing, boolean waiting, boolean failed, boolean closed) {
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
        clearRetryTask();
        clearBufferingStallTask();
        clearControlsTask();
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
        if (notifyClosed) setPlaybackState(PlaybackState.IDLE, "Player closed", userCloseRequested);

        rootContainer = null;
        playerOverlay = null;
        videoFrame = null;
        videoLayout = null;
        topBar = null;
        bottomBar = null;
        statusCard = null;
        channelTitleView = null;
        statusIconView = null;
        statusMessageView = null;
        retryButton = null;
        offlineBanner = null;
        playButton = null;
        muteButton = null;
        fullscreenButton = null;
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
        retryCount = 0;
        stallRestarted = false;
        lastStreamUrl = "";
        channelTitle = "Live TV";
        channelId = "";
        playbackState = PlaybackState.IDLE;
        lastStateMessage = "";
    }
}