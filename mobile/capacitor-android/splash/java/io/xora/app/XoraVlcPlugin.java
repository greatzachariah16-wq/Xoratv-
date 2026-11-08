package io.xora.app;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
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

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.Credentials;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@CapacitorPlugin(name = "XoraVlc")
public class XoraVlcPlugin extends Plugin {
    private enum PlayerMode {
        PINNED, THEATER, FULLSCREEN, TABLET
    }

    private enum PlaybackState {
        IDLE,
        OFFLINE,
        CONNECTING,
        BUFFERING,
        PLAYING,
        ERR_REGION,
        ERR_CHANNEL_DOWN,
        ERR_TIMEOUT,
        ERR_UNKNOWN
    }

    private static volatile XoraVlcPlugin activeInstance;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<String> streamUrls = new ArrayList<>();
    private final ExecutorService probeExecutor = Executors.newSingleThreadExecutor();

    private FrameLayout rootContainer;
    private FrameLayout playerOverlay;
    private FrameLayout videoFrame;
    private VLCVideoLayout videoLayout;
    private LinearLayout controls;
    private LinearLayout topBar;
    private LinearLayout statusCard;
    private TextView statusIcon;
    private TextView statusText;
    private TextView offlineBanner;
    private TextView channelTitleText;
    private TextView liveBadge;
    private TextView playButton;
    private TextView muteButton;
    private TextView fullscreenButton;
    private TextView pipButton;
    private TextView closeButton;
    private Button retryButton;
    private View topScrim;
    private View bottomScrim;
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
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private OkHttpClient probeClient;
    private boolean audioFocusHeld;
    private boolean resumeAfterFocusGain;
    private boolean playingBeforeAppPause;

    private int currentStreamIndex;
    private int autoRetryCount;
    private boolean userPaused;
    private boolean isMuted;
    private boolean decoderFallbackAttempted;
    private boolean bufferingStallRestarted;
    private boolean resumeWhenOnline;
    private boolean networkUsable;
    private boolean pipRequested;
    private boolean pipMode;
    private boolean controlsVisible = true;
    private boolean userCloseRequested;
    private String currentChannelId = "";
    private String currentChannelTitle = "Live TV";
    private PlaybackState playbackState = PlaybackState.IDLE;
    private long playerGeneration;
    private long playbackAttemptGeneration;
    private long bufferingStartedAt;
    private Runnable streamStartupTimeout;
    private Runnable bufferingWatchdog;
    private Runnable retryRunnable;
    private Runnable controlsAutoHide;
    private PlayerMode mode = PlayerMode.PINNED;

