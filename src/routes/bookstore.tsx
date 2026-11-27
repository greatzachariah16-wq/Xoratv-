import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Feather, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/bookstore")({
  head: () => ({ meta: [
    { title: "Bookstore — XoraTV" },
    { name: "description", content: "A thoughtful home for books and the people who create them." },
  ] }),
  component: Bookstore,
});

function Bookstore() {
  return <AppShell wide hideTopBanner>
    <main className="xora-bookstore mx-auto max-w-6xl space-y-8 pb-12 sm:space-y-10">
      <header className="flex items-center justify-between gap-3 border-b border-[#e8ddd4] pb-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-[#a65337]/10 text-[#a65337]"><BookOpen className="size-5" strokeWidth={1.7}/></div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-[#3c2d25]">Xora<span className="text-[#a65337]">TV</span> <span className="font-normal text-[#8c796d]">/ Bookstore</span></p>
            <p className="text-[10px] uppercase tracking-[.2em] text-[#9a877a]">A quieter kind of discovery</p>
          </div>
        </div>
        <Link to="/learn" className="text-xs font-semibold text-[#a65337] transition hover:text-[#7f3e2b]">Explore Learn <ArrowRight className="ml-1 inline size-3.5"/></Link>
      </header>

      <section className="relative isolate overflow-hidden rounded-[30px] border border-[#d9c7b7] bg-[#f1e5d8] px-5 py-8 text-[#352820] shadow-[0_22px_55px_-38px_rgba(55,37,27,.42)] sm:px-10 sm:py-11 lg:px-14">
        <div className="pointer-events-none absolute -right-24 -top-32 size-[360px] rounded-full border border-[#b77b5e]/20"/>
        <div className="pointer-events-none absolute -right-8 -top-16 size-[250px] rounded-full border border-[#b77b5e]/20"/>
        <div className="relative grid items-center gap-8 md:grid-cols-[1.05fr_.95fr]">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#a65d42]/25 bg-white/45 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.2em] text-[#99543b]"><Sparkles className="size-3.5"/>The Xora reading room</span>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.25em] text-[#806b5c]">A WORLD OF WORDS, WAITING TO BE WRITTEN</p>
            <h1 className="mt-3 max-w-xl font-editorial text-[2.8rem] leading-[.94] tracking-[-.055em] sm:text-6xl lg:text-[4.6rem]">Every great story starts with <em className="font-normal text-[#a65337]">a page.</em></h1>
            <p className="mt-4 max-w-md text-[13px] leading-6 text-[#756052] sm:text-[15px] sm:leading-7">A considered space for ideas, imagination and the voices behind every book. Soon, these shelves will hold stories from the Xora community.</p>
          </div>

          <div aria-hidden="true" className="relative mx-auto flex h-[230px] w-full max-w-[390px] items-center justify-center sm:h-[290px]">
            <div className="absolute bottom-[9%] left-[15%] h-[17px] w-[70%] rounded-full bg-[#7c5843]/20 blur-md"/>
            <div className="absolute left-[17%] top-[15%] h-[76%] w-[39%] rotate-[-13deg] rounded-[5px] border border-white/20 bg-[#a75b3d] shadow-[16px_20px_28px_-14px_rgba(55,37,27,.55)]">
              <div className="absolute inset-[7%] border border-white/30"/>
              <div className="absolute inset-y-0 left-[7%] w-[5px] bg-black/15"/>
              <div className="absolute inset-x-[12%] top-[37%] text-center font-editorial text-[clamp(22px,5vw,30px)] leading-[.98] text-[#fff3e5]">Words<br/>that stay</div>
              <div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA BOOKS</div>
            </div>
            <div className="absolute right-[15%] top-[9%] h-[82%] w-[40%] rotate-[10deg] rounded-[5px] border border-white/20 bg-[#4d5546] shadow-[16px_20px_28px_-14px_rgba(55,37,27,.55)]">
              <div className="absolute inset-[7%] border border-white/25"/>
              <div className="absolute inset-y-0 left-[7%] w-[5px] bg-black/15"/>
              <div className="absolute inset-x-[10%] top-[31%] text-center font-editorial text-[clamp(22px,5vw,30px)] leading-[.98] text-[#f5ead9]">A world<br/>unfolding</div>
              <div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA BOOKS</div>
            </div>
            <div className="absolute right-[7%] top-[4%] grid size-10 place-items-center rounded-full border border-[#a65d42]/20 bg-[#fff9f1]/85 text-[#a65337] shadow-sm"><Feather className="size-4"/></div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[26px] border border-[#e8d9cd] bg-[#fffdf9] px-6 py-9 text-center shadow-[0_18px_45px_-38px_rgba(55,37,27,.32)] sm:px-10 sm:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -left-12 -top-16 size-44 rounded-full border border-[#c58a6b]/15"/>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-12 size-56 rounded-full border border-[#c58a6b]/15"/>
        <div className="relative mx-auto max-w-md">
          <div aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full border border-[#d9b9a7] bg-[#f8eee6] text-[#a65337]"><BookOpen className="size-5" strokeWidth={1.6}/></div>
          <p className="mt-5 text-[9px] font-bold uppercase tracking-[.24em] text-[#a65337]">The first chapter begins here</p>
          <h2 className="mt-2 font-editorial text-3xl tracking-tight text-[#3c2d25] sm:text-4xl">Publish your first book.</h2>
          <p className="mx-auto mt-3 max-w-sm text-xs leading-6 text-[#8b786b]">Bring your words to Xora. Apply to become a creator and prepare to share your story with readers.</p>
          <Link to="/creator-studio" className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#d7b7a5] bg-[#f8eee6] px-5 py-2.5 text-[11px] font-semibold tracking-[.02em] text-[#8f4b34] shadow-[0_5px_16px_rgba(116,69,47,.08)] transition hover:-translate-y-0.5 hover:border-[#b97759] hover:bg-[#f3e3d7]">
            Apply to become a creator <ArrowRight className="size-3.5"/>
          </Link>
          <p className="mt-4 text-[9px] uppercase tracking-[.17em] text-[#ad9a8d]">A home for stories, ideas and imagination</p>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-[#e8ddd4] pt-5 text-[10px] text-[#9a877a] sm:flex-row sm:items-center sm:justify-between">
        <span>Made for curious minds. Read at your own pace.</span>
        <span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5"/>The XoraTV reading room</span>
      </footer>
    </main>
  </AppShell>;
}
