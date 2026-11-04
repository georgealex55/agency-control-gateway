#!/usr/bin/env node
/**
 * Ephemeral GoHyperLevel runtime check; synthetic data and loopback only.
 * No GHL import, Postiz publishing, customer data, or external deployment.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const upstream = resolve(process.argv[2] || "_upstream/gohyperlevel");
const entry = join(upstream, "dist-server/server/index.js");
assert(existsSync(entry), "Pinned upstream must be built before this check");

const dataDir = mkdtempSync(join(tmpdir(), "reach-pghl-poc-"));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 6000);
  try { await exit; } finally { clearTimeout(timeout); }
}

async function start(env, baseUrl) {
  const child = spawn(process.execPath, [entry], {
    cwd: upstream, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (b) => { output = (output + String(b)).slice(-2500); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("GoHyperLevel terminated during startup: " + output);
    try {
      const r = await fetch(baseUrl + "/healthz", {signal: AbortSignal.timeout(1500)});
      if (r.ok && (await r.text()).trim() === "ok") return child;
    } catch { /* loopback only */ }
    await sleep(1000);
  }
  await stop(child);
  throw new Error("Timeout on isolated /healthz: " + output);
}

async function getJson(baseUrl, path) {
  const r = await fetch(baseUrl + path, {signal: AbortSignal.timeout(5000)});
  assert.equal(r.status, 200, path + " must return HTTP 200");
  return r.json();
}

let first, second;
try {
  const port = await freePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const env = {
    PATH: process.env.PATH || "", HOME: process.env.HOME || "",
    LANG: "C.UTF-8", TZ: "UTC", NODE_ENV: "production",
    PORT: String(port), PGHL_HOST: "127.0.0.1",
    PGHL_BASE_URL: baseUrl, PGHL_DATA_DIR: dataDir,
    PGHL_DEMO_MODE: "0", PGHL_CLOUD_MODE: "0",
    PGHL_BEHIND_PROXY: "0", PGHL_TICK_MS: "3600000",
    PGHL_ADMIN_EMAIL: "reach-poc-admin@example.invalid",
    PGHL_ADMIN_PASSWORD: randomBytes(32).toString("base64url"),
    PGHL_ADMIN_NAME: "Synthetic Reach POC",
    PGHL_COMPANY_NAME: "Synthetic Agency", PGHL_TIMEZONE: "UTC",
  };
  first = await start(env, baseUrl);
  const version = await getJson(baseUrl, "/api/version");
  assert.equal(version.name, "HyperLevel", "Wrong upstream server");
  const auth = await getJson(baseUrl, "/api/auth/status");
  assert.equal(auth.needsSetup, false, "Bootstrap failed");
  assert(existsSync(join(dataDir, "pghl.db")), "SQLite file missing");
  assert(statSync(join(dataDir, "pghl.db")).size > 0, "SQLite file empty");
  await stop(first);
  first = null;
  second = await start(env, baseUrl);
  const after = await getJson(baseUrl, "/api/auth/status");
  assert.equal(after.needsSetup, false, "Synthetic admin did not survive restart");
  console.log("PASS: pinned engine booted, health/version work, synthetic SQLite data survived restart.");
} finally {
  await stop(second);
  await stop(first);
  rmSync(dataDir, {recursive:true, force:true});
}
