package io.xora.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

/** Native 16:9 LibVLC surface used by XoraTV's live channel pages. */
public class XoraVlcActivity extends Activity {
    public static final String EXTRA_URL = "xora.vlc.url";
    public static final String EXTRA_TITLE = "xora.vlc.title";
    public static final String EXTRA_FALLBACK_URL_1 = "xora.vlc.fallback1";
    public static final String EXTRA_FALLBACK_URL_2 = "xora.vlc.fallback2";

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private Button playPauseButton;
    private TextView statusText;
    private boolean userPaused;
    private boolean playbackFailed;
    private boolean retryInProgress;
    private boolean softwareDecoderAttempted;
    private int currentStreamIndex;
    private final ArrayList<String> streamUrls = new ArrayList<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable streamStartupTimeout = () -> {
        if (mediaPlayer == null || userPaused || playbackFailed || mediaPlayer.isPlaying()) return;
        Log.w("XoraLibVLC", "Candidate " + (currentStreamIndex + 1) + " timed out before playback started");
        if (!tryNextStream("This source took too long; trying another")) {
            playbackFailed = true;
            statusText.setText("This channel did not start. Try another channel or retry.");
            playPauseButton.setText("Retry");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN);

        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        String fallback1 = getIntent().getStringExtra(EXTRA_FALLBACK_URL_1);
        String fallback2 = getIntent().getStringExtra(EXTRA_FALLBACK_URL_2);
        if (url == null || !url.startsWith("https://")) {
            finish();
            return;
        }
        streamUrls.add(url);
        if (fallback1 != null && fallback1.startsWith("https://")) streamUrls.add(fallback1);
        if (fallback2 != null && fallback2.startsWith("https://")) streamUrls.add(fallback2);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int videoHeight = Math.round(screenWidth * 9f / 16f);
        VLCVideoLayout videoLayout = new VLCVideoLayout(this);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, videoHeight, Gravity.CENTER
        );
        root.addView(videoLayout, videoParams);

