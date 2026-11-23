import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dablinker-test")({
  head: () => ({
    meta: [
      { title: "Dablinker Ad Test | XoraTV" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DablinkerTestPage,
});

function DablinkerTestPage() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/dablinker-test.js";
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, []);

  return (
    <main className="min-h-screen bg-[#faf6ef] px-4 py-8 text-[#302a26]">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/" className="mb-8 inline-flex items-center text-sm font-medium text-[#806d5a]">
          ← Back to XoraTV
        </Link>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b8067]">XoraTV · Private test</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dablinker ad test</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#74675d]">
            Testing the original Dablinker text-ad script directly on this XoraTV page.
          </p>
        </header>

        <section className="rounded-2xl border border-[#e8ded1] bg-white/80 p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Live ad request</h2>
            <span className="rounded-full bg-[#f2eadf] px-3 py-1 text-[11px] font-medium text-[#806d5a]">Dablinker · Text</span>
          </div>
          <div className="dablinker-text-ad-container min-h-[200px] w-full rounded-xl bg-[#fff9f0]" />
          <p className="mt-3 text-xs leading-5 text-[#88796d]">
            The original ad unit refreshes on its own 30-second timer. Please don't click the ad; clicking records an ad click and opens the advertiser.
          </p>
        </section>

        <p className="mt-5 text-xs leading-5 text-[#95877b]">
          This page is unlisted and excluded from search indexing. It is only for checking whether Dablinker returns and displays an ad.
        </p>
      </div>
    </main>
  );
}
