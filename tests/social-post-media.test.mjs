import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("post media links are workspace-scoped at both SQL and API layers",()=>{
 const migration=readFileSync(new URL("../migrations/007_social_post_media.sql",import.meta.url),"utf8");
 assert(migration.includes("FOREIGN KEY(workspace_id,post_id)"));
 assert(migration.includes("FOREIGN KEY(workspace_id,media_id)"));
 const store=readFileSync(new URL("../ghl-gpt-gateway/lib/social-post-media-store.ts",import.meta.url),"utf8");
 assert(store.includes("m.workspace_id=p.workspace_id"));
 assert(store.includes("p.workspace_id=$1::uuid"));
 assert(store.includes("ON CONFLICT(post_id,media_id) DO NOTHING"));
 assert(store.includes("x.workspace_id=$1::uuid"));
 const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/[id]/media/route.ts",import.meta.url),"utf8");
 assert(route.includes("gate(req,true)"));
 assert(route.includes("gate(req)"));
 const del=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/[id]/media/[mediaId]/route.ts",import.meta.url),"utf8");
 assert(del.includes("gate(req,true)"));
 assert(del.includes("assetDeleted:false"));
});