        LinearLayout topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(16), dp(8), dp(16), dp(8));
        topBar.setBackgroundColor(0x99000000);
        TextView titleView = new TextView(this);
        titleView.setText(title == null ? "XoraTV" : title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(16);
        titleView.setMaxLines(1);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        topBar.addView(titleView, new LinearLayout.LayoutParams(0, dp(44), 1f));
        Button closeButton = makeButton("Close");
        closeButton.setOnClickListener(view -> finish());
        topBar.addView(closeButton);
        root.addView(topBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP
        ));

        LinearLayout bottomBar = new LinearLayout(this);
        bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setPadding(dp(16), dp(8), dp(16), dp(18));
        bottomBar.setBackgroundColor(0x99000000);
        statusText = new TextView(this);
        statusText.setText("Connecting to stream…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        bottomBar.addView(statusText, new LinearLayout.LayoutParams(0, dp(48), 1f));
        playPauseButton = makeButton("Pause");
        playPauseButton.setOnClickListener(view -> {
            if (mediaPlayer == null) return;
            if (mediaPlayer.isPlaying()) {
                userPaused = true;
                mediaPlayer.pause();
            } else {
                userPaused = false;
                if (playbackFailed) {
                    currentStreamIndex = 0;
                    softwareDecoderAttempted = false;
                    playbackFailed = false;
                    startCurrentStream(true);
                } else {
                    mediaPlayer.play();
                }
            }
        });
        bottomBar.addView(playPauseButton);
        root.addView(bottomBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        ));

        try {
            ArrayList<String> options = new ArrayList<>();
            options.add("--network-caching=4000");
            options.add("--live-caching=4000");
            options.add("--drop-late-frames");
            options.add("--skip-frames");
            libVLC = new LibVLC(this, options);
            mediaPlayer = new MediaPlayer(libVLC);
            mediaPlayer.attachViews(videoLayout, null, false, false);
            mediaPlayer.setEventListener(event -> runOnUiThread(() -> {
                if (statusText == null || playPauseButton == null) return;
                switch (event.type) {
                    case MediaPlayer.Event.Opening:
                        playbackFailed = false;
                        statusText.setText("Opening source " + (currentStreamIndex + 1) + " of " + streamUrls.size() + "…");
                        break;
                    case MediaPlayer.Event.Buffering:
                        statusText.setText("Buffering " + Math.round(event.getBuffering()) + "% · source " + (currentStreamIndex + 1));
                        break;
                    case MediaPlayer.Event.Playing:
                        mainHandler.removeCallbacks(streamStartupTimeout);
                        playbackFailed = false;
                        statusText.setText("LIVE");
                        playPauseButton.setText("Pause");
                        break;
                    case MediaPlayer.Event.Paused:
                        statusText.setText("Paused");
                        playPauseButton.setText("Play");
                        break;
                    case MediaPlayer.Event.Stopped:
                        mainHandler.removeCallbacks(streamStartupTimeout);
                        if (retryInProgress || userPaused) break;
                        if (!playbackFailed && tryNextStream("This source stopped before playback")) break;
                        if (!playbackFailed) {
                            playbackFailed = true;
                            statusText.setText("Stream stopped before video started. All available sources were tried.");
                        }
                        playPauseButton.setText("Retry");
                        break;
                    case MediaPlayer.Event.EncounteredError:
                        mainHandler.removeCallbacks(streamStartupTimeout);
                        Log.e("XoraLibVLC", "Stream error on candidate " + (currentStreamIndex + 1) + " of " + streamUrls.size());
                        if (!tryNextStream("Source failed; trying another")) {
                            playbackFailed = true;
                            statusText.setText("Unable to play this channel. All sources and the software-decoder retry failed.");
                            playPauseButton.setText("Retry");
                        }
                        break;
                    default:
                        break;
                }
            }));
            startCurrentStream(true);
        } catch (Exception error) {
            playbackFailed = true;
            Log.e("XoraLibVLC", "Native player startup failed.", error);
            statusText.setText("VLC could not start this stream.");
            playPauseButton.setText("Retry");
        }
    }

    private void startCurrentStream(boolean hardwareDecoder) {
        if (mediaPlayer == null || currentStreamIndex >= streamUrls.size()) return;
        String selectedUrl = streamUrls.get(currentStreamIndex);
        Log.i("XoraLibVLC", "Opening candidate " + (currentStreamIndex + 1) + "/" + streamUrls.size() + " host=" + Uri.parse(selectedUrl).getHost() + " hw=" + hardwareDecoder);
        Media media = new Media(libVLC, Uri.parse(selectedUrl));
        media.setHWDecoderEnabled(hardwareDecoder, false);
        media.addOption(":network-caching=4000");
        media.addOption(":live-caching=4000");
        media.addOption(":http-reconnect");
        mediaPlayer.setMedia(media);
        media.release();
        mainHandler.removeCallbacks(streamStartupTimeout);
        mediaPlayer.play();
        // Do not leave the viewer on an endless buffering screen. Give each
        // ranked source 25 seconds, then move to the next candidate/decoder.
        mainHandler.postDelayed(streamStartupTimeout, 25000);
    }

    private boolean tryNextStream(String reason) {
        if (mediaPlayer == null || userPaused) return false;
        if (currentStreamIndex + 1 < streamUrls.size()) {
            currentStreamIndex++;
            softwareDecoderAttempted = false;
            switchStream(reason, true);
            return true;
        }
        if (!softwareDecoderAttempted) {
            softwareDecoderAttempted = true;
            switchStream("Retrying with software decoding…", false);
            return true;
        }
        return false;
    }

    private void switchStream(String message, boolean hardwareDecoder) {
        retryInProgress = true;
        playbackFailed = false;
        if (statusText != null) statusText.setText(message);
        if (playPauseButton != null) playPauseButton.setText("Connecting…");
        startCurrentStream(hardwareDecoder);
        mainHandler.postDelayed(() -> retryInProgress = false, 2500);
    }

    private Button makeButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFFB15232));
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onStop() {
        mainHandler.removeCallbacks(streamStartupTimeout);
        if (mediaPlayer != null && mediaPlayer.isPlaying()) mediaPlayer.pause();
        super.onStop();
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        if (mediaPlayer != null && !userPaused) {
            mediaPlayer.play();
            mainHandler.postDelayed(streamStartupTimeout, 25000);
        }
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacks(streamStartupTimeout);
        if (mediaPlayer != null) {
            mediaPlayer.stop();
            mediaPlayer.detachViews();
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (libVLC != null) {
            libVLC.release();
            libVLC = null;
        }
        super.onDestroy();
    }
}
