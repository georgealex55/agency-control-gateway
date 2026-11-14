import { NextResponse } from "next/server";
import { checkPersonalDb } from "@/lib/connections/fieldclock-db";
import { neonAuthSettings } from "@/lib/connections/neon-owner-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET() {
  const storage=await checkPersonalDb();
  const auth=neonAuthSettings();
  return NextResponse.json({
    provider:"Neon", project:"fieldclock", environment:"personal-staging",
    connected:storage.connected,
    reason:storage.reason,
    storageReady:storage.connected,
    authenticatedWritesEnabled:storage.connected && auth.configured,
    authPending:!auth.configured,
    externalActionsEnabled:false
  },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