    private final AudioManager.OnAudioFocusChangeListener audioFocusListener = change -> {
        mainHandler.post(() -> handleAudioFocusChange(change));
    };

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        registerNetworkCallback();
        refreshNetworkState();
        probeClient = buildProbeClient();
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getContext()
            .getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                mainHandler.post(() -> refreshNetworkState());
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                boolean validated = hasValidatedInternet(capabilities);
                mainHandler.post(() -> setNetworkUsable(validated));
            }

            @Override
            public void onLost(Network network) {
                mainHandler.post(() -> refreshNetworkState());
            }
        };

        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (RuntimeException ignored) {
            networkCallback = null;
        }
    }

    private void refreshNetworkState() {
        boolean usable = false;
        if (connectivityManager != null) {
            try {
                Network active = connectivityManager.getActiveNetwork();
                NetworkCapabilities capabilities = active == null
                    ? null
                    : connectivityManager.getNetworkCapabilities(active);
                usable = hasValidatedInternet(capabilities);
            } catch (SecurityException ignored) {
                usable = false;
            }
        }
        setNetworkUsable(usable);
    }

    private boolean hasValidatedInternet(NetworkCapabilities capabilities) {
        return capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private boolean isNetworkUsable() {
        return networkUsable;
    }

    private void setNetworkUsable(boolean usable) {
        boolean changed = networkUsable != usable;
        networkUsable = usable;
        if (!changed || streamUrls.isEmpty()) return;

        if (!usable) {
            clearRetry();
            clearBufferingWatchdog();
            resumeWhenOnline = !userPaused;
            if (mediaPlayer != null && mediaPlayer.isPlaying()) mediaPlayer.pause();
            setState(PlaybackState.OFFLINE);
            return;
        }

        if (playbackState == PlaybackState.OFFLINE && resumeWhenOnline && !userPaused) {
            resumeWhenOnline = false;
            autoRetryCount = 0;
            startCurrentStream(true);
        }
    }

    private OkHttpClient buildProbeClient() {
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .writeTimeout(4, TimeUnit.SECONDS)
            .callTimeout(4, TimeUnit.SECONDS);

        // The stream URL is already XoraTV's /api/tv/stream reverse-proxy URL.
        // Optional HTTP transport-proxy settings can be supplied in Android manifest
        // metadata without placing proxy credentials in JavaScript or the repository.
        try {
            ApplicationInfo info = getContext().getPackageManager().getApplicationInfo(
                getContext().getPackageName(),
                PackageManager.GET_META_DATA
            );
            Bundle metadata = info.metaData;
            if (metadata != null) {
                String host = metadata.getString("io.xora.app.HTTP_PROXY_HOST");
                int port = metadata.getInt("io.xora.app.HTTP_PROXY_PORT", 0);
                String username = metadata.getString("io.xora.app.HTTP_PROXY_USERNAME");
                String password = metadata.getString("io.xora.app.HTTP_PROXY_PASSWORD");
                if (host != null && !host.trim().isEmpty() && port > 0) {
                    builder.proxy(new Proxy(
                        Proxy.Type.HTTP,
                        new InetSocketAddress(host.trim(), port)
                    ));
                    builder.proxyAuthenticator((route, response) -> {
                        if (username == null || username.isEmpty()) return null;
                        if (response.request().header("Proxy-Authorization") != null) return null;
                        return response.request().newBuilder()
                            .header("Proxy-Authorization", Credentials.basic(
                                username,
                                password == null ? "" : password
                            ))
                            .build();
                    });
                }
            }
        } catch (Exception ignored) {
            // The Android system/default proxy is retained when no explicit proxy is configured.
        }
        return builder.build();
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
        }
        if (mediaPlayer != null && playingBeforeAppPause && !userPaused
            && isNetworkUsable() && !isActivityInPipMode()) {
            requestAudioFocus();
            mediaPlayer.play();
        }
        playingBeforeAppPause = false;
        updateControlLabels();
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
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // It may already have been unregistered by the operating system.
            }
        }
        networkCallback = null;
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
        emitPlaybackState(
            mediaPlayer != null && mediaPlayer.isPlaying(),
            playbackState == PlaybackState.CONNECTING || playbackState == PlaybackState.BUFFERING,
            isErrorState(playbackState),
            false
        );
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String fallbackUrl1 = call.getString("fallbackUrl1");
        String fallbackUrl2 = call.getString("fallbackUrl2");
        String requestedTitle = call.getString("title", "Live TV");
        String requestedChannelId = call.getString("channelId");

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

                currentChannelId = requestedChannelId == null
                    ? channelIdFromUrl(url)
                    : requestedChannelId;
                currentChannelTitle = requestedTitle == null || requestedTitle.trim().isEmpty()
                    ? "Live TV"
                    : requestedTitle.trim();
                currentStreamIndex = 0;
                autoRetryCount = 0;
                userPaused = false;
                isMuted = false;
                decoderFallbackAttempted = false;
                bufferingStallRestarted = false;
                playingBeforeAppPause = false;
                resumeWhenOnline = true;
                pipRequested = false;
                pipMode = false;

                createNativePlayerViews();
                refreshNetworkState();
                if (isNetworkUsable()) {
                    startCurrentStream(true);
                } else {
                    setState(PlaybackState.OFFLINE);
                }
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
            toggleFullscreenInternal();
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

    private String channelIdFromUrl(String value) {
        try {
            String id = Uri.parse(value).getQueryParameter("channel");
            return id == null ? "" : id;
        } catch (Exception ignored) {
            return "";
        }
    }

    private boolean isSecureUrl(String url) {
        if (url == null || url.trim().isEmpty()) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme());
    }

    // Keep decoder preferences isolated to the channel that needs software decoding.
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
        videoFrame.setClickable(true);
        videoFrame.setOnClickListener(view -> {
            if (!controlsVisible) showControls();
            else scheduleControlsAutoHide();
        });

        videoLayout = new VLCVideoLayout(getContext());
        videoFrame.addView(videoLayout, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        topScrim = new View(getContext());
        topScrim.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { 0xD9000000, 0x00000000 }
        ));
        videoFrame.addView(topScrim, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(86),
            Gravity.TOP
        ));

        bottomScrim = new View(getContext());
        bottomScrim.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.BOTTOM_TOP,
            new int[] { 0xDC000000, 0x00000000 }
        ));
        videoFrame.addView(bottomScrim, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(86),
            Gravity.BOTTOM
        ));

        topBar = new LinearLayout(getContext());
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(12), dp(9), dp(12), dp(8));

        channelTitleText = new TextView(getContext());
        channelTitleText.setText(currentChannelTitle);
        channelTitleText.setTextColor(Color.WHITE);
        channelTitleText.setTextSize(14);
        channelTitleText.setTypeface(null, android.graphics.Typeface.BOLD);
        channelTitleText.setSingleLine(true);
        channelTitleText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        channelTitleText.setMaxWidth(dp(230));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        topBar.addView(channelTitleText, titleParams);

        liveBadge = new TextView(getContext());
        liveBadge.setText("LIVE");
        liveBadge.setTextColor(Color.WHITE);
        liveBadge.setTextSize(9);
        liveBadge.setTypeface(null, android.graphics.Typeface.BOLD);
        liveBadge.setPadding(dp(8), dp(5), dp(8), dp(5));
        liveBadge.setBackground(roundedBackground(0xCCB5532F, dp(20)));
        topBar.addView(liveBadge);
        videoFrame.addView(topBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(56),
            Gravity.TOP
        ));

        offlineBanner = new TextView(getContext());
        offlineBanner.setText("You're offline. Playback resumes automatically.");
        offlineBanner.setTextColor(Color.WHITE);
        offlineBanner.setTextSize(10);
        offlineBanner.setGravity(Gravity.CENTER);
        offlineBanner.setPadding(dp(10), dp(6), dp(10), dp(6));
        offlineBanner.setBackground(roundedBackground(0xDD3A302A, dp(9)));
        offlineBanner.setVisibility(View.GONE);
        FrameLayout.LayoutParams offlineParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        offlineParams.setMargins(dp(12), dp(58), dp(12), 0);
        videoFrame.addView(offlineBanner, offlineParams);

        statusCard = new LinearLayout(getContext());
        statusCard.setOrientation(LinearLayout.VERTICAL);
        statusCard.setGravity(Gravity.CENTER);
        statusCard.setPadding(dp(16), dp(12), dp(16), dp(12));
        statusCard.setBackground(roundedBackground(0xD91A1715, dp(14)));

        statusIcon = new TextView(getContext());
        statusIcon.setTextColor(Color.WHITE);
        statusIcon.setTextSize(18);
        statusIcon.setGravity(Gravity.CENTER);
        statusCard.addView(statusIcon);

        statusText = new TextView(getContext());
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        statusText.setGravity(Gravity.CENTER);
        statusText.setSingleLine(true);
        statusText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        statusText.setPadding(dp(4), dp(5), dp(4), dp(2));
        statusCard.addView(statusText);

        retryButton = new Button(getContext());
        retryButton.setText("Retry");
        retryButton.setTextSize(11);
        retryButton.setAllCaps(false);
        retryButton.setMinHeight(dp(38));
        retryButton.setPadding(dp(18), 0, dp(18), 0);
        retryButton.setOnClickListener(view -> retryCurrentStream());
        statusCard.addView(retryButton);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        statusParams.setMargins(dp(18), dp(12), dp(18), dp(12));
        videoFrame.addView(statusCard, statusParams);

        controls = new LinearLayout(getContext());
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        controls.setPadding(dp(8), dp(7), dp(10), dp(7));
        playButton = addControl("Ⅱ", "Pause playback", controls, this::togglePlaybackInternal);
        muteButton = addControl("◖))", "Mute", controls, this::toggleMuteInternal);
        fullscreenButton = addControl("⛶", "Enter fullscreen", controls, this::toggleFullscreenInternal);
        pipButton = addControl("▣", "Picture in picture", controls, this::enterPictureInPictureInternal);
        closeButton = addControl("×", "Close player", controls, this::closeFromNativeControls);
        FrameLayout.LayoutParams controlParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(58),
            Gravity.BOTTOM
        );
        videoFrame.addView(controls, controlParams);

        playerOverlay.addView(videoFrame, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
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
        showControls();
    }

    private TextView addControl(String symbol, String description, LinearLayout parent, Runnable action) {
        TextView button = new TextView(getContext());
        button.setText(symbol);
        button.setTextColor(Color.WHITE);
        button.setTextSize(18);
        button.setGravity(Gravity.CENTER);
        button.setContentDescription(description);
        button.setFocusable(true);
        button.setClickable(true);
        button.setBackground(roundedBackground(0x55FFFFFF, dp(14)));
        button.setOnClickListener(view -> {
            action.run();
            showControls();
        });

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(44), dp(44));
        params.setMargins(dp(4), 0, dp(4), 0);
        parent.addView(button, params);
        return button;
    }

    private GradientDrawable roundedBackground(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(1), 0x44FFFFFF);
        return drawable;
    }

    private void showControls() {
        if (topBar == null || controls == null) return;
        controlsVisible = true;
        topBar.setVisibility(View.VISIBLE);
        controls.setVisibility(View.VISIBLE);
        if (topScrim != null) topScrim.setVisibility(View.VISIBLE);
        if (bottomScrim != null) bottomScrim.setVisibility(View.VISIBLE);
        scheduleControlsAutoHide();
    }

    private void scheduleControlsAutoHide() {
        if (controlsAutoHide != null) mainHandler.removeCallbacks(controlsAutoHide);
        controlsAutoHide = () -> {
            if (playbackState == PlaybackState.PLAYING && controls != null && !pipMode) {
                controlsVisible = false;
                controls.setVisibility(View.GONE);
                if (topBar != null) topBar.setVisibility(View.GONE);
                if (topScrim != null) topScrim.setVisibility(View.GONE);
                if (bottomScrim != null) bottomScrim.setVisibility(View.GONE);
            }
        };
        mainHandler.postDelayed(controlsAutoHide, 3000L);
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

    private void applyModeLayout() {
        if (playerOverlay == null || rootContainer == null || videoFrame == null) return;

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
            if (controls != null) controls.setVisibility(View.GONE);
            if (topBar != null) topBar.setVisibility(View.GONE);
            if (statusCard != null) statusCard.setVisibility(View.GONE);
            if (offlineBanner != null) offlineBanner.setVisibility(View.GONE);
            playerOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.TOP | Gravity.START
            ));
            videoFrame.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ));
            return;
        }

        if (controls != null) controls.setVisibility(controlsVisible ? View.VISIBLE : View.GONE);
        if (topBar != null) topBar.setVisibility(controlsVisible ? View.VISIBLE : View.GONE);
        if (topScrim != null) topScrim.setVisibility(controlsVisible ? View.VISIBLE : View.GONE);
        if (bottomScrim != null) bottomScrim.setVisibility(controlsVisible ? View.VISIBLE : View.GONE);
        if (offlineBanner != null && playbackState != PlaybackState.OFFLINE) offlineBanner.setVisibility(View.GONE);

        switch (mode) {
            case THEATER:
                videoHeight = Math.min(
                    Math.round(height * 0.56f),
                    Math.round(width * 0.76f)
                );
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
                videoHeight = Math.min(
                    Math.round(panelWidth * 9f / 16f),
                    Math.max(1, height)
                );
                overlayWidth = panelWidth;
                overlayHeight = height;
                setWebViewRegion(panelWidth, 0, Math.max(1, width - panelWidth), height);
                break;

            case PINNED:
            default:
                videoHeight = Math.round(width * 9f / 16f);
                videoHeight = Math.min(videoHeight, Math.max(1, height));
                overlayWidth = width;
                overlayHeight = videoHeight;
                setWebViewRegion(0, overlayHeight, width, Math.max(1, height - overlayHeight));
                break;
        }

        playerOverlay.setLayoutParams(new FrameLayout.LayoutParams(
            overlayWidth,
            overlayHeight,
            Gravity.TOP | Gravity.START
        ));

        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
            overlayWidth,
            videoHeight,
            mode == PlayerMode.TABLET ? Gravity.TOP | Gravity.CENTER_HORIZONTAL : Gravity.TOP | Gravity.START
        );
        videoFrame.setLayoutParams(videoParams);

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
            webView.setVisibility(View.VISIBLE);
        }
    }

    private void setWebViewVisibility(int visibility) {
        if (webView != null) webView.setVisibility(visibility);
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

    private void toggleFullscreenInternal() {
        if (playerOverlay == null || pipMode) return;
        mode = mode == PlayerMode.FULLSCREEN ? PlayerMode.PINNED : PlayerMode.FULLSCREEN;
        applyModeLayout();
        updateControlLabels();
        showControls();
    }

    private void togglePlaybackInternal() {
        if (streamUrls.isEmpty()) return;
        if (!isNetworkUsable()) {
            resumeWhenOnline = !userPaused;
            setState(PlaybackState.OFFLINE);
            return;
        }
        if (mediaPlayer == null || isErrorState(playbackState)) {
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
            if (isNetworkUsable()) {
                mediaPlayer.play();
                setState(PlaybackState.CONNECTING);
            } else {
                setState(PlaybackState.OFFLINE);
            }
        }
        updateControlLabels();
    }

    private void toggleMuteInternal() {
        isMuted = !isMuted;
        if (mediaPlayer != null) mediaPlayer.setVolume(isMuted ? 0 : 100);
        updateControlLabels();
        emitPlaybackState(
            mediaPlayer != null && mediaPlayer.isPlaying(),
            playbackState == PlaybackState.CONNECTING || playbackState == PlaybackState.BUFFERING,
            isErrorState(playbackState),
            false
        );
    }

    private void updateControlLabels() {
        if (playButton != null) {
            boolean playing = mediaPlayer != null && mediaPlayer.isPlaying();
            playButton.setText(playing ? "Ⅱ" : "▶");
            playButton.setContentDescription(playing ? "Pause playback" : "Play playback");
        }
        if (muteButton != null) {
            muteButton.setText(isMuted ? "◖×" : "◖))");
            muteButton.setContentDescription(isMuted ? "Unmute" : "Mute");
        }
        if (fullscreenButton != null) {
            fullscreenButton.setText(mode == PlayerMode.FULLSCREEN ? "↙" : "⛶");
            fullscreenButton.setContentDescription(mode == PlayerMode.FULLSCREEN ? "Exit fullscreen" : "Enter fullscreen");
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
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
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
            if (resumeAfterFocusGain && !userPaused && !isErrorState(playbackState)
                && isNetworkUsable()) {
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

        if (!isNetworkUsable()) {
            resumeWhenOnline = !userPaused;
            setState(PlaybackState.OFFLINE);
            return;
        }

        clearStartupTimeout();
        clearRetry();
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
        requestAudioFocus();
        setState(PlaybackState.CONNECTING);

        // Re-check just before play. Airplane mode must never reach libVLC.play().
        if (!isNetworkUsable()) {
            activePlayer.pause();
            setState(PlaybackState.OFFLINE);
            return;
        }
        activePlayer.play();

        Runnable timeout = () -> {
            if (!isCurrentPlayer(activePlayer, activePlayerGeneration, activeAttemptGeneration)) return;
            if (userPaused || isNetworkUsable() == false || playbackState == PlaybackState.PLAYING) return;
            probeAndSetError(selectedUrl, activePlayerGeneration, activeAttemptGeneration, true);
        };
        streamStartupTimeout = timeout;
        mainHandler.postDelayed(timeout, 25000L);
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

    private void clearBufferingWatchdog() {
        if (bufferingWatchdog != null) {
            mainHandler.removeCallbacks(bufferingWatchdog);
            bufferingWatchdog = null;
        }
        bufferingStartedAt = 0L;
    }

    private void clearRetry() {
        if (retryRunnable != null) {
            mainHandler.removeCallbacks(retryRunnable);
            retryRunnable = null;
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
            // A player may already have stopped while being replaced.
        }
    }

    private boolean tryNextStream() {
        if (mediaPlayer == null || userPaused || !isNetworkUsable()) return false;

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
        if (!isNetworkUsable()) {
            resumeWhenOnline = true;
            setState(PlaybackState.OFFLINE);
            return;
        }
        userPaused = false;
        playbackState = PlaybackState.IDLE;
        autoRetryCount = 0;
        decoderFallbackAttempted = false;
        bufferingStallRestarted = false;
        currentStreamIndex = 0;
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
                setState(PlaybackState.CONNECTING);
                break;

            case MediaPlayer.Event.Buffering:
                if (event.getBuffering() < 100f) {
                    setState(PlaybackState.BUFFERING);
                    startBufferingWatchdog(eventPlayer, eventPlayerGeneration, eventAttemptGeneration);
                }
                break;

            case MediaPlayer.Event.Playing:
                clearStartupTimeout();
                clearBufferingWatchdog();
                clearRetry();
                autoRetryCount = 0;
                bufferingStallRestarted = false;
                setState(PlaybackState.PLAYING);
                updateControlLabels();
                showControls();
                break;

            case MediaPlayer.Event.Paused:
                updateControlLabels();
                emitPlaybackState(false, false, false, false);
                break;

            case MediaPlayer.Event.Stopped:
                clearStartupTimeout();
                if (userPaused || !isNetworkUsable()) break;
                if (!tryNextStream()) {
                    probeAndSetError(
                        streamUrls.get(currentStreamIndex),
                        eventPlayerGeneration,
                        eventAttemptGeneration,
                        false
                    );
                }
                break;

            case MediaPlayer.Event.EncounteredError:
                clearStartupTimeout();
                clearBufferingWatchdog();
                if (userPaused || !isNetworkUsable()) {
                    if (!isNetworkUsable()) setState(PlaybackState.OFFLINE);
                    break;
                }
                if (!tryNextStream()) {
                    probeAndSetError(
                        streamUrls.get(currentStreamIndex),
                        eventPlayerGeneration,
                        eventAttemptGeneration,
                        false
                    );
                }
                break;

            default:
                break;
        }
    }

    private void startBufferingWatchdog(
        MediaPlayer eventPlayer,
        long eventPlayerGeneration,
        long eventAttemptGeneration
    ) {
        if (bufferingWatchdog != null || bufferingStartedAt > 0L) return;
        bufferingStartedAt = System.currentTimeMillis();
        bufferingWatchdog = () -> {
            bufferingWatchdog = null;
            bufferingStartedAt = 0L;
            if (!isCurrentPlayer(eventPlayer, eventPlayerGeneration, eventAttemptGeneration)
                || playbackState != PlaybackState.BUFFERING || userPaused) return;

            if (!isNetworkUsable()) {
                setState(PlaybackState.OFFLINE);
                return;
            }

            if (!bufferingStallRestarted) {
                bufferingStallRestarted = true;
                startCurrentStream(true);
            } else {
                probeAndSetError(
                    streamUrls.get(currentStreamIndex),
                    eventPlayerGeneration,
                    eventAttemptGeneration,
                    false
                );
            }
        };
        mainHandler.postDelayed(bufferingWatchdog, 15000L);
    }

    private void probeAndSetError(
        String url,
        long expectedPlayerGeneration,
        long expectedAttemptGeneration,
        boolean fromStartupTimeout
    ) {
        if (!isNetworkUsable()) {
            setState(PlaybackState.OFFLINE);
            return;
        }

        probeExecutor.execute(() -> {
            PlaybackState probeResult = probeUrl(url);
            mainHandler.post(() -> {
                if (expectedPlayerGeneration != playerGeneration
                    || expectedAttemptGeneration != playbackAttemptGeneration) return;
                if (!isNetworkUsable()) {
                    setState(PlaybackState.OFFLINE);
                    return;
                }
                setState(probeResult);
                if (probeResult == PlaybackState.ERR_TIMEOUT || probeResult == PlaybackState.ERR_UNKNOWN) {
                    scheduleAutoRetry();
                }
            });
        });
    }

    private PlaybackState probeUrl(String url) {
        if (probeClient == null) probeClient = buildProbeClient();
        Request request = new Request.Builder()
            .url(url)
            .get()
            .header("Range", "bytes=0-0")
            .build();

        try (Response response = probeClient.newCall(request).execute()) {
            int code = response.code();
            if (code == 403 || code == 451) return PlaybackState.ERR_REGION;
            if (code == 404 || code == 410) return PlaybackState.ERR_CHANNEL_DOWN;
            return PlaybackState.ERR_UNKNOWN;
        } catch (InterruptedIOException timeout) {
            return PlaybackState.ERR_TIMEOUT;
        } catch (IOException error) {
            return PlaybackState.ERR_UNKNOWN;
        } catch (RuntimeException error) {
            return PlaybackState.ERR_UNKNOWN;
        }
    }

    private void scheduleAutoRetry() {
        if (!isNetworkUsable() || userPaused || streamUrls.isEmpty()) return;
        if (autoRetryCount >= 3) return;
        clearRetry();

        final long[] delays = { 1000L, 2000L, 4000L };
        long delay = delays[autoRetryCount];
        autoRetryCount++;
        retryRunnable = () -> {
            retryRunnable = null;
            if (isNetworkUsable() && !userPaused) {
                startCurrentStream(true);
            }
        };
        mainHandler.postDelayed(retryRunnable, delay);
    }

    private void setState(PlaybackState next) {
        if (next == null) return;
        PlaybackState previous = playbackState;
        playbackState = next;

        if (statusCard != null) {
            boolean error = isErrorState(next);
            boolean showCard = next == PlaybackState.CONNECTING
                || next == PlaybackState.BUFFERING
                || error;
            statusCard.setVisibility(showCard ? View.VISIBLE : View.GONE);
            statusIcon.setText(stateIcon(next));
            statusText.setText(stateMessage(next));
            boolean showManualRetry = next == PlaybackState.ERR_REGION
                || next == PlaybackState.ERR_CHANNEL_DOWN
                || ((next == PlaybackState.ERR_TIMEOUT || next == PlaybackState.ERR_UNKNOWN)
                    && autoRetryCount >= 3);
            retryButton.setVisibility(showManualRetry ? View.VISIBLE : View.GONE);
            offlineBanner.setVisibility(next == PlaybackState.OFFLINE ? View.VISIBLE : View.GONE);
        }
        if (previous != next) {
            JSObject state = new JSObject();
            state.put("state", next.name());
            state.put("channelId", currentChannelId);
            state.put("message", stateMessage(next));
            notifyListeners("stateChanged", state);
        }

        emitPlaybackState(
            next == PlaybackState.PLAYING,
            next == PlaybackState.CONNECTING || next == PlaybackState.BUFFERING,
            isErrorState(next),
            false
        );
        updateControlLabels();
    }

    private String stateMessage(PlaybackState state) {
        switch (state) {
            case OFFLINE: return "You're offline. Playback resumes automatically.";
            case CONNECTING: return "Connecting to channel";
            case BUFFERING: return "Buffering";
            case PLAYING: return "";
            case ERR_REGION: return "Not available in your region";
            case ERR_CHANNEL_DOWN: return "Channel is offline";
            case ERR_TIMEOUT: return "Network too slow";
            case ERR_UNKNOWN: return "Unable to play this channel";
            case IDLE:
            default: return "";
        }
    }

    private String stateIcon(PlaybackState state) {
        switch (state) {
            case OFFLINE: return "⌁";
            case CONNECTING: return "◌";
            case BUFFERING: return "◌";
            case ERR_REGION: return "⊘";
            case ERR_CHANNEL_DOWN: return "⌁";
            case ERR_TIMEOUT: return "◷";
            case ERR_UNKNOWN: return "!";
            case PLAYING: return "▶";
            case IDLE:
            default: return "";
        }
    }

    private boolean isErrorState(PlaybackState state) {
        return state == PlaybackState.ERR_REGION
            || state == PlaybackState.ERR_CHANNEL_DOWN
            || state == PlaybackState.ERR_TIMEOUT
            || state == PlaybackState.ERR_UNKNOWN;
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

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private void closePlayerInternal(boolean notifyClosed) {
        final String closedChannelId = currentChannelId;
        playerGeneration++;
        playbackAttemptGeneration++;
        clearStartupTimeout();
        clearBufferingWatchdog();
        clearRetry();
        if (controlsAutoHide != null) mainHandler.removeCallbacks(controlsAutoHide);
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
        topBar = null;
        controls = null;
        statusCard = null;
        statusIcon = null;
        statusText = null;
        offlineBanner = null;
        channelTitleText = null;
        liveBadge = null;
        topScrim = null;
        bottomScrim = null;
        retryButton = null;
        playButton = null;
        muteButton = null;
        fullscreenButton = null;
        pipButton = null;
        closeButton = null;
        webView = null;
        webViewParent = null;
        originalWebViewParams = null;

        streamUrls.clear();
        currentStreamIndex = 0;
        currentChannelId = "";
        currentChannelTitle = "Live TV";
        userPaused = false;
        isMuted = false;
        decoderFallbackAttempted = false;
        bufferingStallRestarted = false;
        resumeWhenOnline = false;
        playingBeforeAppPause = false;
        pipRequested = false;
        pipMode = false;
        controlsVisible = true;
        playbackState = PlaybackState.IDLE;

        if (notifyClosed) {
            JSObject state = new JSObject();
            state.put("state", PlaybackState.IDLE.name());
            state.put("channelId", closedChannelId);
            state.put("message", "");
            notifyListeners("stateChanged", state);
            emitPlaybackState(false, false, false, true);
        }
    }
}
