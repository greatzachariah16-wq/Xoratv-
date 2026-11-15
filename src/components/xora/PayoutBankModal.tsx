import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

type PayoutDetails = { accountName: string; accountNumber: string; bankName: string };
type BankOption = { name: string; code: string };
type Props = {
  open: boolean;
  onClose: () => void;
  initialValues: PayoutDetails;
  onSave: (details: PayoutDetails) => Promise<void>;
};

const BANKS: BankOption[] = [
  { name: "Access Bank", code: "access-bank" }, { name: "ALAT by Wema", code: "alat-by-wema" },
  { name: "Citibank Nigeria", code: "citibank-nigeria" }, { name: "Ecobank Nigeria", code: "ecobank" },
  { name: "FCMB", code: "fcmb" }, { name: "Fidelity Bank", code: "fidelity-bank" },
  { name: "First Bank of Nigeria", code: "first-bank" }, { name: "Globus Bank", code: "globus-bank" },
  { name: "GTBank", code: "gtbank" }, { name: "Jaiz Bank", code: "jaiz-bank" },
  { name: "Keystone Bank", code: "keystone-bank" }, { name: "Kuda", code: "kuda" },
  { name: "Moniepoint", code: "moniepoint" }, { name: "OPay", code: "opay" },
  { name: "PalmPay", code: "palmpay" }, { name: "Polaris Bank", code: "polaris-bank" },
  { name: "PremiumTrust Bank", code: "premiumtrust-bank" }, { name: "Providus Bank", code: "providus-bank" },
  { name: "Stanbic IBTC", code: "stanbic-ibtc" }, { name: "Sterling Bank", code: "sterling-bank" },
  { name: "UBA", code: "uba" }, { name: "Union Bank", code: "union-bank" },
  { name: "Unity Bank", code: "unity-bank" }, { name: "Wema Bank", code: "wema-bank" },
  { name: "Zenith Bank", code: "zenith-bank" },
];

function BankSheet({ open, selected, onSelect, onClose }: {
  open: boolean; selected: string; onSelect: (bank: BankOption) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => BANKS.filter(bank => bank.name.toLowerCase().includes(query.trim().toLowerCase())), [query]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      window.cancelAnimationFrame(frame);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end" role="presentation">
      <button type="button" aria-label="Close bank picker" onClick={onClose} className="absolute inset-0 bg-[color-mix(in_oklab,var(--channel-text-strong)_45%,transparent)] backdrop-blur-[3px] motion-safe:animate-[xoraBankFade_.18s_ease-out]"/>
      <section role="dialog" aria-modal="true" aria-label="Select your bank" className="relative flex max-h-[82dvh] w-full flex-col rounded-t-[32px] border border-border bg-[var(--channel-surface-solid)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-lift motion-safe:animate-[xoraBankUp_.22s_ease-out]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--channel-hairline)]"/>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-[var(--channel-text-strong)]">Select your bank</h3><button type="button" onClick={onClose} aria-label="Close bank picker" className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground"><X className="size-4"/></button></div>
        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search banks" autoComplete="off" className="h-12 w-full rounded-full border border-border bg-[var(--channel-surface)] pl-11 pr-4 text-sm outline-none transition focus:border-[var(--channel-accent)] focus:ring-4 focus:ring-[var(--channel-accent)]/10"/>
        </label>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-2" style={{ WebkitOverflowScrolling: "touch" }}>
          {filtered.length ? filtered.map(bank => {
            const active = selected === bank.name;
            return <button key={bank.code} type="button" onClick={() => { onSelect(bank); onClose(); }} className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 text-left transition active:scale-[.99] ${active ? "bg-[var(--channel-accent)]/10" : "hover:bg-[var(--channel-surface)] active:bg-[var(--channel-surface)]"}`}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-[var(--channel-accent)] text-white" : "bg-[var(--channel-accent)]/10 text-[var(--channel-accent)]"}`}>{bank.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--channel-text-strong)]">{bank.name}</span>
              {active ? <Check className="size-5 shrink-0 text-[var(--channel-accent)]"/> : null}
            </button>;
          }) : <p className="px-3 py-8 text-center text-sm leading-6 text-muted-foreground">No bank matches “{query}”. Check the spelling.</p>}
        </div>
      </section>
    </div>, document.body
  );
}

