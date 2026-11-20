import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import {ownerSameOrigin} from "@/lib/reach-owner-origin";
import {assessPortalCredentials,type PortalSetupIssue} from "@/lib/reach-portal-setup";
const COOKIE = "agency_portal_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;
function config() {
  const passwordHash = (process.env.AGENCY_PORTAL_PASSWORD_SHA256 || "").trim().toLowerCase();
  const secret = process.env.AGENCY_PORTAL_SESSION_SECRET || "";
  const readiness=assessPortalCredentials(passwordHash,secret);
  return {passwordHash,secret,ready:readiness.configured,setupIssue:readiness.setupIssue};
}
export function portalConfigured(): boolean { return config().ready; }
export function portalSetupIssue(): PortalSetupIssue { return config().setupIssue; }
export function passwordValid(password: string): boolean {
  const c = config();
  if (!c.ready || password.length < 12 || password.length > 512) return false;
  return timingSafeEqual(createHash("sha256").update(password, "utf8").digest(), Buffer.from(c.passwordHash, "hex"));
}
function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function newSession(): string {
  const c = config();
  if (!c.ready) throw new Error("Agency portal authentication is not configured");
  const payload = "v1." + (Math.floor(Date.now()/1000) + MAX_AGE_SECONDS) + "." + randomBytes(16).toString("base64url");
  return payload + "." + sign(payload,c.secret);
}
export function validSession(token: string | undefined): boolean {
  const c = config();
  if (!c.ready || !token || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now()/1000)) return false;
  if (!/^[A-Za-z0-9_-]{22}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const supplied = Buffer.from(parts[3],"utf8");
  const expected = Buffer.from(sign(parts.slice(0,3).join("."),c.secret),"utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied,expected);
}
export function adminAuthenticated(req: NextRequest): boolean {
  return validSession(req.cookies.get(COOKIE)?.value);
}
export function sameOrigin(req: NextRequest): boolean {
  return ownerSameOrigin({
    originHeader:req.headers.get("origin"),
    requestUrlOrigin:req.nextUrl.origin,
    hostHeader:req.headers.get("host"),
    forwardedHostHeader:req.headers.get("x-forwarded-host"),
    forwardedProtoHeader:req.headers.get("x-forwarded-proto"),
    vercelEnvironment:process.env.VERCEL_ENV,
    vercelDeploymentUrl:process.env.VERCEL_URL,
    configuredCanonicalOrigin:process.env.REACH_OWNER_CANONICAL_ORIGIN
  });
}
export function cookieName(): string { return COOKIE; }
export function cookieMaxAge(): number { return MAX_AGE_SECONDS; }
