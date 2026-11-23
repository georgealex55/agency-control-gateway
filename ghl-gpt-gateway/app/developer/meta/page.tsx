import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {cookieName,validSession} from "@/lib/portal-auth";
import DeveloperMetaConsole from "./developer-meta-console";
export const dynamic="force-dynamic";
/** The existing REACH portal session represents the single platform owner.
 * Future customer sessions must never inherit this owner-only session.
 */
export default async function DeveloperMetaPage(){
 const jar=await cookies();
 if(!validSession(jar.get(cookieName())?.value))redirect("/login?next=%2Fdeveloper%2Fmeta");
 return <DeveloperMetaConsole/>;
}
