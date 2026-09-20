import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Search, UserCheck, Users, ShieldCheck } from "lucide-react";
import { adminRegisteredUsersQuery } from "@/lib/api";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { timeAgo } from "@/lib/format";

export function AdminUsersDirectory() {
  const { data: users, isPending } = useQuery(adminRegisteredUsersQuery());
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = (users || []).filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.display_name && u.display_name.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.id && u.id.toLowerCase().includes(term))
    );
  });

  return (
    <section
      id="users"
      className="scroll-mt-6 rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <UserCheck className="size-3.5" />
            Verified User Directory
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Registered Users ({users?.length || 0})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Genuine human account sign-ups on XoraTV. External content providers and candidate stubs
            are excluded.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users or email..."
            className="w-full rounded-full border border-border bg-surface pl-9 pr-4 py-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
        {isPending ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading registered users...
          </div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-background/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Account Name</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">User ID</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar path={user.avatar_url} name={user.display_name} size={32} />
                        <div>
                          <span className="font-semibold text-foreground block">
                            {user.display_name || "Anonymous User"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      @{user.username || "no_username"}
                    </td>
                    <td className="px-4 py-3">
                      {user.email ? (
                        <a
                          href={`mailto:${user.email}`}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <Mail className="size-3" /> {user.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground italic">No email attached</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                      {user.id}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.created_at ? timeAgo(user.created_at) : "Recently"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-semibold">No registered users found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchTerm
                ? "Try clearing your search query."
                : "When users sign up with an account on Xora, they appear here."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
