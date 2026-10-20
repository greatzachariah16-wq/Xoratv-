import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { customGetSession, customSignOut, type CustomAuthUser } from "@/integrations/custom-auth";
import type { ProfileRecord } from "@/integrations/firebase/types";

export type Profile = ProfileRecord;
export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
export interface Session { user: User; }
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue>({
  session:null,user:null,profile:null,isAdmin:false,loading:true,signOut:async()=>{}
});
function mapUser(value: CustomAuthUser): User {
  return { id:value.id,email:value.email,displayName:value.displayName,photoURL:value.photoURL };
}
export function AuthProvider({children}:{children:ReactNode}) {
  const [authUser,setAuthUser] = useState<CustomAuthUser|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{
      try { const next=await customGetSession(); if(alive) setAuthUser(next); }
      catch { if(alive) setAuthUser(null); }
      finally { if(alive) setLoading(false); }
    };
    const changed=()=>{void refresh();};
    void refresh();
    window.addEventListener("xora-auth-changed",changed);
    window.addEventListener("focus",changed);
    return ()=>{alive=false;window.removeEventListener("xora-auth-changed",changed);window.removeEventListener("focus",changed);};
  },[]);
  const session=authUser?{user:mapUser(authUser)}:null;
  const profile=(authUser?.profile as Profile|null)??null;
  const adminUids=useMemo(()=>((import.meta.env?.VITE_ADMIN_UIDS as string|undefined)||"").split(",").map(v=>v.trim()).filter(Boolean),[]);
  const isAdmin=Boolean(profile?.is_admin===true || (authUser && adminUids.includes(authUser.id)));
  const value=useMemo<AuthContextValue>(()=>({
    session,user:session?.user??null,profile,isAdmin,loading,
    signOut:async()=>{await customSignOut();setAuthUser(null);}
  }),[session,profile,isAdmin,loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){return useContext(AuthContext);}
