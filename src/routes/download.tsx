import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/xora/AppShell";
import { Download, Smartphone, ShieldCheck, Info } from "lucide-react";

const APK_URL =
  "https://github.com/greatzachariah16-wq/Xoratv-/releases/download/xoratv-android-test/XoraTV-Android-Test.apk";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download XoraTV for Android" },
      {
        name: "description",
        content: "Install the XoraTV Android test app and experience its native startup screen.",
      },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <AppShell wide>
      <section className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#21172d] via-[#30203f] to-[#4a3562] p-6 text-white shadow-xl sm:p-9">
          <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Smartphone className="size-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">
            XoraTV for Android
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Your XoraTV app, ready to install.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/75 sm:text-base">
            Try XoraTV as an Android app, including its native startup screen while the live service wakes up.
          </p>
          <a
            href={APK_URL}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f4e9d7] px-5 py-3 text-sm font-bold text-[#21172d] shadow-lg transition hover:bg-white sm:w-auto"
          >
            <Download className="size-5" />
            Download Android test APK
          </a>
          <p className="mt-3 text-xs text-white/55">
            Android test build · Direct APK download
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="font-semibold">What you are testing</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The Capacitor Android shell and XoraTV's native loading screen. It stays visible while the website loads and fades when the app is ready.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-foreground">
              <Info className="size-5 text-primary" />
              <h2 className="font-semibold">Before installing</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This is a test build, not the final public release. Android may ask you to allow Chrome to install apps from this source.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold text-foreground">Install on your Android phone</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Tap <strong className="text-foreground">Download Android test APK</strong>.</li>
            <li>Open the downloaded XoraTV APK from your notifications or Downloads folder.</li>
            <li>If Android asks, allow your browser to install unknown apps, then return to the installer.</li>
            <li>Tap Install, open XoraTV, and watch the native loading screen while the live site starts.</li>
          </ol>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          This test APK uses the XoraTV live website. It requires an internet connection and does not install through Google Play.
        </p>
      </section>
    </AppShell>
  );
}
