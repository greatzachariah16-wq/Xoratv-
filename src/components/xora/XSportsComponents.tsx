import { useEffect, useState } from "react";
import { Heart, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type BroadcastChannel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories?: string[];
  streamUrl?: string;
  quality?: string | null;
  labels?: string[];
  language?: string;
  languages?: string[];
  ageLabel?: string;
  score?: number;
};

type ChipOption = { label: string; value: string };

const logoLuminanceCache = new Map<string, "light" | "dark" | "fallback">();

export function getChannelCountryCode(country?: string) {
  const raw = country?.trim();
  if (!raw) return null;
  if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
  const aliases: Record<string, string> = {
    usa: "US", gbr: "GB", uk: "GB", nga: "NG", can: "CA", zaf: "ZA", pol: "PL",
    ind: "IN", aus: "AU", fra: "FR", deu: "DE", ita: "IT", esp: "ES",
    bra: "BR", jpn: "JP", nld: "NL", mex: "MX", arg: "AR", nzl: "NZ",
    tur: "TR", prt: "PT", isr: "IL", poland: "PL", israel: "IL", china: "CN", russia: "RU",
    "united states": "US", "united kingdom": "GB", nigeria: "NG",
    "south africa": "ZA", india: "IN", australia: "AU", france: "FR",
    germany: "DE", italy: "IT", spain: "ES", brazil: "BR", japan: "JP",
    netherlands: "NL", mexico: "MX", argentina: "AR", "new zealand": "NZ",
    turkey: "TR", portugal: "PT", canada: "CA",
  };
  return aliases[raw.toLowerCase()] || null;
}

export function getCountryFlag(country?: string) {
  const code = getChannelCountryCode(country);
  if (!code) return "";
  return String.fromCodePoint(...Array.from(code).map((letter) => 127397 + letter.charCodeAt(0)));
}

export function getCountryName(country?: string) {
  const raw = country?.trim();
  if (!raw) return "International";
  const code = getChannelCountryCode(raw);
  if (code) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
    } catch {
      return code;
    }
  }
  return raw.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase());
}

export function formatMetadataLabel(value: string) {
  return value.trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase());
}
export function getChannelDisplayName(channel: Pick<BroadcastChannel, "name">) {
  return channel.name.replace(/\s*\(\d{3,4}p\)\s*$/i, "").trim();
}

export function getChannelQuality(channel: Pick<BroadcastChannel, "name" | "quality">) {
  const suffix = channel.name.match(/\s*\((\d{3,4}p)\)\s*$/i)?.[1];
  const value = channel.quality?.match(/\b(2160p|1440p|1080p|720p|576p|480p|4k|uhd|fhd|hd)\b/i)?.[1];
  return (value || suffix || "").toLowerCase() || null;
}

export function getChannelLanguage(channel: Pick<BroadcastChannel, "language" | "languages" | "labels">) {
  const candidate = channel.language || channel.languages?.[0]
    || channel.labels?.find((label) => /^(language:|lang:)/i.test(label))?.replace(/^(language:|lang:)/i, "");
  if (!candidate) return null;
  const aliases: Record<string, string> = {
    eng: "English", en: "English", pol: "Polish", pl: "Polish", spa: "Spanish",
    es: "Spanish", fra: "French", fre: "French", fr: "French", deu: "German",
    ger: "German", de: "German", ita: "Italian", it: "Italian", por: "Portuguese",
    pt: "Portuguese", ara: "Arabic", ar: "Arabic", heb: "Hebrew", he: "Hebrew",
    hin: "Hindi", hi: "Hindi", jpn: "Japanese", ja: "Japanese", kor: "Korean",
    ko: "Korean", zho: "Chinese", chi: "Chinese", zh: "Chinese", rus: "Russian",
    ru: "Russian", tur: "Turkish", tr: "Turkish", nld: "Dutch", dut: "Dutch",
    nl: "Dutch", swe: "Swedish", sv: "Swedish", ukr: "Ukrainian", uk: "Ukrainian",
  };
  const normalized = candidate.trim().toLowerCase();
  const baseLanguage = normalized.split(/[-_]/)[0];
  return aliases[normalized] || aliases[baseLanguage] || normalized.replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase());
}

