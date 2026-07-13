import assert from "node:assert/strict";
import test from "node:test";
import { KuriEngine } from "../src/kuri-engine.js";

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
