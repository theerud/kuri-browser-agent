import assert from "node:assert/strict";
import test from "node:test";
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
