import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, MessageCircle, UserRound, ShieldCheck } from "lucide-react";

export interface NewDmModalProps {
  open: boolean;
  username: string;
  busy: boolean;
  resolvedUser?: { id: string; username: string; display_name: string; avatar_url?: string | null } | null;
  onUsernameChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function NewDmModal({
  open,
  username,
  busy,
  resolvedUser,
  onUsernameChange,
  onClose,
  onSubmit,
}: NewDmModalProps) {
  const [isMounted, setIsMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      setIsClosing(false);
      return;
    }
    if (!isMounted) return;
    setIsClosing(true);
    const timeout = window.setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [open, isMounted]);

  if (!isMounted || !portalTarget) return null;

  return createPortal(
    <div className={`xora-chat-floating-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm ${isClosing ? "is-closing" : ""}`}>
      <div className={`float-wrap xora-chat-float-wrap xora-chat-float-wrap--large ${isClosing ? "is-closing" : ""}`}>
      <div className={`xora-chat-floating-modal float-surface xora-chat-float-surface w-full max-w-md rounded-2xl bg-surface border border-border shadow-card overflow-hidden`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg text-foreground flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            New private message
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground active:scale-95 transition-all"
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="space-y-1"><label className="text-sm font-semibold text-foreground">Who would you like to message?</label><p className="text-xs text-muted-foreground">Find their XoraTV profile before opening a private conversation.</p></div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-7 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
                disabled={busy}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter their username with or without @. We’ll show you the matching profile first.
            </p>
          </div>

          {resolvedUser ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[rgba(181,80,46,.14)] bg-[#F8EFE8] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
              {resolvedUser.avatar_url ? <img src={resolvedUser.avatar_url} alt="" className="size-11 rounded-full object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-[#EEDACD] text-[#9B482C]"><UserRound className="size-5" /></span>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#30231D]">{resolvedUser.display_name}</p><p className="text-xs text-[#79685D]">@{resolvedUser.username}</p></div>
              <ShieldCheck className="size-5 shrink-0 text-[#478A69]" />
            </div>
          ) : null}
          <div className="xora-chat-modal-actions flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-2 active:scale-[0.98] transition-all"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !username.trim()}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : resolvedUser ? "Open conversation" : "Find person"}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>,
    portalTarget,
  );
}
