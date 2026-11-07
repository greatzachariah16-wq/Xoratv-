import { useState } from "react";
import { Compass, Play, Sparkles, Star } from "lucide-react";
import { CategoryChips } from "@/components/xora/XSportsComponents";

export type AgeFilter = "All" | "Preschool" | "Family" | "Older kids";

export function getChannelAgeLabel(channel: { ageLabel?: string; categories?: string[]; labels?: string[] }) {
  const values = [channel.ageLabel, ...(channel.categories || []), ...(channel.labels || [])].filter(Boolean) as string[];
  return (["Preschool", "Family", "Older kids"] as const).find((age) =>
    values.some((value) => value.toLowerCase().replace(/[_-]/g, " ").includes(age.toLowerCase())),
  ) || null;
}

export function sortKidsChannels<T extends { name: string; country?: string; language?: string; languages?: string[]; labels?: string[] }>(channels: T[], countryCode: (country?: string) => string | null, channelLanguage: (channel: T) => string | null) {
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  const [deviceLanguage = "en", deviceRegion = ""] = locale.split("-");
  let preferredLanguage = deviceLanguage.toLowerCase();
  try {
    preferredLanguage = new Intl.DisplayNames(["en"], { type: "language" }).of(deviceLanguage) || preferredLanguage;
  } catch { /* keep the browser language code */ }
  const region = deviceRegion.toUpperCase();
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const rank = (channel: T) => {
    const language = channelLanguage(channel)?.toLowerCase();
    if ((region && countryCode(channel.country) === region) || (language && language === preferredLanguage.toLowerCase())) return 0;
    if (language === "english" || language === "en") return 1;
    return 2;
  };
  return [...channels].sort((left, right) => {
    const difference = rank(left) - rank(right);
    if (difference) return difference;
    const leftDigit = /^\d/.test(left.name) ? 1 : 0;
    const rightDigit = /^\d/.test(right.name) ? 1 : 0;
    if (leftDigit !== rightDigit) return leftDigit - rightDigit;
    return collator.compare(left.name, right.name);
  });
}

export const AGE_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Preschool", value: "Preschool" },
  { label: "Family", value: "Family" },
  { label: "Older kids", value: "Older kids" },
];

export function KidsHeader() {
  return (
    <header className="relative isolate overflow-hidden rounded-[24px] bg-gradient-to-br from-[#fff8ed] via-[#f7f0ff] to-[#eef8f2] px-4 py-4 shadow-[0_12px_30px_-25px_rgba(86,55,37,0.38)] dark:from-[#302722] dark:via-[#2c2732] dark:to-[#24302b]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-[#e8c4a8]/35 blur-2xl dark:bg-[#b5532f]/15" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[-3rem] left-1/3 size-28 rounded-full bg-[#d8c9f3]/35 blur-2xl dark:bg-[#a38acb]/10" />
      <div className="relative flex flex-col gap-2">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b5035] dark:text-[#e6ad91]">
          <Sparkles className="size-3.5" /> XORA Kids
        </p>
        <h1 className="whitespace-nowrap font-display text-[clamp(17px,5.2vw,23px)] font-semibold leading-tight tracking-[-0.035em] text-[#382d27] dark:text-[#fff4e9]">
          A little corner for big imaginations.
        </h1>
      </div>
    </header>
  );
}

export function SegmentedControl({ value, onChange }: {
  value: "cartoons" | "live"; onChange: (value: "cartoons" | "live") => void;
}) {
  return (
    <div className="relative grid h-11 grid-cols-2 rounded-full border border-[#e2d6cb] bg-[#eee7df] p-1 shadow-inner dark:border-white/10 dark:bg-[#28231f]" role="group" aria-label="Kids content">
      <span aria-hidden="true" className={"absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-primary shadow-[0_5px_14px_rgba(181,83,47,0.24)] transition-transform duration-200 motion-reduce:transition-none " + (value === "live" ? "translate-x-full" : "translate-x-0")} />
      <button type="button" onClick={() => onChange("cartoons")} aria-pressed={value === "cartoons"} className={"relative z-10 min-h-[36px] rounded-full text-xs font-bold transition-colors active:scale-[0.97] " + (value === "cartoons" ? "text-primary-foreground" : "text-[#6B5F57] dark:text-[#c5b9af]")}>Shows</button>
      <button type="button" onClick={() => onChange("live")} aria-pressed={value === "live"} className={"relative z-10 min-h-[36px] rounded-full text-xs font-bold transition-colors active:scale-[0.97] " + (value === "live" ? "text-primary-foreground" : "text-[#6B5F57] dark:text-[#c5b9af]")}>Live channels</button>
    </div>
  );
}

export function AgeChips({ value, onChange }: { value: AgeFilter; onChange: (value: AgeFilter) => void }) {
  return <CategoryChips options={AGE_OPTIONS} value={value} onChange={(next) => onChange(next as AgeFilter)} ariaLabel="Filter by age group" />;
}

function RattleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="7" r="3.5" /><path d="M10.5 9.5 17 16" /><path d="M14.8 13.8 18 10.6l3.2 3.2-3.2 3.2z" /><path d="m5.5 10 1.5 2" />
    </svg>
  );
}

