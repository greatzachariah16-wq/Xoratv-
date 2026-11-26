[stdout cut: the last 4000 of 35779 bytes]
 border border-[#e2d3c2] bg-[#fffaf2] p-3 sm:p-8">
                      <span className="text-[7px] uppercase tracking-[.2em] text-[#ad7658]">
                        A NEW CHAPTER
                      </span>
                      <p className="font-editorial text-[clamp(11px,3vw,20px)] leading-tight">
                        {pages[flip.direction === "next" ? flip.to * 2 : flip.to * 2 + 1].heading}
                      </p>
                      <span className="text-right text-[7px] text-[#a48e7d]">
                        {flip.direction === "next" ? flip.to * 2 + 1 : flip.to * 2 + 2}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => turn("prev")}
                disabled={page === 0 || !!flip}
                aria-label="Previous spread"
                className="reader-nav reader-nav-left absolute left-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-[#d8c8b9] bg-[#fffaf2]/90 shadow-lg disabled:opacity-25 sm:left-4 sm:size-11"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => turn("next")}
                disabled={page >= pages.length / 2 - 1 || !!flip}
                aria-label="Next spread"
                className="reader-nav reader-nav-right absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-[#d8c8b9] bg-[#fffaf2]/90 shadow-lg disabled:opacity-25 sm:right-4 sm:size-11"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <footer className="flex items-center justify-between border-t border-[#d8c8b9] px-4 py-3 sm:px-6">
              <button
                disabled={page === 0 || !!flip}
                onClick={() => turn("prev")}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d3c1b1] px-4 text-xs font-semibold disabled:opacity-35"
              >
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <span className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#8e7968]">
                Spread {page + 1} of {pages.length / 2}
              </span>
              <button
                disabled={page >= pages.length / 2 - 1 || !!flip}
                onClick={() => turn("next")}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#3c2d25] px-4 text-xs font-semibold text-white disabled:opacity-35"
              >
                Turn page <ChevronRight className="size-4" />
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      <style>{`
      .xora-bookstore nav,.xora-bookstore .book-rail,.xora-bookstore .book-category-rail { scrollbar-width:none; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; }
      .xora-bookstore nav::-webkit-scrollbar,.xora-bookstore .book-rail::-webkit-scrollbar,.xora-bookstore .book-category-rail::-webkit-scrollbar { display:none; }
      .reader-book { perspective:1800px; transform-style:preserve-3d; }
      .reader-flip { transform-style:preserve-3d; backface-visibility:hidden; pointer-events:none; }
      .reader-flip-front,.reader-flip-back { backface-visibility:hidden; -webkit-backface-visibility:hidden; }
      .reader-flip-back { transform:rotateY(180deg); }
      @keyframes reader-turn-next { from { transform:rotateY(0deg); } to { transform:rotateY(-180deg); } }
      @keyframes reader-turn-prev { from { transform:rotateY(0deg); } to { transform:rotateY(180deg); } }
      @media (prefers-reduced-motion:reduce) { .reader-flip { animation-duration:.01ms !important; } .xora-bookstore * { scroll-behavior:auto !important; transition-duration:.01ms !important; } }
    `}</style>
    </AppShell>
  );
}