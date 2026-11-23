"use client";
import {createAuthClient} from "@neondatabase/auth/next";
/** Native same-origin /api/auth proxy; never sends login details to REACH
 * owner-session or Meta APIs.
 */
export const customerAuthClient=createAuthClient();
