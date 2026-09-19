import React from "react";
import { X, Loader2, Users } from "lucide-react";

export interface NewGroupModalProps {
  open: boolean;
  groupName: string;
  membersInput: string;
  busy: boolean;
  onGroupNameChange: (v: string) => void;
  onMembersInputChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function NewGroupModal({
  open,
  groupName,
  membersInput,
  busy,
  onGroupNameChange,
  onMembersInputChange,
  onClose,
  onSubmit,
}: NewGroupModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-card overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Create New Group
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

        <form onSubmit={onSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => onGroupNameChange(e.target.value)}
              placeholder="e.g., Film Club, Weekend Watchers"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Members</label>
            <textarea
              rows={3}
              value={membersInput}
              onChange={(e) => onMembersInputChange(e.target.value)}
              placeholder="user1, user2, user3"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="mt-0.5">•</span>
              Enter comma-separated usernames of the people you want to invite.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
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
              disabled={busy || !groupName.trim() || !membersInput.trim()}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
