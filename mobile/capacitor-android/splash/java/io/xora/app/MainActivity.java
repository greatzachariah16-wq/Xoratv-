package io.xora.app;

import android.animation.ObjectAnimator;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.TextView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1100L;
    private static final long SLOW_CONNECTION_MS = 6500L;
    private static final long RETRY_PROMPT_MS = 50000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean releaseSystemSplash = false;
    private boolean xoraReady = false;
    private View startupOverlay;
    private TextView statusText;
    private Button retryButton;
    private ObjectAnimator[] dotAnimators;

    private final Runnable releaseSplashTask = () -> {
        releaseSystemSplash = true;
        if (!xoraReady) setStatus("Connecting to XoraTV…");
    };

    private final Runnable slowConnectionTask = () -> {
        if (!xoraReady) setStatus("Waking up XoraTV… this can take a moment.");
    };

    private final Runnable retryPromptTask = () -> {
        if (!xoraReady && retryButton != null) {
            setStatus("Still connecting after 50 seconds. Check your connection, then try again.");
            retryButton.setVisibility(View.VISIBLE);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !releaseSystemSplash);

        registerPlugin(XoraStartupPlugin.class);
        registerPlugin(XoraVlcPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        // Add the app-owned loader before the first WebView frame can be shown.
        attachStartupOverlay();
        super.load();

        mainHandler.postDelayed(releaseSplashTask, SYSTEM_SPLASH_MS);
        mainHandler.postDelayed(slowConnectionTask, SLOW_CONNECTION_MS);
        mainHandler.postDelayed(retryPromptTask, RETRY_PROMPT_MS);
    }

    private void attachStartupOverlay() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null || startupOverlay != null) return;

        startupOverlay = LayoutInflater.from(this).inflate(
            R.layout.xora_startup_overlay,
            content,
            false
        );
        content.addView(
            startupOverlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        statusText = startupOverlay.findViewById(R.id.xora_startup_status);
        retryButton = startupOverlay.findViewById(R.id.xora_startup_retry);
        retryButton.setOnClickListener(view -> retryWebsite());

        startFacebookStyleDots();
    }

    private void startFacebookStyleDots() {
        int[] dotIds = {
            R.id.xora_loading_dot_1,
            R.id.xora_loading_dot_2,
            R.id.xora_loading_dot_3
        };
        dotAnimators = new ObjectAnimator[dotIds.length];
        for (int i = 0; i < dotIds.length; i++) {
            View dot = startupOverlay.findViewById(dotIds[i]);
            ObjectAnimator bounce = ObjectAnimator.ofFloat(
                dot,
                View.TRANSLATION_Y,
                0f,
                -dp(8),
                0f
            );
            bounce.setDuration(720L);
            bounce.setStartDelay(i * 140L);
            bounce.setRepeatCount(ObjectAnimator.INFINITE);
            bounce.setInterpolator(new AccelerateDecelerateInterpolator());
            dotAnimators[i] = bounce;
            bounce.start();
        }
    }

    private void cancelDotAnimations() {
        if (dotAnimators == null) return;
        for (ObjectAnimator animator : dotAnimators) {
            if (animator != null) animator.cancel();
        }
        dotAnimators = null;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    void onXoraWebAppReady() {
        runOnUiThread(() -> {
            xoraReady = true;
            releaseSystemSplash = true;
            mainHandler.removeCallbacks(slowConnectionTask);
            mainHandler.removeCallbacks(retryPromptTask);

            if (startupOverlay != null && startupOverlay.getVisibility() == View.VISIBLE) {
                startupOverlay.animate()
                    .alpha(0f)
                    .setDuration(320L)
                    .withEndAction(() -> {
                        startupOverlay.setVisibility(View.GONE);
                        startupOverlay.setAlpha(1f);
                        cancelDotAnimations();
                    })
                    .start();
            }
        });
    }

    private void retryWebsite() {
        xoraReady = false;
        retryButton.setVisibility(View.GONE);
        startupOverlay.setVisibility(View.VISIBLE);
        startupOverlay.setAlpha(1f);
        setStatus("Reconnecting to XoraTV…");

        mainHandler.removeCallbacks(slowConnectionTask);
        mainHandler.removeCallbacks(retryPromptTask);
        mainHandler.postDelayed(slowConnectionTask, SLOW_CONNECTION_MS);
        mainHandler.postDelayed(retryPromptTask, RETRY_PROMPT_MS);

        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) webView.reload();
        }
    }

    private void setStatus(String message) {
        if (statusText != null) statusText.setText(message);
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        cancelDotAnimations();
        super.onDestroy();
    }
}
