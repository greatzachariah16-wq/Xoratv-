import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/bookstore")({
  head: () => ({ meta: [
    { title: "Bookstore — XoraTV" },
    { name: "description", content: "Discover thoughtful reads in the XoraTV Bookstore." },
  ] }),
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

const books = [
  { id:"b1", shelf:"featured", title:"The Quiet Art of Beginning", author:"Xora Editions", cover:"#9f5539", mark:"01", note:"A thoughtful reading preview" },
  { id:"b2", shelf:"featured", title:"A World of Ideas", author:"Xora Editions", cover:"#4d5948", mark:"02", note:"A thoughtful reading preview" },
  { id:"b3", shelf:"featured", title:"Small Things, Deep Roots", author:"Xora Editions", cover:"#596078", mark:"03", note:"A thoughtful reading preview" },
  { id:"b4", shelf:"featured", title:"The Shape of Wonder", author:"Xora Editions", cover:"#a77d58", mark:"04", note:"A thoughtful reading preview" },
  { id:"b5", shelf:"featured", title:"Letters to Tomorrow", author:"Xora Editions", cover:"#806b83", mark:"05", note:"A thoughtful reading preview" },
  { id:"f1", shelf:"fiction", title:"The Lantern in the Rain", author:"Xora Editions", cover:"#53604c", mark:"01", note:"Fiction shelf preview" },
  { id:"f2", shelf:"fiction", title:"Where the River Turns", author:"Xora Editions", cover:"#a75b3d", mark:"02", note:"Fiction shelf preview" },
  { id:"f3", shelf:"fiction", title:"A Map of Elsewhere", author:"Xora Editions", cover:"#414b61", mark:"03", note:"Fiction shelf preview" },
  { id:"f4", shelf:"fiction", title:"The Last Blue Hour", author:"Xora Editions", cover:"#826b86", mark:"04", note:"Fiction shelf preview" },
  { id:"f5", shelf:"fiction", title:"When the Stars Return", author:"Xora Editions", cover:"#9b7655", mark:"05", note:"Fiction shelf preview" },
  { id:"bu1", shelf:"business", title:"Build with Intention", author:"Xora Editions", cover:"#a75b3d", mark:"01", note:"Business shelf preview" },
  { id:"bu2", shelf:"business", title:"The Long Game", author:"Xora Editions", cover:"#4d5948", mark:"02", note:"Business shelf preview" },
  { id:"bu3", shelf:"business", title:"Better Questions", author:"Xora Editions", cover:"#596078", mark:"03", note:"Business shelf preview" },
  { id:"bu4", shelf:"business", title:"The Creative Ledger", author:"Xora Editions", cover:"#a77d58", mark:"04", note:"Business shelf preview" },
  { id:"bu5", shelf:"business", title:"People Before Plans", author:"Xora Editions", cover:"#806b83", mark:"05", note:"Business shelf preview" },
  { id:"t1", shelf:"technology", title:"Tomorrow, Explained", author:"Xora Editions", cover:"#414b61", mark:"01", note:"Technology shelf preview" },
  { id:"t2", shelf:"technology", title:"Machines & Meaning", author:"Xora Editions", cover:"#53604c", mark:"02", note:"Technology shelf preview" },
  { id:"t3", shelf:"technology", title:"A Human Guide to AI", author:"Xora Editions", cover:"#a75b3d", mark:"03", note:"Technology shelf preview" },
  { id:"t4", shelf:"technology", title:"The Open Internet", author:"Xora Editions", cover:"#806b83", mark:"04", note:"Technology shelf preview" },
  { id:"t5", shelf:"technology", title:"Code, Clearly", author:"Xora Editions", cover:"#a77d58", mark:"05", note:"Technology shelf preview" },
  { id:"l1", shelf:"learning", title:"Learn One Thing Well", author:"Xora Editions", cover:"#b18b62", mark:"01", note:"Learning shelf preview" },
  { id:"l2", shelf:"learning", title:"The Curious Mind", author:"Xora Editions", cover:"#53604c", mark:"02", note:"Learning shelf preview" },
  { id:"l3", shelf:"learning", title:"A Field Guide to Focus", author:"Xora Editions", cover:"#596078", mark:"03", note:"Learning shelf preview" },
  { id:"l4", shelf:"learning", title:"Make Time to Think", author:"Xora Editions", cover:"#a75b3d", mark:"04", note:"Learning shelf preview" },
  { id:"l5", shelf:"learning", title:"Questions That Teach", author:"Xora Editions", cover:"#806b83", mark:"05", note:"Learning shelf preview" },
  { id:"c1", shelf:"children", title:"The Little Cloud Keeper", author:"Xora Editions", cover:"#826b86", mark:"01", note:"Children's shelf preview" },
  { id:"c2", shelf:"children", title:"Milo and the Moonseed", author:"Xora Editions", cover:"#a75b3d", mark:"02", note:"Children's shelf preview" },
  { id:"c3", shelf:"children", title:"The Garden of Questions", author:"Xora Editions", cover:"#53604c", mark:"03", note:"Children's shelf preview" },
  { id:"c4", shelf:"children", title:"A Pocketful of Stars", author:"Xora Editions", cover:"#596078", mark:"04", note:"Children's shelf preview" },
  { id:"c5", shelf:"children", title:"The Brave Little Kite", author:"Xora Editions", cover:"#a77d58", mark:"05", note:"Children's shelf preview" },
];