export function SectionHeader({ title, subtitle, onSeeAll }: {
  title: string; subtitle?: string; onSeeAll?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[#6B5F57] dark:text-muted-foreground">{subtitle}</p> : null}
      </div>
      {onSeeAll ? (
        <button type="button" onClick={onSeeAll} className="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold text-primary hover:bg-primary/10">
          See all <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}

export function CategoryChips({ options, value, onChange, ariaLabel = "Categories", loading = false, sticky = false }: {
  options: ChipOption[]; value: string; onChange: (value: string) => void;
  ariaLabel?: string; loading?: boolean; sticky?: boolean;
}) {
  return (
    <div className={cn(
      "relative -mx-4 border-y border-border/70 bg-background/90 py-2 pl-4 pr-0 backdrop-blur-xl",
      sticky && "sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 shadow-[0_8px_18px_-18px_rgba(50,34,24,0.3)]",
    )}>
      <div className="hide-scrollbar touch-pan-x flex gap-2 overflow-x-auto overscroll-x-contain pb-1 pr-8" role="group" aria-label={ariaLabel}>
        {loading ? Array.from({ length: 5 }).map((_, index) => <span key={index} className="shimmer h-10 w-20 shrink-0 rounded-full" />) : options.map((option) => (
          <button
            key={option.value} type="button" onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "press min-h-11 shrink-0 rounded-full border px-4 text-xs font-bold transition-all duration-200",
              value === option.value ? "border-primary bg-primary text-primary-foreground shadow-[0_5px_14px_rgba(181,83,47,0.22)]" : "border-border bg-card/85 text-[#6B5F57] hover:border-primary/45 hover:text-foreground dark:text-muted-foreground",
            )}
          >{option.label}</button>
        ))}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/80 to-transparent" />
    </div>
  );
}

function StatusBadge({ channel, statusMode }: { channel: BroadcastChannel; statusMode: "sports" | "live" }) {
  const archive = statusMode === "sports" && (channel.id === "wwe-superstar-central"
    || /archive|24\/7/i.test([...(channel.labels || []), channel.quality || ""].join(" ")));
  return archive ? (
    <span className="inline-flex shrink-0 items-center rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md">Archive 24/7</span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200/25 bg-[#a9342c] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
      <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" /> Live
    </span>
  );
}

export function LogoTile({ channel, statusMode = "sports" }: {
  channel: BroadcastChannel; statusMode?: "sports" | "live";
}) {
  const [tileMode, setTileMode] = useState<"light" | "dark" | "fallback">(
    channel.logo ? logoLuminanceCache.get(channel.logo) || "fallback" : "light",
  );
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = channel.logo;
    if (!url) return;
    const cached = logoLuminanceCache.get(url);
    if (cached) {
      setTileMode(cached);
      return;
    }
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        context.clearRect(0, 0, 32, 32);
        context.drawImage(probe, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        let total = 0;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 16) continue;
          const luminance = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
          total += luminance;
          count += 1;
        }
        const result = count && total / count > 0.7 ? "dark" : "light";
        logoLuminanceCache.set(url, result);
        setTileMode(result);
      } catch {
        logoLuminanceCache.set(url, "fallback");
        setTileMode("fallback");
      }
    };
    probe.onerror = () => {
      logoLuminanceCache.set(url, "fallback");
      if (!cancelled) setTileMode("fallback");
    };
    probe.src = url;
    return () => { cancelled = true; };
  }, [channel.logo]);

  return (
    <div className={cn(
      "relative flex aspect-[16/10] w-full shrink-0 items-center justify-center rounded-[16px] border p-4 transition-colors duration-200",
      tileMode === "dark" ? "border-[#39312c] bg-[#2A2420]" : "border-[#e3d4c7] bg-[#F4EFE9]",
      tileMode === "fallback" && "shadow-[inset_0_0_0_1px_rgba(97,76,61,0.10)]",
    )}>
      <div className="absolute left-2 top-2 z-30"><StatusBadge channel={channel} statusMode={statusMode} /></div>
      {channel.logo && !logoFailed ? (
        <img
          src={channel.logo} alt="" aria-hidden="true" loading="lazy" decoding="async"
          onLoad={() => setLogoLoaded(true)} onError={() => setLogoFailed(true)}
          className={cn("relative z-0 h-auto w-auto max-h-[56%] max-w-full object-contain transition-opacity duration-300",
            tileMode === "fallback" && "drop-shadow-[0_2px_4px_rgba(42,36,32,0.18)]",
            logoLoaded ? "opacity-100" : "opacity-0")}
        />
      ) : (
        <span className="relative z-0 grid size-[60%] min-h-10 min-w-10 max-w-[112px] place-items-center rounded-[15px] border border-[#d9bda9] bg-gradient-to-br from-[#fff9f1] via-[#f0dfd1] to-[#d9bca8] px-2 text-center font-display text-[clamp(17px,4vw,26px)] font-bold text-[#7d402a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          {getChannelDisplayName(channel).slice(0, 3).toUpperCase()}
        </span>
      )}
      {getChannelQuality(channel) ? (
        <span className={cn("absolute bottom-2 left-2 z-20 rounded-full border px-2 py-1 text-[9px] font-extrabold tracking-[0.1em] shadow-sm",
          tileMode === "dark" ? "border-white/15 bg-white/95 text-[#4d3a30]" : "border-[#ded0c3] bg-white/95 text-[#4d3a30]")}>
          {getChannelQuality(channel)}
        </span>
      ) : null}
    </div>
  );
}

