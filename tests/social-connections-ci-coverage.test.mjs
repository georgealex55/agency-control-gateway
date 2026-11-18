import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ci=readFileSync(new URL("../.github/workflows/reach-social-connections-ci.yml",import.meta.url),"utf8");
test("social CI responds to OAuth and tenant-scoped source changes",()=>{
 for(const path of ["ghl-gpt-gateway/lib/social-meta-*.ts","ghl-gpt-gateway/app/api/platform/social/meta/**","ghl-gpt-gateway/lib/social-api.ts","ghl-gpt-gateway/lib/social-store.ts","ghl-gpt-gateway/app/social-studio.tsx"]){
  assert.ok(ci.includes("'"+path+"'"),"missing CI change trigger "+path);
 }
});
test("social CI runs native Node tests and checks shell mirror",()=>{
 assert.match(ci,/node --test tests\/social-provider-setup-contract\.test\.mjs/);
 assert.match(ci,/tests\/social-meta-consent-workflow\.test\.mjs tests\/social-connections-ci-coverage\.test\.mjs/);
 assert.match(ci,/cmp reach-shell\/index\.html ghl-gpt-gateway\/public\/reach-demo\/index\.html/);
});
test("social CI is staging-only and has read-only GitHub permission",()=>{
 assert.match(ci,/experiment\/gohyperlevel-synthetic-poc-20261104/);
 assert.match(ci,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(ci,/\bdeploy(?:ment)?\b|npm publish|git push/i);
});
