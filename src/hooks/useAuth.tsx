import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth, isFirebaseConfigured } from "@/integrations/firebase/config";
import { getProfile } from "@/integrations/firebase/rtdb";
import { ensureProfileExists, signOutCurrentUser } from "@/integrations/firebase/auth";
import type { Tables } from "@/integrations/firebase/types";

export type Profile = Tables<"profiles">;

export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Session {
  user: User;
  access_token?: string;
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isFirebaseConfigured()) {
      const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
        if (fbUser) {
          const userObj: User = {
            id: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
          };
          setSession({ user: userObj });
        } else {
          setSession(null);
        }
        setLoading(false);
        queryClient.invalidateQueries({ queryKey: ["me"] });
      });
      return () => unsubscribe();
    } else {
      // Offline / Developer / Demo session when Firebase is NOT configured
      const stored = localStorage.getItem("xora_demo_user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSession(parsed);
        } catch {
          setSession({
            user: {
              id: "demo-user",
              email: "viewer@xora.tv",
              displayName: "Horror Fan",
              photoURL:
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
            },
          });
        }
      } else {
        setSession({
          user: {
            id: "demo-user",
            email: "viewer@xora.tv",
            displayName: "Horror Fan",
            photoURL:
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          },
        });
      }
      setLoading(false);
    }
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const { data: profile } = useQuery({
    queryKey: ["me", "profile", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;

      if (isFirebaseConfigured()) {
        const existing = await getProfile(userId);
        if (existing) return existing;

        if (auth.currentUser && auth.currentUser.uid === userId) {
          return await ensureProfileExists(auth.currentUser);
        }
        return null;
      }

      // Local demo profile fallback when Firebase is unconfigured
      return {
        id: userId,
        username: session?.user.displayName?.toLowerCase().replace(/\s+/g, "_") || "horror_fan",
        display_name: session?.user.displayName || "Horror Fan",
        avatar_url:
          session?.user.photoURL ||
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        bio: "Horror cinephile streaming full-length classics.",
        is_admin: false,
        created_at: new Date().toISOString(),
      };
    },
  });

  const adminUids = useMemo(() => {
    const raw =
      (typeof import.meta !== "undefined" &&
        (import.meta.env?.VITE_ADMIN_UIDS as string | undefined)) ||
      "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, []);

  const isAdmin = useMemo(() => {
    if (!session?.user) return false;
    // 1. RTDB profile is_admin flag
    if (profile?.is_admin === true) return true;
    // 2. VITE_ADMIN_UIDS allowlist match
    if (adminUids.includes(session.user.id)) return true;
    return false;
  }, [session?.user, profile?.is_admin, adminUids]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profile ?? null,
      isAdmin,
      loading,
      signOut: async () => {
        await signOutCurrentUser();
        setSession(null);
        queryClient.clear();
      },
    }),
    [session, profile, isAdmin, loading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
