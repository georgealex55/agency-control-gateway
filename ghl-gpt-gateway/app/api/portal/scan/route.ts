import { NextRequest, NextResponse } from "next/server";
import { adminAuthenticated, sameOrigin } from "@/lib/portal-auth";
import { scanAgency } from "@/lib/portal-scan";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest) {
  if(process.env.VERCEL_GIT_COMMIT_REF==="feature/social-intelligence-stage-20261029")return NextResponse.json({error:"GHL scanning is deferred during Social Intelligence staging"},{status:403,headers:{"Cache-Control":"no-store"}});
  if(!sameOrigin(req))return NextResponse.json({error:"Invalid request origin"},{status:403});
  if(!adminAuthenticated(req))return NextResponse.json({error:"Admin sign-in required"},{status:401});
  try {
    const data=await scanAgency();
    return NextResponse.json({ok:true,readOnly:true,...data},{headers:{"Cache-Control":"no-store"}});
  }catch {
    return NextResponse.json({error:"Agency discovery unavailable. Check the primary GHL company ID, agency authorization, and scopes."},{status:502,headers:{"Cache-Control":"no-store"}});
  }
}
