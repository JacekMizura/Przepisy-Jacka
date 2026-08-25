/**
 * Black-box e2e: prawdziwy NestJS + prawdziwy Next.js (build + start).
 * Żądania wyłącznie przez origin weba (HTTP + cookie jar).
 * Nie importuje proxyToApi ani Route Handlera.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "apps/api");
const WEB_DIR = resolve(ROOT, "apps/web");

const PREFERRED_WEB_PORT = 3100;
const PREFERRED_API_PORT = 3101;
const IN_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let exitCode = 1;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function assertSafeDatabaseUrl(url) {
  const lower = url.toLowerCase();
  if (
    lower.includes("railway") ||
    lower.includes("rlwy.net") ||
    lower.includes("vercel-storage")
  ) {
    throw new Error(
      "DATABASE_URL wskazuje na zdalną/produkcyjną bazę. Black-box może używać wyłącznie lokalnej lub CI bazy.",
    );
  }
}

function stopChild(child) {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
}

function cleanupNextArtifacts() {
  for (const relative of [".next/dev/lock", ".next/lock"]) {
    try {
      fs.rmSync(resolve(WEB_DIR, relative), { force: true });
    } catch {
      // ignore
    }
  }
}

function cleanup() {
  for (const child of children.splice(0)) {
    stopChild(child);
  }
  cleanupNextArtifacts();
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});

function canConnect(port) {
  return new Promise((resolveConnect) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolveConnect(true);
    });
    socket.on("error", () => resolveConnect(false));
  });
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Nie udało się przydzielić portu."));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
    server.on("error", reject);
  });
}

async function describeListener(port) {
  if (!(await canConnect(port))) {
    return null;
  }
  if (process.platform !== "win32") {
    return { port, note: "port zajęty (bez zabijania)" };
  }
  try {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $c) { exit 0 }; $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); Write-Output ("PID=" + $c.OwningProcess); Write-Output ("Name=" + $p.Name); Write-Output ("Cwd="); try { Write-Output ((Get-Process -Id $c.OwningProcess).Path) } catch {} ; Write-Output ("Cmd=" + $p.CommandLine)`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    ps.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    await new Promise((resolveWait) => ps.on("close", resolveWait));
    return { port, details: out.trim() || "port zajęty" };
  } catch {
    return { port, note: "port zajęty" };
  }
}

async function resolvePort(preferred) {
  if (!(await canConnect(preferred))) {
    return preferred;
  }
  const info = await describeListener(preferred);
  log(
    `Port ${preferred} zajęty — nie zabijam procesu. ${info?.details ?? info?.note ?? ""}`,
  );
  return getFreePort();
}

async function waitForHttp(url, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(400);
  }
  throw new Error(`Timeout czekając na ${url}: ${lastError}`);
}

function run(command, args, options) {
  const useShell =
    options.shell === true ||
    (options.shell !== false &&
      process.platform === "win32" &&
      command !== process.execPath);
  const child = spawn(command, args, {
    ...options,
    shell: useShell,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  if (options.track !== false) {
    children.push(child);
  }
  child.stdout?.on("data", (chunk) => {
    if (options.silent) {
      return;
    }
    process.stdout.write(`[${options.tag ?? "proc"}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    if (options.silent) {
      return;
    }
    process.stderr.write(`[${options.tag ?? "proc"}] ${chunk}`);
  });
  return child;
}

function runSync(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = run(command, args, { ...options, track: false });
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} zakończyło się kodem ${code}`));
    });
  });
}

function applySetCookie(jar, setCookies) {
  for (const header of setCookies) {
    const pair = header.split(";", 1)[0];
    if (!pair) {
      continue;
    }
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function assertCookieAttributes(setCookies) {
  if (setCookies.length === 0) {
    throw new Error("Brak nagłówków Set-Cookie.");
  }
  for (const cookie of setCookies) {
    const lower = cookie.toLowerCase();
    if (!lower.includes("httponly")) {
      throw new Error(`Cookie bez HttpOnly: ${cookie}`);
    }
    if (!lower.includes("path=/")) {
      throw new Error(`Cookie bez Path=/: ${cookie}`);
    }
    if (!lower.includes("samesite=lax")) {
      throw new Error(`Cookie bez SameSite=Lax: ${cookie}`);
    }
    if (/(?:^|;\s*)domain=/i.test(cookie)) {
      throw new Error(`Cookie nie powinno ustawiać Domain: ${cookie}`);
    }
    if (/(?:^|;\s*)secure(?:;|$)/i.test(cookie)) {
      throw new Error(
        `Cookie Secure nie powinno być ustawione poza production HTTP: ${cookie}`,
      );
    }
  }
}

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  log("=== Black-box auth przez prawdziwy Next.js ===");

  const webPort = await resolvePort(PREFERRED_WEB_PORT);
  const apiPort = await resolvePort(PREFERRED_API_PORT);
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;

  log(`Web origin: ${webOrigin}`);
  log(`API origin: ${apiOrigin} (tylko dla Next.js API_ORIGIN, test nie woła go bezpośrednio w krokach auth)`);

  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia";
  assertSafeDatabaseUrl(databaseUrl);

  if (IN_CI) {
    log("CI: używam DATABASE_URL z workflow (bez embedded PostgreSQL).");
    if (!(await canConnect(5432))) {
      throw new Error(
        "W CI PostgreSQL musi nasłuchiwać na 5432 (usługa postgres:18-alpine).",
      );
    }
  } else if (!(await canConnect(5432)) && !process.env.DATABASE_URL) {
    log("Uruchamiam embedded PostgreSQL na 5432…");
    const pg = run(process.execPath, [resolve(API_DIR, "scripts/start-embedded-postgres.mjs")], {
      cwd: API_DIR,
      tag: "pg",
      env: { ...process.env },
    });
    const started = Date.now();
    while (!(await canConnect(5432))) {
      if (Date.now() - started > 60_000) {
        stopChild(pg);
        throw new Error("Embedded PostgreSQL nie wystartował.");
      }
      await delay(400);
    }
    log("PostgreSQL gotowy.");
  } else if (!(await canConnect(5432))) {
    throw new Error(
      "DATABASE_URL jest ustawione, ale PostgreSQL nie nasłuchuje na 5432.",
    );
  }

  log("prisma migrate deploy…");
  await runSync(
    "pnpm",
    ["--filter", "@moja-kuchnia/api", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: ROOT,
      tag: "migrate",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );

  log("Build API…");
  await runSync("pnpm", ["--filter", "@moja-kuchnia/api", "build"], {
    cwd: ROOT,
    tag: "api-build",
    silent: true,
  });

  log("Build web (next build)…");
  await runSync("pnpm", ["--filter", "@moja-kuchnia/web", "build"], {
    cwd: ROOT,
    tag: "web-build",
    silent: true,
    env: {
      ...process.env,
      // Build nie powinien wymagać publicznego URL API.
      API_ORIGIN: apiOrigin,
    },
  });

  const authSecret =
    process.env.BETTER_AUTH_SECRET ?? "local-dev-only-not-for-production-use-32";

  log("Start NestJS…");
  const api = run(process.execPath, [resolve(API_DIR, "dist/main.js")], {
    cwd: API_DIR,
    tag: "api",
    env: {
      ...process.env,
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      CORS_ORIGINS: webOrigin,
      PUBLIC_WEB_ORIGIN: webOrigin,
      BETTER_AUTH_URL: webOrigin,
      BETTER_AUTH_SECRET: authSecret,
      AUTH_TRUSTED_ORIGINS: webOrigin,
      ALLOW_DEMO_SEED: "false",
    },
  });
  await waitForHttp(`${apiOrigin}/api/health`, 60_000);
  log("API gotowe.");

  log("Start Next.js (next start)…");
  const web = run(
    "pnpm",
    ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(webPort)],
    {
      cwd: WEB_DIR,
      tag: "web",
      env: {
        ...process.env,
        NODE_ENV: "production",
        API_ORIGIN: apiOrigin,
        PORT: String(webPort),
        HOSTNAME: "127.0.0.1",
      },
    },
  );
  await waitForHttp(`${webOrigin}/`, 120_000);
  log("Next.js gotowy.");

  // Dowód, że ruch idzie przez proces Next.js, nie bezpośrednio do Nest.
  const home = await fetch(`${webOrigin}/`, { redirect: "manual" });
  await assert(home.status === 200, `Strona Next.js / zwróciła ${home.status}`);
  const homeHtml = await home.text();
  await assert(
    homeHtml.includes("html") || homeHtml.includes("Moja") || homeHtml.length > 50,
    "Oczekiwano HTML z procesu Next.js",
  );

  const healthViaNext = await fetch(`${webOrigin}/api/health`);
  await assert(healthViaNext.status === 200, `GET /api/health przez Next: ${healthViaNext.status}`);
  const healthBody = await healthViaNext.json();
  await assert(healthBody.status === "ok", "Health przez Next nie zwrócił status=ok");

  // Query string i status
  const healthQuery = await fetch(`${webOrigin}/api/health?probe=blackbox`);
  await assert(healthQuery.status === 200, "Query string nie przeszedł przez proxy");

  const jar = new Map();
  const email = `next-blackbox-${Date.now()}@example.com`;
  const password = "HasloTestowe1";

  log("1. Rejestracja…");
  const register = await fetch(`${webOrigin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      origin: webOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, name: "Użytkownik Blackbox" }),
  });
  await assert(register.status < 400, `Rejestracja: ${register.status} ${await register.text()}`);
  const registerCookies = register.headers.getSetCookie();
  log(`   Set-Cookie count (sign-up): ${registerCookies.length}`);
  await assert(registerCookies.length > 0, "Brak Set-Cookie po rejestracji");
  assertCookieAttributes(registerCookies);
  applySetCookie(jar, registerCookies);
  // getSetCookie zwraca osobne wartości — nie jeden sklejony nagłówek.
  for (const cookie of registerCookies) {
    const name = cookie.split("=", 1)[0]?.trim() ?? "";
    await assert(
      /^[\w.-]+$/.test(name),
      `Niepoprawna nazwa cookie (możliwe sklejenie Set-Cookie): ${cookie}`,
    );
  }

  log("2–4. Sesja po rejestracji…");
  const sessionAfterSignUp = await fetch(`${webOrigin}/api/auth/get-session`, {
    headers: { origin: webOrigin, cookie: cookieHeader(jar) },
  });
  await assert(sessionAfterSignUp.status === 200, "Sesja po rejestracji");
  const signedUp = await sessionAfterSignUp.json();
  await assert(signedUp?.user?.email === email, "E-mail sesji po rejestracji");

  log("5. Wylogowanie…");
  const signOut = await fetch(`${webOrigin}/api/auth/sign-out`, {
    method: "POST",
    headers: {
      origin: webOrigin,
      cookie: cookieHeader(jar),
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  await assert(signOut.status < 400, `Wylogowanie: ${signOut.status}`);
  applySetCookie(jar, signOut.headers.getSetCookie());

  const sessionAfterSignOut = await fetch(`${webOrigin}/api/auth/get-session`, {
    headers: { origin: webOrigin, cookie: cookieHeader(jar) },
  });
  const signedOutBody = await sessionAfterSignOut.text();
  await assert(
    signedOutBody === "" || signedOutBody === "null",
    `Sesja po wylogowaniu powinna być pusta, było: ${signedOutBody}`,
  );

  log("6. Ponowne logowanie…");
  jar.clear();
  const signIn = await fetch(`${webOrigin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      origin: webOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  await assert(signIn.status < 400, `Logowanie: ${signIn.status} ${await signIn.text()}`);
  const signInCookies = signIn.headers.getSetCookie();
  await assert(signInCookies.length > 0, "Brak Set-Cookie po logowaniu");
  assertCookieAttributes(signInCookies);
  applySetCookie(jar, signInCookies);
  log(`   Set-Cookie count (sign-in): ${signInCookies.length}`);

  log("7. GET /api/me…");
  const me = await fetch(`${webOrigin}/api/me`, {
    headers: { origin: webOrigin, cookie: cookieHeader(jar) },
  });
  await assert(me.status === 200, `GET /api/me: ${me.status}`);
  const meBody = await me.json();
  await assert(meBody.email === email, "GET /api/me e-mail");

  log("8. PATCH /api/me niepoprawny → 400…");
  const invalidPatch = await fetch(`${webOrigin}/api/me`, {
    method: "PATCH",
    headers: {
      origin: webOrigin,
      cookie: cookieHeader(jar),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "" }),
  });
  await assert(invalidPatch.status === 400, `Oczekiwano 400, było ${invalidPatch.status}`);

  log("9. PATCH /api/me poprawny → 200…");
  const validPatch = await fetch(`${webOrigin}/api/me`, {
    method: "PATCH",
    headers: {
      origin: webOrigin,
      cookie: cookieHeader(jar),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Jacek Blackbox" }),
  });
  await assert(validPatch.status === 200, `Oczekiwano 200, było ${validPatch.status}`);
  const patched = await validPatch.json();
  await assert(patched.name === "Jacek Blackbox", "PATCH nie zachował body / odpowiedzi");

  log("10–11. Body, statusy i wielokrotne Set-Cookie — OK powyżej.");

  // Dowód 502 przez Next, gdy API padnie — Next nadal serwuje HTML.
  log("Dowód proxy 502: zatrzymuję tylko API uruchomione przez test…");
  stopChild(api);
  const apiIndex = children.indexOf(api);
  if (apiIndex >= 0) {
    children.splice(apiIndex, 1);
  }
  await delay(1000);

  const failedHealth = await fetch(`${webOrigin}/api/health`);
  await assert(
    failedHealth.status === 502,
    `Oczekiwano 502 przez Next przy martwym API, było ${failedHealth.status}`,
  );
  const stillNext = await fetch(`${webOrigin}/`);
  await assert(
    stillNext.status === 200,
    "Next powinien nadal odpowiadać HTML po upadku API",
  );

  log("=== BLACKBOX PASS ===");
  log(`Adres weba użyty przez test: ${webOrigin}`);
  exitCode = 0;
  cleanup();
  process.exit(0);
}

main().catch((error) => {
  console.error("\n=== BLACKBOX FAIL ===");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  cleanup();
  process.exit(exitCode);
});
