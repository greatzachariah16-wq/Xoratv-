import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/bookstore")({
  head: () => ({
    meta: [
      { title: "Bookstore — XoraTV" },
      { name: "description", content: "Discover thoughtful reads in the XoraTV Bookstore." },
    ],
  }),
  component: Bookstore,
});

const shelves = [
  { id: "featured", label: "For you", eyebrow: "THE EDITOR'S TABLE", title: "A good story stays with you", description: "A considered collection of books for curious minds, new ideas and slower moments." },
  { id: "fiction", label: "Fiction", eyebrow: "FICTION & STORIES", title: "Worlds worth getting lost in", description: "Novels, short stories and unforgettable characters." },
  { id: "business", label: "Business", eyebrow: "BUSINESS & FINANCE", title: "Ideas that move you forward", description: "Practical thinking for building, leading and creating." },
  { id: "technology", label: "Technology", eyebrow: "TECHNOLOGY", title: "Understand what comes next", description: "Technology, science and the people shaping tomorrow." },
  { id: "learning", label: "Learning", eyebrow: "LEARNING & EDUCATION", title: "Keep your curiosity alive", description: "Clear explanations and useful knowledge for every stage." },
  { id: "children", label: "Children", eyebrow: "YOUNG READERS", title: "Little readers, big imaginations", description: "Warm, thoughtful stories for growing minds." },
];

const previewPages = [
  { heading: "Every new chapter begins somewhere.", body: "There is a particular kind of possibility in an empty page. It asks nothing of you at first. It simply makes room: for a question you have not asked, an idea you have not followed, or a story you have not yet imagined." },
  { heading: "Make room for wonder.", body: "Reading is a small act of discovery. A few quiet minutes can take you across an ocean, into another person's thoughts, or towards a skill you once thought was beyond you. The best shelves do more than store books. They open doors." },
  { heading: "Follow the thread.", body: "You do not need to read everything at once. Choose one subject that makes you curious and follow it a little further today. A page becomes a chapter. A chapter becomes a new way of seeing the world." },
  { heading: "The next page is yours.", body: "Keep the questions that stay with you. Return to the sentences that make you pause. And when you are ready, turn the page. There is always more to discover." },
];

function BookCover({ tone, label, title }: { tone: string; label: string; title: string }) {
  return (
    <div className={"relative aspect-[3/4] w-full overflow-hidden rounded-[5px] border border-black/10 shadow-[8px_12px_22px_-14px_rgba(40,28,20,.7)] " + tone}>
      <div className="absolute inset-[7%] border border-white/25" />
      <div className="absolute inset-x-[13%] top-[17%] text-center text-[8px] font-semibold uppercase tracking-[.28em] text-white/75">{label}</div>
      <div className="absolute inset-x-[12%] top-[34%] text-center font-editorial text-[clamp(17px,5vw,28px)] leading-[.98] tracking-[-.04em] text-white">{title}</div>
      <div className="absolute inset-x-[18%] bottom-[17%] h-px bg-white/50" />
      <div className="absolute bottom-[9%] inset-x-0 text-center text-[7px] font-medium uppercase tracking-[.25em] text-white/70">XORA EDITIONS</div>
      <div className="absolute inset-y-0 left-0 w-[5px] bg-black/15" />
      <div className="absolute inset-y-0 left-[5px] w-px bg-white/20" />
    </div>
  );
}

