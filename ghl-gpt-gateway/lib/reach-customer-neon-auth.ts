import {createNeonAuth} from "@neondatabase/auth/next/server";
/** Deliberately separate from REACH portal owner login, which retains its own
 * password/session. Do not instantiate an authentication proxy without opt-in.
 */
const enabled=process.env.REACH_CUSTOMER_AUTH_ENABLED==="true"&&
 typeof process.env.NEON_AUTH_BASE_URL==="string"&&
 process.env.NEON_AUTH_BASE_URL.startsWith("https://")&&
 (process.env.NEON_AUTH_COOKIE_SECRET||"").length>=32;
export const customerNeonAuth=enabled?createNeonAuth({
 baseUrl:process.env.NEON_AUTH_BASE_URL!,
 cookies:{secret:process.env.NEON_AUTH_COOKIE_SECRET!,sessionDataTtl:60}
}):null;
