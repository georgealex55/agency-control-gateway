import { NextRequest, NextResponse } from "next/server";
import { adminAuthenticated } from "@/lib/portal-auth";
import { PLATFORM_SERVICES } from "@/lib/platform-services";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
  if(!adminAuthenticated(req))return NextResponse.json({error:"Agency administrator sign-in required"},{status:401,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({services:PLATFORM_SERVICES,importEnabled:false,scanEnabled:false,allBackendsDeployed:false},{headers:{"Cache-Control":"no-store"}});
}
