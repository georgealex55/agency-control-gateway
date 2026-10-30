import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
/** Disabled until the explicit staging OAuth flow, consent UI, encrypted-token storage and tests are approved. */
export async function GET(){return NextResponse.json({error:"Meta OAuth connection is not activated in this staging milestone"},{status:423,headers:{"Cache-Control":"no-store"}});}
