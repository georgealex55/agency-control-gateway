import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json({error:"Postiz server dependency retired for Vercel-native staging"},{status:410,headers:{"Cache-Control":"no-store"}});}