function PosterAgeMark({ ageLabel }: { ageLabel: string }) {
  const normalized = ageLabel.toLowerCase();
  return (
    <span className="grid size-8 place-items-center rounded-full border border-white/70 bg-white/80 text-[#57453a] shadow-sm backdrop-blur">
      {normalized === "preschool" ? <RattleMark /> : normalized === "older kids" ? <Compass className="size-4" /> : <Star className="size-4" />}
    </span>
  );
}

type CartoonPosterData = { title: string; ageLabel: string; posterUrl?: string };

export function PosterFallback({ cartoon }: { cartoon: CartoonPosterData }) {
  const hash = Array.from(cartoon.title).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  const hue = hash % 360;
  const secondHue = (hue + 28 + (hash % 19)) % 360;
  const thirdHue = (hue + 58) % 360;
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[16px]"
      style={{ backgroundImage: "linear-gradient(145deg, hsl(" + hue + " 42% 88%), hsl(" + secondHue + " 48% 81%) 58%, hsl(" + thirdHue + " 44% 92%))" }}>
      <span className="select-none font-display text-[clamp(64px,19vw,112px)] font-bold leading-none tracking-[-0.09em] text-[#58483f]/45">
        {cartoon.title.trim().charAt(0).toUpperCase()}
      </span>
      <span className="absolute right-2 top-2"><PosterAgeMark ageLabel={cartoon.ageLabel} /></span>
    </div>
  );
}

export function ShowCard<T extends CartoonPosterData>({ cartoon, index, onSelect }: {
  cartoon: T; index: number; onSelect: (cartoon: T) => void;
}) {
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <button type="button" onClick={() => onSelect(cartoon)}
      className="kids-card-enter group min-w-0 overflow-hidden rounded-[18px] bg-transparent text-left transition-transform duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      style={{ animationDelay: Math.min(index % 8, 7) * 34 + "ms" }}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[16px] border border-[#e5d9cf] bg-[#f0e8df] shadow-[0_8px_22px_-17px_rgba(58,40,30,0.55)] dark:border-white/10 dark:bg-[#29231f]">
        {cartoon.posterUrl && !posterFailed ? (
          <img src={cartoon.posterUrl} alt={cartoon.title + " poster"} loading="lazy" decoding="async"
            onLoad={() => setPosterLoaded(true)} onError={() => setPosterFailed(true)}
            className={"h-full w-full object-cover transition-opacity duration-300 group-hover:scale-[1.025] " + (posterLoaded ? "opacity-100" : "opacity-0")} />
        ) : null}
        {!cartoon.posterUrl || posterFailed ? <PosterFallback cartoon={cartoon} /> : null}
        <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play className="size-3.5 fill-current" />
        </span>
      </div>
      <div className="px-0.5 pb-1 pt-2">
        <p className="line-clamp-2 min-h-10 font-display text-[13px] font-semibold leading-5 text-[#382f29] dark:text-[#f4e9df]">{cartoon.title}</p>
        <p className="mt-1 text-[10px] font-medium leading-4 text-[#6B5F57] dark:text-[#bcb0a6]">{cartoon.year || "Year unknown"} · {cartoon.ageLabel}</p>
      </div>
    </button>
  );
}

export function ShowGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index}>
          <div className="shimmer aspect-[2/3] rounded-[16px]" />
          <div className="space-y-2 px-0.5 pt-2.5">
            <div className="shimmer h-3 w-4/5 rounded-full" />
            <div className="shimmer h-3 w-2/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChannelGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-[22px] border border-border/70 bg-card p-2.5">
          <div className="shimmer aspect-[16/10] rounded-[16px]" />
          <div className="space-y-2 px-0.5 pb-1 pt-3">
            <div className="shimmer h-3 w-4/5 rounded-full" />
            <div className="shimmer h-3 w-3/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KidsEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[#d8c9bd] bg-[#fffaf4]/80 px-5 py-10 text-center dark:border-white/10 dark:bg-[#29231f]">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f2e4da] text-[#96553b] dark:bg-[#3a2d26] dark:text-[#e6ad91]">
        <Sparkles className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[#493c33] dark:text-[#f4e9df]">{message}</p>
      <p className="mt-1 text-xs text-[#6B5F57] dark:text-[#bcb0a6]">Try another age group or search.</p>
    </div>
  );
}
