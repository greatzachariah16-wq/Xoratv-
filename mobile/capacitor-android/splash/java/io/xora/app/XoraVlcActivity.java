package io.xora.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
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

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private Button playPauseButton;
    private TextView statusText;
    private boolean userPaused;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN);

        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (url == null || !url.startsWith("https://")) {
            finish();
            return;
        }

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
                mediaPlayer.play();
            }
        });
        bottomBar.addView(playPauseButton);
        root.addView(bottomBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        ));

        try {
            ArrayList<String> options = new ArrayList<>();
            options.add("--network-caching=1800");
            options.add("--live-caching=1800");
            options.add("--drop-late-frames");
            options.add("--skip-frames");
            libVLC = new LibVLC(this, options);
            mediaPlayer = new MediaPlayer(libVLC);
            mediaPlayer.attachViews(videoLayout, null, false, false);
            mediaPlayer.setEventListener(event -> runOnUiThread(() -> {
                if (statusText == null || playPauseButton == null) return;
                switch (event.type) {
                    case MediaPlayer.Event.Opening:
                        statusText.setText("Opening stream…");
                        break;
                    case MediaPlayer.Event.Buffering:
                        statusText.setText("Buffering " + Math.round(event.getBuffering()) + "%");
                        break;
                    case MediaPlayer.Event.Playing:
                        statusText.setText("LIVE");
                        playPauseButton.setText("Pause");
                        break;
                    case MediaPlayer.Event.Paused:
                        statusText.setText("Paused");
                        playPauseButton.setText("Play");
                        break;
                    case MediaPlayer.Event.Stopped:
                        statusText.setText("Stopped");
                        playPauseButton.setText("Play");
                        break;
                    case MediaPlayer.Event.EncounteredError:
                        statusText.setText("This stream could not be played.");
                        break;
                    default:
                        break;
                }
            }));
            Media media = new Media(libVLC, Uri.parse(url));
            media.setHWDecoderEnabled(true, false);
            media.addOption(":network-caching=1800");
            media.addOption(":live-caching=1800");
            media.addOption(":http-reconnect");
            mediaPlayer.setMedia(media);
            media.release();
            mediaPlayer.play();
        } catch (Exception error) {
            statusText.setText("VLC could not start this stream.");
        }
    }

    private Button makeButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF62427D));
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onStop() {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) mediaPlayer.pause();
        super.onStop();
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        if (mediaPlayer != null && !userPaused) mediaPlayer.play();
    }

    @Override
    protected void onDestroy() {
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