const pages = [
  { heading:"Every new chapter begins somewhere.", body:"There is a particular kind of possibility in an empty page. It asks nothing of you at first. It simply makes room: for a question you have not asked, an idea you have not followed, or a story you have not yet imagined." },
  { heading:"Make room for wonder.", body:"Reading is a small act of discovery. A few quiet minutes can take you across an ocean, into another person's thoughts, or towards a skill you once thought was beyond you. The best shelves do more than store books. They open doors." },
  { heading:"Follow the thread.", body:"You do not need to read everything at once. Choose one subject that makes you curious and follow it a little further today. A page becomes a chapter. A chapter becomes a new way of seeing the world." },
  { heading:"The next page is yours.", body:"Keep the questions that stay with you. Return to the sentences that make you pause. And when you are ready, turn the page. There is always more to discover." },
  { heading:"A little further.", body:"The best discoveries rarely arrive all at once. They gather quietly, one sentence and one thoughtful moment at a time. Let curiosity set the pace." },
  { heading:"Keep the good things close.", body:"A book can become a companion: something to return to, underline, question and carry into the rest of your day. Take what matters with you." },
];

function BookCover({ book, compact=false }: { book: typeof books[number]; compact?: boolean }) {
  return <div className={"book-cover relative isolate aspect-[3/4] w-full overflow-hidden rounded-[5px] border border-black/10 shadow-[9px_14px_24px_-15px_rgba(40,28,20,.78)] transition-transform duration-500 group-hover:-translate-y-1 "+(compact?"max-w-[112px]":"") } style={{background:book.cover}}>
    <div className="absolute inset-y-0 left-0 w-[7px] bg-black/20"/>
    <div className="absolute inset-y-0 left-[7px] w-px bg-white/20"/>
    <div className="absolute inset-[7%] border border-white/30"/>
    <div className="absolute inset-x-[13%] top-[15%] text-center text-[7px] font-semibold uppercase tracking-[.28em] text-white/75">XORA EDITIONS</div>
    <div className="absolute inset-x-[11%] top-[34%] text-center font-editorial text-[clamp(15px,4.4vw,22px)] leading-[1.02] tracking-[-.035em] text-[#fff8ed]">{book.title}</div>
    <div className="absolute inset-x-[18%] bottom-[18%] h-px bg-white/55"/>
    <div className="absolute inset-x-0 bottom-[9%] text-center text-[7px] uppercase tracking-[.22em] text-white/70">{book.mark} · XORA</div>
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"/>
  </div>;
}