function Bookstore() {
  const [activeShelf, setActiveShelf] = useState("featured");
  const [search, setSearch] = useState("");
  const [readerOpen, setReaderOpen] = useState(false);
  const [page, setPage] = useState(0);
  const shelf = shelves.find(item => item.id === activeShelf) || shelves[0];
  const visibleShelves = useMemo(() => shelves.filter(item => item.id !== "featured" && (!search.trim() || (item.label + " " + item.description).toLowerCase().includes(search.toLowerCase()))), [search]);

  return (
    <AppShell wide hideTopBanner>
      <div className="mx-auto max-w-6xl space-y-8 pb-12 sm:space-y-11">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="size-5" strokeWidth={1.7}/></div>
            <div><p className="font-display text-lg font-semibold tracking-tight">Xora<span className="text-primary">TV</span> <span className="font-normal text-muted-foreground">/ Bookstore</span></p><p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">A quieter kind of discovery</p></div>
          </div>
          <span className="hidden rounded-full border border-primary/20 bg-clay-soft/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.16em] text-primary sm:inline-flex">The reading room</span>
          <a href="/learn" className="text-xs font-semibold text-primary">Explore Learn <ArrowRight className="ml-1 inline size-3.5"/></a>
        </header>

        <section className="relative isolate overflow-hidden rounded-[30px] border border-[#d9c7b7] bg-[#f1e5d8] px-5 py-7 text-[#352820] shadow-[0_22px_55px_-38px_rgba(55,37,27,.42)] sm:px-10 sm:py-10 lg:px-14">
          <div className="pointer-events-none absolute -right-24 -top-32 size-[360px] rounded-full border border-[#b77b5e]/20"/>
          <div className="pointer-events-none absolute -right-8 -top-16 size-[250px] rounded-full border border-[#b77b5e]/20"/>
          <div className="relative grid items-center gap-7 md:grid-cols-[1.1fr_.9fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a65d42]/25 bg-white/45 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.2em] text-[#99543b]"><Sparkles className="size-3.5"/>A new chapter</span>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.25em] text-[#806b5c]">THE XORATV BOOKSTORE</p>
              <h1 className="mt-3 max-w-xl font-editorial text-[2.8rem] leading-[.94] tracking-[-.055em] sm:text-6xl lg:text-[4.6rem]">Find your next <em className="font-normal text-[#a65337]">favourite</em> page.</h1>
              <p className="mt-4 max-w-md text-[13px] leading-6 text-[#756052] sm:text-[15px] sm:leading-7">A thoughtful home for stories, fresh perspectives and ideas worth keeping. Browse a shelf, settle in and turn the page at your own pace.</p>
              <button onClick={()=>{setPage(0);setReaderOpen(true);}} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#3c2d25] px-5 text-xs font-semibold text-[#fff8ef] shadow-lg shadow-[#3c2d25]/15 transition hover:-translate-y-0.5 hover:bg-[#51392d]"> <BookOpen className="size-4"/> Preview the reading experience <ArrowRight className="size-3.5"/></button>
            </div>
            <div className="relative mx-auto flex h-[220px] w-full max-w-[360px] items-center justify-center sm:h-[280px]">
              <div className="absolute left-[15%] top-[12%] h-[78%] w-[43%] rotate-[-12deg] rounded-[5px] bg-[#a75b3d] shadow-[14px_18px_24px_-14px_rgba(55,37,27,.55)]"><div className="absolute inset-[8%] border border-white/30"/><div className="absolute inset-x-0 top-[36%] text-center font-editorial text-2xl text-[#fff3e5]">Stories<br/>to keep</div><div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA EDITIONS</div></div>
              <div className="absolute right-[14%] top-[8%] h-[82%] w-[43%] rotate-[9deg] rounded-[5px] bg-[#4d5546] shadow-[14px_18px_24px_-14px_rgba(55,37,27,.55)]"><div className="absolute inset-[8%] border border-white/25"/><div className="absolute inset-x-[10%] top-[30%] text-center font-editorial text-[26px] leading-[.98] text-[#f5ead9]">The art<br/>of wonder</div><div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA EDITIONS</div></div>
              <div className="absolute bottom-[4%] left-[30%] h-[14px] w-[47%] rounded-full bg-[#7c5843]/20 blur-md"/>
              <div className="absolute right-[5%] top-[5%] grid size-10 place-items-center rounded-full border border-[#a65d42]/20 bg-[#fff9f1]/80 text-[#a65337]"><Bookmark className="size-4"/></div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[9px] font-bold uppercase tracking-[.22em] text-primary">Browse the collection</p><h2 className="mt-1 font-editorial text-3xl tracking-tight sm:text-4xl">Choose a shelf.</h2><p className="mt-1 text-xs text-muted-foreground">A place for every kind of curiosity.</p></div>
            <label className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-surface px-4 sm:max-w-[260px]"><Search className="size-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a subject…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"/>{search?<button onClick={()=>setSearch("")} aria-label="Clear search"><X className="size-3.5"/></button>:null}</label>
          </div>
          <nav aria-label="Book categories" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">{shelves.map(item=><button key={item.id} onClick={()=>setActiveShelf(item.id)} aria-pressed={activeShelf===item.id} className={"shrink-0 rounded-full border px-4 py-2.5 text-[11px] font-semibold transition "+(activeShelf===item.id?"border-foreground bg-foreground text-background":"border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground")}>{item.label}</button>)}</nav>
        </section>

        <section className="grid gap-6 md:grid-cols-[.8fr_1.2fr] md:items-stretch">
          <div className="flex flex-col justify-center rounded-[26px] bg-[#3c3028] p-6 text-[#fff7ee] sm:p-8">
            <p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d8a88d]">{shelf.eyebrow}</p>
            <h2 className="mt-3 font-editorial text-3xl leading-[1.02] tracking-tight sm:text-4xl">{shelf.title}</h2>
            <p className="mt-3 max-w-sm text-xs leading-6 text-[#d7c7ba]">{shelf.description}</p>
            <div className="mt-7 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#d8a88d]"><span className="size-1.5 rounded-full bg-[#d8a88d]"/>Curating this shelf now</div>
          </div>
          <div className="relative flex min-h-[230px] flex-col justify-center overflow-hidden rounded-[26px] border border-border bg-surface p-6 sm:p-8">
            <div className="absolute -right-10 -top-10 size-48 rounded-full bg-clay-soft/60 blur-3xl"/>
            <div className="relative flex items-start gap-4 sm:gap-6">
              <div className="w-[92px] shrink-0 sm:w-[116px]"><BookCover tone="bg-[#a75b3d]" label="XORA EDITIONS" title="A world of ideas"/></div>
              <div className="min-w-0 pt-2"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">A shelf in the making</p><h3 className="mt-2 font-editorial text-2xl leading-tight sm:text-3xl">Good books deserve a beautiful home.</h3><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">We’re preparing the first collection for this shelf. Soon, each book will open into a calm, page-by-page reading experience.</p></div>
            </div>
            <div className="relative mt-6 h-2 rounded-full bg-[#e6d8cb] shadow-inner"><div className="absolute inset-x-0 -top-1 h-3 rounded-full bg-gradient-to-b from-[#d9c2ae] to-[#b28a6e] shadow-sm"/></div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">Explore more</p><h2 className="mt-1 font-editorial text-2xl sm:text-3xl">More shelves to discover</h2></div><span className="text-[10px] text-muted-foreground">{visibleShelves.length} collections</span></div>
          {visibleShelves.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{visibleShelves.map((item,index)=><button key={item.id} onClick={()=>setActiveShelf(item.id)} className="group rounded-2xl border border-border bg-surface p-3 text-left transition hover:-translate-y-1 hover:shadow-lift"><div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-[#eee3d8]"><div className={"absolute left-[25%] top-[13%] h-[76%] w-[48%] rotate-[-7deg] rounded-[3px] shadow-md transition group-hover:rotate-[-3deg] "+(["bg-[#53604c]","bg-[#a75b3d]","bg-[#414b61]","bg-[#b18b62]","bg-[#826b86]"][index%5])}><div className="absolute inset-[8%] border border-white/25"/><div className="absolute inset-x-[8%] top-[35%] text-center font-editorial text-[12px] leading-none text-white">{item.label}</div></div><div className="absolute bottom-2 left-2 text-[8px] font-bold uppercase tracking-[.18em] text-[#7e6a5b]">XORA / {String(index+1).padStart(2,"0")}</div></div><p className="text-xs font-semibold">{item.label}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.description}</p></button>)}</div>:<p className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No shelves match that search.</p>}
        </section>

        <footer className="flex flex-col gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Made for curious minds. Read at your own pace.</span><span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5"/>The XoraTV reading room</span></footer>
      </div>

      {readerOpen ? <div role="dialog" aria-modal="true" aria-label="Xora reader preview" className="fixed inset-0 z-[120] flex items-center justify-center bg-[#211914]/75 p-3 backdrop-blur-md sm:p-6">
        <section className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[#d7c3b1] bg-[#f4eadf] text-[#3b2d25] shadow-2xl sm:rounded-[30px]">
          <header className="flex items-center justify-between border-b border-[#d8c8b9] px-4 py-3 sm:px-6"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a05a3f]">XORA READER · PREVIEW</p><p className="mt-0.5 font-editorial text-lg">A little room for stories</p></div><button onClick={()=>setReaderOpen(false)} aria-label="Close reader" className="grid size-9 place-items-center rounded-full border border-[#d8c8b9] hover:bg-white/60"><X className="size-4"/></button></header>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-7">
            <div className="grid w-full max-w-3xl grid-cols-2 overflow-hidden rounded-[5px] bg-[#fffaf2] shadow-[0_18px_50px_-25px_rgba(52,35,24,.55)]" style={{perspective:"1400px"}}>
              <article key={"left-"+page} className="relative min-h-[300px] border-r border-[#e4d7c8] px-4 py-7 sm:min-h-[440px] sm:px-10 sm:py-12" style={{animation:"readerPageIn .38s ease both"}}>
                <span className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#ad7658]">XORA EDITIONS</span><h2 className="mt-8 font-editorial text-xl leading-tight tracking-tight sm:mt-12 sm:text-3xl">{previewPages[page].heading}</h2><p className="mt-5 font-editorial text-[11px] leading-6 text-[#756354] sm:mt-7 sm:text-base sm:leading-8">{previewPages[page].body}</p><span className="absolute bottom-4 left-4 text-[8px] text-[#a48e7d] sm:bottom-6 sm:left-10">{page*2+1}</span>
              </article>
              <article key={"right-"+page} className="relative min-h-[300px] bg-[#fffdf8] px-4 py-7 shadow-[-8px_0_18px_-18px_rgba(50,30,20,.8)] sm:min-h-[440px] sm:px-10 sm:py-12" style={{animation:"readerPageIn .48s ease both"}}>
                <span className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#ad7658]">A NEW CHAPTER</span><div className="mt-8 h-px w-10 bg-[#bd896a] sm:mt-12"/><p className="mt-6 font-editorial text-[11px] italic leading-6 text-[#756354] sm:text-base sm:leading-8">{previewPages[page+1].body}</p><span className="absolute bottom-4 right-4 text-[8px] text-[#a48e7d] sm:bottom-6 sm:right-10">{page*2+2}</span>
              </article>
            </div>
          </div>
          <footer className="flex items-center justify-between border-t border-[#d8c8b9] px-4 py-3 sm:px-6"><button disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d3c1b1] px-4 text-xs font-semibold disabled:opacity-35"><ChevronLeft className="size-4"/>Previous</button><span className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#8e7968]">Spread {page+1} of 2</span><button disabled={page===1} onClick={()=>setPage(v=>Math.min(1,v+1))} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#3c2d25] px-4 text-xs font-semibold text-white disabled:opacity-35">Turn page <ChevronRight className="size-4"/></button></footer>
        </section>
        <style>{'@keyframes readerPageIn { from { opacity: .35; transform: rotateY(-7deg) translateX(5px); } to { opacity: 1; transform: rotateY(0) translateX(0); } }'}</style>
      </div>:null}
    </AppShell>
  );
}
