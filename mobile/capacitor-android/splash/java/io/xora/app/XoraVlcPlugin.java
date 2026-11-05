package io.xora.app;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "XoraVlc")
public class XoraVlcPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "XoraTV");
        String fallbackUrl1 = call.getString("fallbackUrl1");
        String fallbackUrl2 = call.getString("fallbackUrl2");
        if (url == null || url.trim().isEmpty()) {
            call.reject("A stream URL is required.");
            return;
        }
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            call.reject("Only secure HTTPS streams are supported.");
            return;
        }
        Intent intent = new Intent(getContext(), XoraVlcActivity.class);
        intent.putExtra(XoraVlcActivity.EXTRA_URL, url);
        intent.putExtra(XoraVlcActivity.EXTRA_TITLE, title);
        intent.putExtra(XoraVlcActivity.EXTRA_FALLBACK_URL_1, fallbackUrl1);
        intent.putExtra(XoraVlcActivity.EXTRA_FALLBACK_URL_2, fallbackUrl2);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not open the native VLC player.", error);
            }
        });
    }
}
