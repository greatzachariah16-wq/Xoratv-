import type { ProfileRecord } from "./firebase/types";

export interface CustomAuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  profile: ProfileRecord;
}
type ApiResult<T = unknown> = { ok: boolean; user?: CustomAuthUser | null; error?: string; message?: string; verificationEmailSent?: boolean } & T;

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
  return { message: result.message || "Check your inbox to verify your email.", verificationEmailSent: Boolean(result.verificationEmailSent) };
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
export async function customVerifyEmail(token: string) {
  return request({action:"verify_email",token});
}
export async function customResendVerification(email: string) {
  return request({action:"resend_verification",email});
}
export async function customRequestPasswordReset(email: string) {
  return request({action:"reset_request",email});
}
export async function customResetPassword(token: string, password: string) {
  return request({action:"reset_password",token,password});
}
