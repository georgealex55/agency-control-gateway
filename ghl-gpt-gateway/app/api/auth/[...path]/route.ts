import {customerNeonAuth} from "@/lib/reach-customer-neon-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
const handlers=customerNeonAuth?.handler();
const unavailable=async()=>Response.json({error:"Customer authentication not activated"},{status:503,headers:{"Cache-Control":"private, no-store"}});
export const GET=handlers?.GET??unavailable;
export const POST=handlers?.POST??unavailable;
