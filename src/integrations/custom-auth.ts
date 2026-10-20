import type { ProfileRecord } from "./firebase/types";

export interface CustomAuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  profile: ProfileRecord;
}
type ApiResult<T = unknown> = { ok: boolean; user?: CustomAuthUser | null; error?: string; message?: string; recoveryCode?: string | null } & T;

async function request<T = unknown>(body?: Record<string, unknown>): Promise<ApiResult<T>> {
  const response = await fetch("/api/auth", {
    method: body ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || result.ok === false) throw new Error(result.error || "Authentication request failed.");
  return result;
}
export async function customSignUp(email: string, password: string, username: string, firstName: string, lastName: string) {
  const result = await request({action:"register", email, password, username, firstName, lastName});
  if (!result.user || !result.recoveryCode) throw new Error("Recovery code was not returned.");
  window.dispatchEvent(new Event("xora-auth-changed"));
  return { user: result.user, recoveryCode: result.recoveryCode, message: result.message || "Account created." };
}
export async function customSignIn(identifier: string, password: string) {
  const result = await request({action:"login", identifier, password});
  if (!result.user) throw new Error("Sign-in did not return a user session.");
  window.dispatchEvent(new Event("xora-auth-changed"));
  return result.user.profile;
}
export async function customGetSession() {
  const result = await request();
  return result.user ?? null;
}
export async function customSignOut() {
  await request({action:"logout"});
  window.dispatchEvent(new Event("xora-auth-changed"));
}
export async function customRecoverWithCode(identifier: string, recoveryCode: string, password: string) {
  const result = await request({action:"recover_with_code",identifier,recoveryCode,password});
  if (!result.user || !result.recoveryCode) throw new Error("Recovery did not return a replacement code.");
  window.dispatchEvent(new Event("xora-auth-changed"));
  return {user:result.user,recoveryCode:result.recoveryCode,message:result.message||"Password changed."};
}
