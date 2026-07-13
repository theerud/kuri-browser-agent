import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import { isLoopbackUrl, KuriEngine } from "../src/kuri-engine.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("navigate uses the active tab and authenticated Kuri session", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname === "/tabs") {
      return jsonResponse([{ id: "tab-1", url: "about:blank", title: "" }]);
    }
    if (url.pathname === "/navigate") {
      return jsonResponse({ title: "Example" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  const result = await engine.navigate("https://example.com/path?q=1");

  assert.match((result.content[0] as { text: string }).text, /Title: Example/);
  const navigate = requests.find((request) => request.url.pathname === "/navigate");
  assert.ok(navigate);
  assert.equal(navigate.url.searchParams.get("tab_id"), "tab-1");
  assert.equal(navigate.url.searchParams.get("url"), "https://example.com/path?q=1");
  const headers = new Headers(navigate.init?.headers);
  assert.match(headers.get("authorization") || "", /^Bearer /);
  assert.match(headers.get("x-kuri-session") || "", /^mcp-session-/);
});

test("Kuri API errors retain status and response details", async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/tabs") {
      return jsonResponse([{ id: "tab-1" }]);
    }
    return jsonResponse({ error: "blocked" }, 403);
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  await assert.rejects(
    engine.navigate("https://example.com"),
    /Kuri API error \(403\): {"error":"blocked"}/,
  );
});

test("loopback navigation bypasses Kuri SSRF validation in the current tab", async () => {
  const requests: URL[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/tabs") return jsonResponse([{ id: "tab-local" }]);
    if (url.pathname === "/evaluate" || url.pathname === "/wait") return jsonResponse({ ok: true });
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  await engine.navigate("http://localhost:3000/dashboard");

  assert.deepEqual(requests.map((url) => url.pathname), ["/tabs", "/evaluate", "/wait"]);
  const expression = requests[1].searchParams.get("expression") || "";
  assert.match(expression, /^window\.location\.assign\(atob\('/);
  assert.equal(requests[1].searchParams.get("tab_id"), "tab-local");
});

test("loopback detection is narrow", () => {
  for (const url of [
    "http://localhost:3000",
    "http://app.localhost:4173",
    "http://127.0.0.2:8080",
    "http://[::1]:3000",
  ]) {
    assert.equal(isLoopbackUrl(url), true, url);
  }
  for (const url of [
    "https://example.com",
    "http://192.168.1.10:3000",
    "http://localhost.example.com",
    "not a URL",
  ]) {
    assert.equal(isLoopbackUrl(url), false, url);
  }
});

test("configure sends Kuri's ua parameter for presets and custom user agents", async () => {
  const requests: URL[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/tabs") return jsonResponse([{ id: "tab-1" }]);
    return jsonResponse({ ok: true });
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  await engine.configure({ preset: "iphone_15" });
  await engine.configure({ userAgent: "Custom Browser" });

  const emulate = requests.find((url) => url.pathname === "/emulate");
  assert.ok(emulate);
  assert.match(emulate.searchParams.get("ua") || "", /iPhone/);
  assert.equal(emulate.searchParams.has("userAgent"), false);
  const setUserAgent = requests.find((url) => url.pathname === "/set/useragent");
  assert.equal(setUserAgent?.searchParams.get("ua"), "Custom Browser");
});

test("explicit tab IDs avoid shared selected-tab state", async () => {
  const requests: URL[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/snapshot") return new Response("snapshot");
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  await engine.snapshot("interactive", "tab-explicit");

  assert.deepEqual(requests.map((url) => url.pathname), ["/snapshot"]);
  assert.equal(requests[0].searchParams.get("tab_id"), "tab-explicit");
});

test("new and selected tabs update the default tab", async () => {
  const requests: URL[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/tab/new") return jsonResponse({ tab_id: "tab-new" });
    if (url.pathname === "/tabs") return jsonResponse([{ id: "tab-new" }, { id: "tab-other" }]);
    if (url.pathname === "/snapshot") return new Response("snapshot");
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    baseUrl: "http://127.0.0.1:18080",
    fetch: fetchImpl as typeof fetch,
    installSignalHandlers: false,
  });

  await engine.newTab();
  await engine.selectTab("tab-other");
  await engine.snapshot();

  const snapshot = requests.find((url) => url.pathname === "/snapshot");
  assert.equal(snapshot?.searchParams.get("tab_id"), "tab-other");
});

function fakeChildProcess(pid: number): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true,
  });
  return child;
}

test("concurrent requests share startup and a later request recovers after exit", async () => {
  const children: ChildProcess[] = [];
  let spawnCount = 0;
  const spawnImpl = (() => {
    const child = fakeChildProcess(1000 + spawnCount++);
    children.push(child);
    return child;
  }) as typeof import("node:child_process").spawn;
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/health") return jsonResponse({ ok: true });
    if (url.pathname === "/tabs") return jsonResponse([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    fetch: fetchImpl as typeof fetch,
    getFreePort: async () => 18080 + spawnCount,
    spawn: spawnImpl,
    installSignalHandlers: false,
  });

  await Promise.all([engine.listTabs(), engine.listTabs()]);
  assert.equal(spawnCount, 1);

  Object.assign(children[0], { exitCode: 1 });
  children[0].emit("exit", 1, null);
  await engine.listTabs();

  assert.equal(spawnCount, 2);
});

test("environment settings configure the Kuri process", async () => {
  let command = "";
  let spawnedEnv: NodeJS.ProcessEnv | undefined;
  const spawnImpl = ((nextCommand: string, _args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
    command = nextCommand;
    spawnedEnv = options.env;
    return fakeChildProcess(1200);
  }) as typeof import("node:child_process").spawn;
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/health") return jsonResponse({ ok: true });
    if (url.pathname === "/tabs") return jsonResponse([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const engine = new KuriEngine({
    env: {
      KURI_PATH: "/opt/kuri/bin/kuri",
      KURI_PROXY: "http://proxy.example:8080",
      KURI_HEADLESS: "false",
    },
    fetch: fetchImpl as typeof fetch,
    getFreePort: async () => 18090,
    spawn: spawnImpl,
    installSignalHandlers: false,
  });

  await engine.listTabs();

  assert.equal(command, "/opt/kuri/bin/kuri");
  assert.equal(spawnedEnv?.HEADLESS, "false");
  assert.equal(spawnedEnv?.KURI_PROXY, "http://proxy.example:8080");
});

test("Gemini manifest uses portable paths and current setting fields", () => {
  const manifestUrl = new URL("../../../gemini-extension.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));

  assert.equal(manifest.mcpServers.kuri.args[0], "${extensionPath}/claude-code/mcp-server/dist/index.js");
  assert.equal(manifest.mcpServers.kuri.cwd, "${workspacePath}");
  assert.equal(manifest.mcpServers.kuri.args[0].includes("/home/"), false);
  for (const setting of manifest.settings) {
    assert.equal(typeof setting.name, "string");
    assert.match(setting.envVar, /^KURI_/);
    assert.equal(typeof setting.sensitive, "boolean");
    assert.equal("key" in setting, false);
  }
});