export function ChannelCard<T extends BroadcastChannel>({
  channel, active, index, onSelect, favorite = false, onFavorite, playing = false, statusMode = "sports", metaMode = "category",
}: {
  channel: T; active: boolean; index: number; onSelect: (channel: T) => void;
  favorite?: boolean; onFavorite?: (channel: T) => void; playing?: boolean;
  statusMode?: "sports" | "live"; metaMode?: "category" | "language";
}) {
  return (
    <div className={cn(
      "relative flex h-full min-w-0 flex-col rounded-[22px] border bg-card p-2.5 shadow-[0_7px_22px_rgba(74,48,34,0.07)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(74,48,34,0.12)]",
      active ? "border-primary/60 ring-2 ring-primary/15" : "border-border/80",
    )} style={{ animationDelay: Math.min(index % 8, 7) * 36 + "ms" }}>
      <button type="button" onClick={() => onSelect(channel)} aria-pressed={active}
        className="press rise group flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 active:scale-[0.97]">
        <div className="relative w-full">
          <LogoTile channel={channel} statusMode={statusMode} />
          {playing ? <span className="absolute left-2 top-10 z-30 rounded-full bg-primary px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.1em] text-white shadow-sm">Playing</span> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-0.5 pb-0.5 pt-2">
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] font-bold leading-5 tracking-[-0.01em] text-card-foreground sm:text-sm">{getChannelDisplayName(channel)}</p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[10px] leading-4 text-[#6B5F57] dark:text-muted-foreground sm:text-[11px]">
              {getCountryFlag(channel.country)} {getCountryName(channel.country)}
              {metaMode === "language" && getChannelLanguage(channel) ? " · " + getChannelLanguage(channel) : null}
              {metaMode === "category" ? " · " + formatMetadataLabel(channel.categories?.[0] || "Sports") : null}
            </p>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_5px_12px_rgba(181,83,47,0.22)]">
              <Play className="ml-0.5 size-3 fill-current" />
            </span>
          </div>
        </div>
      </button>
      {onFavorite ? (
        <button type="button" aria-label={favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={favorite}
          onClick={() => onFavorite(channel)}
          className="press absolute right-[14px] top-[14px] z-40 grid size-11 place-items-center rounded-full border border-white/60 bg-white/95 text-[#6d4937] shadow-sm transition active:scale-[0.97]">
          <Heart className={cn("size-4", favorite && "fill-current text-[#b5532f]")} />
        </button>
      ) : null}
    </div>
  );
}