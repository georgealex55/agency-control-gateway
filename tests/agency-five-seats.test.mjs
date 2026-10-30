import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {AGENCY_MAX_USERS,normalizeSeatEmail,validUserRole,validSeatId,validSeatLabel} from "../ghl-gpt-gateway/lib/user-seats-contract.ts";
test("five-seat limit is a fixed contract, not a cosmetic UI setting",()=>{assert.equal(AGENCY_MAX_USERS,5);});
test("emails are canonicalized; invalid identities and roles rejected",()=>{
 assert.equal(normalizeSeatEmail(" User.Name+test@EXAMPLE.com "),"user.name+test@example.com");
 for(const x of ["x","", "a@localhost","bad address@example.com","admin@","x".repeat(255)])assert.equal(normalizeSeatEmail(x),null);
 for(const role of ["client_owner","client_editor","viewer"])assert(validUserRole(role));
 assert(!validUserRole("admin"));
 assert(validSeatLabel("Test Operator"));
 assert(!validSeatLabel(" "));
 assert(validSeatId("6f64ae50-a7b5-4659-bd5d-9ad056965422"));
 assert(!validSeatId("../other"));
});
test("provisional user reservations cannot grant login or send invitations",()=>{
 const source=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/users/route.ts",import.meta.url),"utf8");
 assert(source.includes("invitationSent:false"));
 assert(source.includes("loginEnabled:false"));
 assert(source.includes("adminAuthenticated(req)"));
 const patch=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/users/[id]/route.ts",import.meta.url),"utf8");
 assert(patch.includes("adminAuthenticated(req)"));
 assert(patch.includes("sameOrigin(req)"));
});
