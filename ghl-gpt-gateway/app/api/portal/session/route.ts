import { NextRequest, NextResponse } from "next/server";
import { adminAuthenticated, cookieMaxAge, cookieName, newSession, passwordValid, portalConfigured, sameOrigin } from "@/lib/portal-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function result(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function GET(req: NextRequest) {
  return result({ configured: portalConfigured(), authenticated: adminAuthenticated(req) });
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return result({error:"Invalid request origin"},403);
  if (!portalConfigured()) return result({error:"Admin login is not configured"},503);
  let data: unknown;
  try { data = await req.json(); } catch { return result({error:"Invalid request"},400); }
  const password = data && typeof data === "object" && "password" in data ? (data as {password?:unknown}).password : undefined;
  if (typeof password !== "string" || !passwordValid(password)) return result({error:"Invalid credentials"},401);
  const response = result({authenticated:true});
  response.cookies.set(cookieName(),newSession(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:cookieMaxAge()});
  return response;
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return result({error:"Invalid request origin"},403);
  const response = result({authenticated:false});
  response.cookies.set(cookieName(),"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
  return response;
}
