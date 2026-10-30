import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Disabled by design. There is one administrator and no additional account creation. */
export async function PATCH(){return NextResponse.json({error:"Single-administrator mode: seat management is disabled"},{status:410,headers:{"Cache-Control":"no-store"}});}