function Bookstore() {
  const [activeShelf,setActiveShelf]=useState("featured");
  const [search,setSearch]=useState("");
  const [readerOpen,setReaderOpen]=useState(false);
  const [page,setPage]=useState(0);
  const [flip,setFlip]=useState<null|{direction:"next"|"prev";from:number;to:number}>(null);
  const [activeBook,setActiveBook]=useState(books[0]);
  const touchStart=useRef<{x:number;y:number}|null>(null);
  const railRefs=useRef<Record<string,HTMLDivElement|null>>({});
  const shelf=shelves.find(item=>item.id===activeShelf)||shelves[0];
  const visibleShelves=useMemo(()=>shelves.filter(item=>item.id!=="featured"&&(!search.trim()||(item.label+" "+item.description).toLowerCase().includes(search.toLowerCase()))),[search]);
  const shelfBooks=books.filter(book=>{const category=shelves.find(item=>item.id===book.shelf)?.label||"";const matches=(book.title+" "+book.author+" "+category).toLowerCase().includes(search.trim().toLowerCase());return search.trim()?matches:book.shelf===activeShelf;});

  const turn=(direction:"next"|"prev")=>{
    if(flip) return;
    const next=direction==="next"?Math.min(pages.length/2-1,page+1):Math.max(0,page-1);
    if(next===page)return;
    setFlip({direction,from:page,to:next});
    setPage(next);
  };
  const finishFlip=()=>setFlip(null);
  const openBook=(book:typeof books[number])=>{setActiveBook(book);setPage(0);setFlip(null);setReaderOpen(true);};
  const scrollRail=(id:string,direction:number)=>railRefs.current[id]?.scrollBy({left:direction*230,behavior:"smooth"});

  return <AppShell wide hideTopBanner>
    <div className="xora-bookstore mx-auto max-w-6xl space-y-8 pb-12 sm:space-y-11">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="size-5" strokeWidth={1.7}/></div><div><p className="font-display text-lg font-semibold tracking-tight">Xora<span className="text-primary">TV</span> <span className="font-normal text-muted-foreground">/ Bookstore</span></p><p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">A quieter kind of discovery</p></div></div>
        <a href="/learn" className="text-xs font-semibold text-primary">Explore Learn <ArrowRight className="ml-1 inline size-3.5"/></a>
      </header>

      <section className="relative isolate overflow-hidden rounded-[30px] border border-[#d9c7b7] bg-[#f1e5d8] px-5 py-7 text-[#352820] shadow-[0_22px_55px_-38px_rgba(55,37,27,.42)] sm:px-10 sm:py-10 lg:px-14">
        <div className="pointer-events-none absolute -right-24 -top-32 size-[360px] rounded-full border border-[#b77b5e]/20"/><div className="pointer-events-none absolute -right-8 -top-16 size-[250px] rounded-full border border-[#b77b5e]/20"/>
        <div className="relative grid items-center gap-7 md:grid-cols-[1.1fr_.9fr]">
          <div><span className="inline-flex items-center gap-2 rounded-full border border-[#a65d42]/25 bg-white/45 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.2em] text-[#99543b]"><Sparkles className="size-3.5"/>A new chapter</span><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.25em] text-[#806b5c]">THE XORATV BOOKSTORE</p><h1 className="mt-3 max-w-xl font-editorial text-[2.8rem] leading-[.94] tracking-[-.055em] sm:text-6xl lg:text-[4.6rem]">Find your next <em className="font-normal text-[#a65337]">favourite</em> page.</h1><p className="mt-4 max-w-md text-[13px] leading-6 text-[#756052] sm:text-[15px] sm:leading-7">A thoughtful home for stories, fresh perspectives and ideas worth keeping. Browse a shelf, settle in and turn the page at your own pace.</p><button onClick={()=>openBook(books[0])} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#3c2d25] px-5 text-xs font-semibold text-[#fff8ef] shadow-lg shadow-[#3c2d25]/15 transition hover:-translate-y-0.5 hover:bg-[#51392d]"><BookOpen className="size-4"/> Preview the reading experience <ArrowRight className="size-3.5"/></button></div>
          <div className="relative mx-auto flex h-[220px] w-full max-w-[360px] items-center justify-center sm:h-[280px]"><div className="absolute left-[15%] top-[12%] h-[78%] w-[43%] rotate-[-12deg] rounded-[5px] bg-[#a75b3d] shadow-[14px_18px_24px_-14px_rgba(55,37,27,.55)]"><div className="absolute inset-[8%] border border-white/30"/><div className="absolute inset-x-0 top-[36%] text-center font-editorial text-2xl text-[#fff3e5]">Stories<br/>to keep</div><div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA EDITIONS</div></div><div className="absolute right-[14%] top-[8%] h-[82%] w-[43%] rotate-[9deg] rounded-[5px] bg-[#4d5546] shadow-[14px_18px_24px_-14px_rgba(55,37,27,.55)]"><div className="absolute inset-[8%] border border-white/25"/><div className="absolute inset-x-[10%] top-[30%] text-center font-editorial text-[26px] leading-[.98] text-[#f5ead9]">The art<br/>of wonder</div><div className="absolute bottom-[13%] inset-x-0 text-center text-[7px] tracking-[.3em] text-white/70">XORA EDITIONS</div></div><div className="absolute bottom-[4%] left-[30%] h-[14px] w-[47%] rounded-full bg-[#7c5843]/20 blur-md"/><div className="absolute right-[5%] top-[5%] grid size-10 place-items-center rounded-full border border-[#a65d42]/20 bg-[#fff9f1]/80 text-[#a65337]"><Bookmark className="size-4"/></div></div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.22em] text-primary">Browse the collection</p><h2 className="mt-1 font-editorial text-3xl tracking-tight sm:text-4xl">Choose a shelf.</h2><p className="mt-1 text-xs text-muted-foreground">A place for every kind of curiosity.</p></div><label className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-surface px-4 sm:max-w-[260px]"><Search className="size-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a subject…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"/>{search?<button onClick={()=>setSearch("")} aria-label="Clear search"><X className="size-3.5"/></button>:null}</label></div>
        <nav aria-label="Book categories" className="xora-category-tabs no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{shelves.map(item=><button key={item.id} onClick={()=>setActiveShelf(item.id)} aria-pressed={activeShelf===item.id} className={"shrink-0 rounded-full border px-4 py-2.5 text-[11px] font-semibold transition "+(activeShelf===item.id?"border-foreground bg-foreground text-background":"border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground")}>{item.label}</button>)}</nav>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">{search.trim()?"SEARCH THE COLLECTION":shelf.eyebrow}</p><h2 className="mt-1 font-editorial text-2xl sm:text-3xl">{search.trim()?"Your search results":shelf.title}</h2><p className="mt-1 text-xs text-muted-foreground">{search.trim()?"Matching books across every shelf.":shelf.description}</p></div><div className="hidden gap-2 sm:flex"><button onClick={()=>scrollRail("main",-1)} aria-label="Scroll books left" className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-primary/40"><ChevronLeft className="size-4"/></button><button onClick={()=>scrollRail("main",1)} aria-label="Scroll books right" className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-primary/40"><ChevronRight className="size-4"/></button></div></div>
        <div ref={el=>{railRefs.current.main=el}} className="book-rail no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-5 sm:-mx-2 sm:px-2" aria-label={shelf.label+" books"}>{shelfBooks.map(book=><button key={book.id} onClick={()=>openBook(book)} className="book-card group w-[142px] shrink-0 snap-start text-left sm:w-[166px]"><div className="relative rounded-[10px] bg-[#eee3d8] p-3 shadow-[0_10px_24px_-19px_rgba(45,31,23,.5)] transition duration-300 group-hover:-translate-y-1 group-active:scale-[.98]"><BookCover book={book}/><span className="absolute right-4 top-4 rounded-full border border-white/50 bg-[#fff8ef]/90 px-2 py-1 text-[7px] font-bold uppercase tracking-[.15em] text-[#8b5b43]">Preview</span></div><p className="mt-3 line-clamp-2 min-h-[36px] font-editorial text-[15px] leading-tight">{book.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{book.author}</p><span className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary">Open preview <ArrowRight className="size-3"/></span></button>)}</div>
        <p className="text-[9px] text-muted-foreground">Swipe to explore · These are design-preview titles, not published catalogue listings.</p>
      </section>

      <section className="rounded-[26px] bg-[#3c3028] p-6 text-[#fff7ee] sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8"><div className="max-w-lg"><p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d8a88d]">The Xora reading room</p><h2 className="mt-2 font-editorial text-3xl leading-tight sm:text-4xl">A little more room for stories.</h2><p className="mt-2 text-xs leading-6 text-[#d7c7ba]">Open a sample book and feel the page turn. The real catalogue can take this same reading experience when its titles are ready.</p></div><button onClick={()=>openBook(books[0])} className="mt-5 inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#f1e5d8] px-5 text-xs font-semibold text-[#3c2d25] transition hover:bg-white sm:mt-0"><BookOpen className="size-4"/>Try the reader <ArrowRight className="size-3.5"/></button></section>

      <section className="space-y-4"><div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">Explore more</p><h2 className="mt-1 font-editorial text-2xl sm:text-3xl">More shelves to discover</h2></div><span className="text-[10px] text-muted-foreground">{visibleShelves.length} collections</span></div><div className="book-category-rail no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4">{visibleShelves.map((item,index)=><button key={item.id} onClick={()=>setActiveShelf(item.id)} className="group w-[190px] shrink-0 snap-start rounded-[20px] border border-border bg-surface p-3 text-left transition hover:-translate-y-1 hover:shadow-lift"><div className="flex h-[112px] items-center justify-center overflow-hidden rounded-[14px] bg-[#eee3d8]"><div className="w-[68px] rotate-[-7deg] transition duration-500 group-hover:rotate-0"><BookCover compact book={books.find(book=>book.shelf===item.id)!}/></div></div><p className="mt-3 font-editorial text-lg">{item.label}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.description}</p><span className="mt-3 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary">Browse shelf <ArrowRight className="size-3"/></span></button>)}</div></section>

      <footer className="flex flex-col gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Made for curious minds. Read at your own pace.</span><span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5"/>The XoraTV reading room</span></footer>
    </div>

    {readerOpen?<div role="dialog" aria-modal="true" aria-label={"Reading preview: "+activeBook.title} className="xora-reader-overlay fixed inset-0 z-[120] flex items-center justify-center bg-[#211914]/80 p-2 backdrop-blur-md sm:p-6">
      <section className="xora-reader relative flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-[#d7c3b1] bg-[#f4eadf] text-[#3b2d25] shadow-2xl sm:rounded-[30px]">
        <header className="flex items-center justify-between border-b border-[#d8c8b9] px-4 py-3 sm:px-6"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a05a3f]">XORA READER · PREVIEW</p><p className="mt-0.5 truncate font-editorial text-lg">{activeBook.title}</p></div><button onClick={()=>{setReaderOpen(false);setFlip(null)}} aria-label="Close reader" className="grid size-9 shrink-0 place-items-center rounded-full border border-[#d8c8b9] transition hover:bg-white/70"><X className="size-4"/></button></header>
        <div className="reader-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-4 sm:p-7" onPointerDown={e=>{touchStart.current={x:e.clientX,y:e.clientY}}} onPointerUp={e=>{if(!touchStart.current)return;const dx=e.clientX-touchStart.current.x;const dy=e.clientY-touchStart.current.y;touchStart.current=null;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.25)turn(dx<0?"next":"prev")}}>
          <div className="reader-book relative grid w-full max-w-3xl grid-cols-2 overflow-hidden rounded-[5px] bg-[#fffaf2] shadow-[0_24px_65px_-28px_rgba(52,35,24,.65)]">
            <article className="reader-page relative min-h-[340px] border-r border-[#e4d7c8] px-3 py-7 sm:min-h-[490px] sm:px-10 sm:py-12"><span className="text-[7px] font-semibold uppercase tracking-[.2em] text-[#ad7658] sm:text-[8px]">XORA EDITIONS</span><h2 className="mt-7 font-editorial text-[clamp(14px,4.2vw,29px)] leading-[1.08] tracking-tight sm:mt-12">{pages[page*2].heading}</h2><p className="mt-4 font-editorial text-[10px] leading-[1.8] text-[#756354] sm:mt-7 sm:text-base sm:leading-8">{pages[page*2].body}</p><span className="absolute bottom-3 left-3 text-[7px] text-[#a48e7d] sm:bottom-6 sm:left-10">{page*2+1}</span></article>
            <article className="reader-page relative bg-[#fffdf8] px-3 py-7 shadow-[-8px_0_18px_-18px_rgba(50,30,20,.8)] sm:px-10 sm:py-12"><span className="text-[7px] font-semibold uppercase tracking-[.2em] text-[#ad7658] sm:text-[8px]">A NEW CHAPTER</span><div className="mt-7 h-px w-8 bg-[#bd896a] sm:mt-12 sm:w-10"/><h3 className="mt-4 font-editorial text-[clamp(12px,3.6vw,22px)] leading-tight">{pages[page*2+1].heading}</h3><p className="mt-3 font-editorial text-[10px] italic leading-[1.8] text-[#756354] sm:mt-5 sm:text-base sm:leading-8">{pages[page*2+1].body}</p><span className="absolute bottom-3 right-3 text-[7px] text-[#a48e7d] sm:bottom-6 sm:right-10">{page*2+2}</span></article>
            {flip?<div key={flip.from+"-"+flip.to+"-"+flip.direction} onAnimationEnd={finishFlip} className={"reader-flip absolute inset-y-0 z-10 w-1/2 "+(flip.direction==="next"?"right-0 origin-left":"left-0 origin-right")} style={{animation:flip.direction==="next"?"reader-turn-next 680ms cubic-bezier(.22,.72,.18,1) both":"reader-turn-prev 680ms cubic-bezier(.22,.72,.18,1) both"}}><div className="reader-flip-front absolute inset-0 flex flex-col justify-between border border-[#e2d3c2] bg-[#fffdf8] p-3 sm:p-8"><span className="text-[7px] uppercase tracking-[.2em] text-[#ad7658]">XORA EDITIONS</span><p className="font-editorial text-[clamp(11px,3vw,20px)] leading-tight">{pages[flip.direction==="next"?flip.from*2+1:flip.from*2].heading}</p><span className="text-right text-[7px] text-[#a48e7d]">{flip.direction==="next"?flip.from*2+2:flip.from*2+1}</span></div><div className="reader-flip-back absolute inset-0 flex flex-col justify-between border border-[#e2d3c2] bg-[#fffaf2] p-3 sm:p-8"><span className="text-[7px] uppercase tracking-[.2em] text-[#ad7658]">A NEW CHAPTER</span><p className="font-editorial text-[clamp(11px,3vw,20px)] leading-tight">{pages[flip.direction==="next"?flip.to*2:flip.to*2+1].heading}</p><span className="text-right text-[7px] text-[#a48e7d]">{flip.direction==="next"?flip.to*2+1:flip.to*2+2}</span></div></div>:null}
          </div>
          <button onClick={()=>turn("prev")} disabled={page===0||!!flip} aria-label="Previous spread" className="reader-nav reader-nav-left absolute left-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-[#d8c8b9] bg-[#fffaf2]/90 shadow-lg disabled:opacity-25 sm:left-4 sm:size-11"><ChevronLeft className="size-4"/></button><button onClick={()=>turn("next")} disabled={page>=pages.length/2-1||!!flip} aria-label="Next spread" className="reader-nav reader-nav-right absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-[#d8c8b9] bg-[#fffaf2]/90 shadow-lg disabled:opacity-25 sm:right-4 sm:size-11"><ChevronRight className="size-4"/></button>
        </div>
        <footer className="flex items-center justify-between border-t border-[#d8c8b9] px-4 py-3 sm:px-6"><button disabled={page===0||!!flip} onClick={()=>turn("prev")} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d3c1b1] px-4 text-xs font-semibold disabled:opacity-35"><ChevronLeft className="size-4"/>Previous</button><span className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#8e7968]">Spread {page+1} of {pages.length/2}</span><button disabled={page>=pages.length/2-1||!!flip} onClick={()=>turn("next")} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#3c2d25] px-4 text-xs font-semibold text-white disabled:opacity-35">Turn page <ChevronRight className="size-4"/></button></footer>
      </section>
    </div>:null}
    <style>{`
      .xora-bookstore nav,.xora-bookstore .book-rail,.xora-bookstore .book-category-rail { scrollbar-width:none; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; }
      .xora-bookstore .xora-category-tabs { scrollbar-width:none !important; -ms-overflow-style:none !important; }
      .xora-bookstore .xora-category-tabs::-webkit-scrollbar { display:none !important; width:0 !important; height:0 !important; }
      .xora-bookstore nav::-webkit-scrollbar,.xora-bookstore .book-rail::-webkit-scrollbar,.xora-bookstore .book-category-rail::-webkit-scrollbar { display:none; }
      .reader-stage { touch-action:pan-y; user-select:none; -webkit-user-select:none; cursor:grab; }
      .reader-stage:active { cursor:grabbing; }
      .reader-book { perspective:1800px; transform-style:preserve-3d; }
      .reader-flip { transform-style:preserve-3d; backface-visibility:hidden; pointer-events:none; }
      .reader-flip-front,.reader-flip-back { backface-visibility:hidden; -webkit-backface-visibility:hidden; }
      .reader-flip-back { transform:rotateY(180deg); }
      @keyframes reader-turn-next { from { transform:rotateY(0deg); } to { transform:rotateY(-180deg); } }
      @keyframes reader-turn-prev { from { transform:rotateY(0deg); } to { transform:rotateY(180deg); } }
      @media (prefers-reduced-motion:reduce) { .reader-flip { animation-duration:.01ms !important; } .xora-bookstore * { scroll-behavior:auto !important; transition-duration:.01ms !important; } }
    `}</style>
  </AppShell>;
}
