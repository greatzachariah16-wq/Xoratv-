package io.xora.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "XoraStartup")
public class XoraStartupPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).onXoraWebAppReady();
        }
        call.resolve();
    }
}