export function PayoutBankModal({ open, onClose, initialValues, onSave }: Props) {
  const [accountName, setAccountName] = useState(initialValues.accountName);
  const [accountNumber, setAccountNumber] = useState(initialValues.accountNumber);
  const [bankName, setBankName] = useState(initialValues.bankName);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const selectBank = useCallback((bank: BankOption) => setBankName(bank.name), []);

  useEffect(() => {
    if (!open) return;
    setAccountName(initialValues.accountName);
    setAccountNumber(initialValues.accountNumber);
    setBankName(initialValues.bankName);
    setError("");
  }, [open, initialValues.accountName, initialValues.accountNumber, initialValues.bankName]);

  const valid = Boolean(bankName && accountNumber.length === 10 && accountName.trim());
  const fieldClass = "h-14 w-full rounded-full border border-[var(--channel-hairline)] bg-[var(--channel-surface)] px-5 text-sm text-[var(--channel-text-strong)] outline-none transition placeholder:text-muted-foreground focus:border-[var(--channel-accent)] focus:ring-4 focus:ring-[var(--channel-accent)]/10";

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--channel-text-strong)_52%,transparent)] p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="payout-bank-title">
      <section className="flex max-h-[calc(100dvh-24px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-border bg-[var(--channel-surface-solid)] shadow-lift">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--channel-accent)]">Secure payout setup</p><h3 id="payout-bank-title" className="mt-1 text-xl font-semibold text-[var(--channel-text-strong)]">Where should we send your earnings?</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Payouts go to this account. Make sure the name matches your bank.</p></div>
          <button type="button" onClick={onClose} aria-label="Close bank details" className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"><X className="size-4"/></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-3 sm:px-6">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold">Bank</span><button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" className={`flex h-14 w-full items-center justify-between rounded-full border border-[var(--channel-hairline)] bg-[var(--channel-surface)] px-5 text-left text-sm outline-none transition focus:border-[var(--channel-accent)] focus:ring-4 focus:ring-[var(--channel-accent)]/10 ${bankName ? "text-[var(--channel-text-strong)]" : "text-muted-foreground"}`}><span className="truncate">{bankName || "Select your bank"}</span><ChevronDown className="ml-3 size-4 shrink-0"/></button></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold">Account number</span><input inputMode="numeric" autoComplete="off" maxLength={10} value={accountNumber} onChange={event => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter 10-digit account number" className={fieldClass + " tracking-[.08em]"} /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold">Recipient account name</span><input value={accountName} onChange={event => setAccountName(event.target.value)} autoComplete="name" placeholder="Name as registered with your bank" className={fieldClass}/></label>
          {error ? <p role="alert" className="text-xs leading-5 text-red-600">{error}</p> : null}
        </div>
        <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-[var(--channel-surface-solid)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="h-14 rounded-full border border-border bg-white px-6 text-sm font-semibold text-[var(--channel-text-strong)] transition active:scale-[.98]">Cancel</button>
          <button type="button" onClick={async () => { setSaving(true); setError(""); try { await onSave({ accountName: accountName.trim(), accountNumber, bankName }); onClose(); } catch (cause) { setError(cause instanceof Error ? "Couldn't save. Try again." : "Couldn't save. Try again."); } finally { setSaving(false); } }} disabled={!valid || saving} className="h-14 rounded-full bg-gradient-to-r from-[var(--channel-accent)] to-[color-mix(in_oklab,var(--channel-accent),var(--channel-text-strong)_22%)] px-6 text-sm font-semibold text-white shadow-[0_7px_18px_color-mix(in_oklab,var(--channel-accent)_22%,transparent)] transition active:scale-[.98] disabled:scale-100 disabled:opacity-45 disabled:shadow-none">{saving ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin"/>Saving…</span> : "Save bank details"}</button>
        </div>
      </section>
      <BankSheet open={sheetOpen} selected={bankName} onSelect={selectBank} onClose={closeSheet}/>
    </div>, document.body
  );
}
