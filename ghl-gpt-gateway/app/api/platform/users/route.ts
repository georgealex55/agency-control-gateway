import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated} from "@/lib/portal-auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
/** Single administrator only; preserved route refuses every seat-management operation. */
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return NextResponse.json({error:"Administrator sign-in required"},{status:401,headers:noStore});
 return NextResponse.json({mode:"single-admin",maxUsers:1,used:1,remaining:0,users:[],individualLoginEnabled:false,invitationDeliveryEnabled:false},{headers:noStore});
}
export async function POST(){return NextResponse.json({error:"Single-administrator mode: new users are disabled"},{status:410,headers:noStore});}
