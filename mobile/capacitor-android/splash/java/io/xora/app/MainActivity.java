package io.xora.app;

import android.animation.ObjectAnimator;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.TextView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1100L;
    private static final long SLOW_CONNECTION_MS = 6500L;
    private static final long RETRY_PROMPT_MS = 25000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean releaseSystemSplash = false;
    private boolean xoraReady = false;
    private View startupOverlay;
    private TextView statusText;
    private Button retryButton;
    private ObjectAnimator ringAnimator;

    private final Runnable releaseSplashTask = () -> {
        releaseSystemSplash = true;
        if (!xoraReady) setStatus("Connecting to XoraTV…");
    };

    private final Runnable slowConnectionTask = () -> {
        if (!xoraReady) setStatus("Waking up XoraTV… this can take a moment.");
    };

    private final Runnable retryPromptTask = () -> {
        if (!xoraReady && retryButton != null) {
            setStatus("Still connecting. Check your connection, then try again.");
            retryButton.setVisibility(View.VISIBLE);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !releaseSystemSplash);

        registerPlugin(XoraStartupPlugin.class);
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

        View ring = startupOverlay.findViewById(R.id.xora_startup_ring);
        ringAnimator = ObjectAnimator.ofFloat(ring, View.ROTATION, 0f, 360f);
        ringAnimator.setDuration(12000L);
        ringAnimator.setInterpolator(new LinearInterpolator());
        ringAnimator.setRepeatCount(ObjectAnimator.INFINITE);
        ringAnimator.start();
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
                        if (ringAnimator != null) ringAnimator.cancel();
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
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (ringAnimator != null) ringAnimator.cancel();
        super.onDestroy();
    }
}
