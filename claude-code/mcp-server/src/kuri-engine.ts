import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { randomBytes } from "node:crypto";
import net from "net";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { inflateSync, deflateSync, crc32 } from "node:zlib";

export interface KuriEngineOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  getFreePort?: () => Promise<number>;
  installSignalHandlers?: boolean;
  spawn?: typeof spawn;
}

interface Preset {
  userAgent: string;
  width: number;
  height: number;
  mobile?: boolean;
  deviceScaleFactor?: number;
}

export function isLoopbackUrl(value: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  hostname = hostname.replace(/^\[(.*)\]$/, "$1");
  if (hostname === "localhost" || hostname === "localhost.localdomain" || hostname === "::1") return true;
  if (hostname.endsWith(".localhost") || hostname.endsWith(".localhost.localdomain")) return true;
  return /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

const PRESETS: Record<string, Preset> = {
  desktop_chrome: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    width: 1920,
    height: 1080,
  },
  desktop_safari: {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    width: 1440,
    height: 900,
  },
  iphone_15: {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    width: 393,
    height: 852,
    mobile: true,
    deviceScaleFactor: 3,
  },
  pixel_8: {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    width: 412,
    height: 915,
    mobile: true,
    deviceScaleFactor: 2.625,
  },
  tablet_ipad: {
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    width: 810,
    height: 1080,
    mobile: true,
    deviceScaleFactor: 2,
  },
  bot_google: {
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    width: 1200,
    height: 800,
  },
};

export class KuriEngine extends EventEmitter {
  private kuriProcess: ChildProcess | null = null;
  private startPromise: Promise<void> | null = null;
  private port: number = 8080;
  private get baseUrl(): string { return this.baseUrlOverride || `http://127.0.0.1:${this.port}`; }
  private sessionId: string = `mcp-session-${Math.random().toString(36).substring(7)}`;
  private kuriPath: string = "kuri";
  private apiToken: string = process.env.KURI_API_TOKEN || randomBytes(24).toString("hex");
  private currentTabId: string | null = null;
  private currentConfig: any = {
    headless: true,
    proxy: null,
  };
  private readonly baseUrlOverride?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getFreePortImpl?: () => Promise<number>;
  private readonly spawnImpl: KuriEngineOptions["spawn"];

  constructor(options: KuriEngineOptions = {}) {
    super();
    this.baseUrlOverride = options.baseUrl;
    this.fetchImpl = options.fetch || fetch;
    this.getFreePortImpl = options.getFreePort;
    this.spawnImpl = options.spawn || spawn;
    if (options.installSignalHandlers !== false) this.setupCleanup();
  }

  private setupCleanup() {
    const cleanup = () => {
      if (this.kuriProcess) {
        try {
          if (this.kuriProcess.pid) process.kill(-this.kuriProcess.pid, "SIGKILL");
        } catch (e) {}
      }
    };
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(); });
    process.on("SIGTERM", () => { cleanup(); process.exit(); });
  }

  private async killKuri() {
    if (this.kuriProcess) {
      const proc = this.kuriProcess;
      this.kuriProcess = null; // Prevent re-entry

      console.error(`Killing Kuri process ${proc.pid}...`);
      try {
        if (proc.pid) {
          process.kill(-proc.pid, "SIGTERM");

          // Wait for process to exit or timeout and SIGKILL
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              try { if (proc.pid) process.kill(-proc.pid, "SIGKILL"); } catch (e) {}
              resolve();
            }, 2000);

            proc.on("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }
      } catch (e) {
        try { proc.kill("SIGKILL"); } catch (ee) {}
      }
    }
  }

  private async getFreePort(): Promise<number> {
    if (this.getFreePortImpl) return this.getFreePortImpl();
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });
  }

  private async ensureRunning() {
    if (this.baseUrlOverride) return;
    if (this.startPromise) return this.startPromise;
    if (this.kuriProcess && this.kuriProcess.exitCode === null) return;

    this.startPromise = this.startKuri().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startKuri() {
    this.port = await this.getFreePort();
    console.error(`Starting Kuri process: ${this.kuriPath} on port ${this.port}`);
    const env = {
      ...process.env,
      PORT: this.port.toString(),
      HEADLESS: this.currentConfig.headless.toString(),
      KURI_API_TOKEN: this.apiToken,
      REQUEST_TIMEOUT_MS: "60000",
      NAVIGATE_TIMEOUT_MS: "60000"
    };
    if (this.currentConfig.proxy) {
      (env as any).KURI_PROXY = this.currentConfig.proxy;
    }

    const proc = this.spawnImpl!(this.kuriPath, [], { env, stdio: "pipe", detached: true });
    this.kuriProcess = proc;
    let processFailure: Error | null = null;

    proc.stdout?.resume();
    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[Kuri] ${data.toString().trim()}`);
    });

    proc.once("error", (err) => {
      processFailure = err;
      console.error(`Kuri process error: ${err.message}`);
      if (this.kuriProcess === proc) this.kuriProcess = null;
    });
    proc.once("exit", (code, signal) => {
      if (!processFailure) {
        processFailure = new Error(`Kuri exited during startup (code=${code}, signal=${signal})`);
      }
      if (this.kuriProcess === proc) {
        this.kuriProcess = null;
        this.currentTabId = null;
      }
    });

    for (let i = 0; i < 20; i++) {
      if (processFailure) throw processFailure;
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/health`);
        if (res.ok) {
          console.error(`Kuri is healthy on port ${this.port}`);
          return;
        }
      } catch (e) {
        // ignore
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await this.killKuri();
    throw new Error("Kuri failed to start after 20 seconds");
  }

  private async request(path: string, options: any = {}) {
    await this.ensureRunning();

    const urlObj = new URL(path, this.baseUrl);
    if (this.currentTabId && !urlObj.searchParams.has("tab_id")) {
      urlObj.searchParams.set("tab_id", this.currentTabId);
    }

    const res = await this.fetchImpl(urlObj.toString(), {
      ...options,
      headers: {
        ...options.headers,
        "X-Kuri-Session": this.sessionId,
        "Authorization": `Bearer ${this.apiToken}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kuri API error (${res.status}): ${text}`);
    }

    return res;
  }

  async configure(args: { preset?: string; userAgent?: string; width?: number; height?: number; proxy?: string; headless?: boolean; tab_id?: string }) {
    let needsRestart = false;

    if (args.headless !== undefined && args.headless !== this.currentConfig.headless) {
      this.currentConfig.headless = args.headless;
      needsRestart = true;
    }

    if (args.proxy !== undefined && args.proxy !== this.currentConfig.proxy) {
      this.currentConfig.proxy = args.proxy;
      needsRestart = true;
    }

    if (needsRestart) {
      await this.restart();
      await this.ensureRunning();
    }

    let effectiveUA = args.userAgent;
    let effectiveWidth = args.width;
    let effectiveHeight = args.height;
    let effectiveMobile: boolean | undefined;
    let effectiveScale: number | undefined;

    if (args.preset && PRESETS[args.preset]) {
      const p = PRESETS[args.preset];
      effectiveUA = effectiveUA || p.userAgent;
      effectiveWidth = effectiveWidth || p.width;
      effectiveHeight = effectiveHeight || p.height;
      effectiveMobile = p.mobile;
      effectiveScale = p.deviceScaleFactor;
    }

    if (effectiveWidth && effectiveHeight) {
      const tabId = await this.ensureTab(args.tab_id);
      const params = new URLSearchParams({
        width: String(effectiveWidth),
        height: String(effectiveHeight),
        tab_id: tabId,
      });
      if (effectiveUA) params.set("ua", effectiveUA);
      if (effectiveScale !== undefined) params.set("scale", String(effectiveScale));
      await this.request(`/emulate?${params.toString()}`);
    } else if (effectiveUA) {
      const tabId = await this.ensureTab(args.tab_id);
      await this.request(`/set/useragent?ua=${encodeURIComponent(effectiveUA)}&tab_id=${encodeURIComponent(tabId)}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Browser configured: ${JSON.stringify({
            preset: args.preset,
            userAgent: effectiveUA,
            viewport: effectiveWidth ? `${effectiveWidth}x${effectiveHeight}` : "default",
            mobilePreset: effectiveMobile,
            deviceScaleFactor: effectiveScale,
            proxy: this.currentConfig.proxy,
            headless: this.currentConfig.headless
          })}`,
        },
      ],
    };
  }

  private async ensureTab(tabId?: string): Promise<string> {
    if (tabId) return tabId;
    if (!this.currentTabId) {
      const resTabs = await this.request("/tabs");
      const tabs = await resTabs.json() as any[];
      if (tabs.length > 0) {
        this.currentTabId = tabs[0].id;
      } else {
        const resTab = await this.request("/tab/new");
        const dataTab = await resTab.json() as any;
        this.currentTabId = dataTab.tab_id;
      }
    }
    return this.currentTabId!;
  }

  private withTab(path: string, tabId: string): string {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("tab_id", tabId);
    return `${url.pathname}${url.search}`;
  }

  async navigate(url: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);

    if (isLoopbackUrl(url)) {
      const encodedUrl = Buffer.from(url, "utf8").toString("base64");
      const expression = `window.location.assign(atob('${encodedUrl}'))`;
      await this.request(this.withTab(`/evaluate?expression=${encodeURIComponent(expression)}`, targetTabId));
      await this.request(this.withTab("/wait?timeout=60000", targetTabId));
      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${url} (Tab: ${targetTabId})`,
          },
        ],
      };
    }

    const res = await this.request(this.withTab(`/navigate?url=${encodeURIComponent(url)}`, targetTabId));
    const data = await res.json() as any;

    return {
      content: [
        {
          type: "text",
          text: `Navigated to ${url}. Title: ${data.title || "Loaded"} (Tab: ${targetTabId})`,
        },
      ],
    };
  }

  async snapshot(filter: "interactive" | "all" = "interactive", tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const res = await this.request(this.withTab(`/snapshot?filter=${filter}&format=compact`, targetTabId));
    const text = await res.text();
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  async click(ref: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const elementRef = ref.startsWith("@") ? ref.substring(1) : ref;
    await this.request(this.withTab(`/action?action=click&ref=${elementRef}`, targetTabId));
    return {
      content: [
        {
          type: "text",
          text: `Clicked ${ref}`,
        },
      ],
    };
  }

  async type(ref: string, text: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const elementRef = ref.startsWith("@") ? ref.substring(1) : ref;
    await this.request(this.withTab(`/action?action=fill&ref=${elementRef}&value=${encodeURIComponent(text)}`, targetTabId));
    return {
      content: [
        {
          type: "text",
          text: `Typed into ${ref}`,
        },
      ],
    };
  }

  async scroll(direction: "up" | "down", tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    await this.request(this.withTab(`/action?action=scroll&direction=${direction}`, targetTabId));
    return {
      content: [
        {
          type: "text",
          text: `Scrolled ${direction}`,
        },
      ],
    };
  }
  async hover(ref: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const elementRef = ref.startsWith("@") ? ref.substring(1) : ref;
    await this.request(this.withTab(`/action?action=hover&ref=${elementRef}`, targetTabId));
    return {
      content: [
        {
          type: "text",
          text: `Hovered over ${ref}`,
        },
      ],
    };
  }
  async press(key: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    await this.request(this.withTab(`/action?action=press&value=${encodeURIComponent(key)}`, targetTabId));
    return {
      content: [
        {
          type: "text",
          text: `Pressed key: ${key}`,
        },
      ],
    };
  }
  async evaluate(script: string, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const res = await this.request(this.withTab(`/evaluate?expression=${encodeURIComponent(script)}`, targetTabId));
    const data = await res.json() as any;
    // CDP format: { result: { result: { value: ... } } }
    const value = data.result?.result?.value ?? data.result?.value ?? data.value ?? data;
    return {
      content: [
        {
          type: "text",
          text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
        },
      ],
    };
  }
  async listTabs() {
    const res = await this.request("/tabs");
    const tabs = await res.json() as any[];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tabs, null, 2),
        },
      ],
    };
  }
  async newTab() {
    const res = await this.request("/tab/new?wait=true");
    const data = await res.json() as any;
    if (!data.tab_id) throw new Error("Kuri did not return a tab ID");
    this.currentTabId = data.tab_id;
    return {
      content: [
        {
          type: "text",
          text: `Created and selected tab: ${data.tab_id}`,
        },
      ],
    };
  }
  async selectTab(tabId: string) {
    const res = await this.request("/tabs");
    const tabs = await res.json() as any[];
    if (!tabs.some((tab) => tab.id === tabId)) throw new Error(`Tab not found: ${tabId}`);
    this.currentTabId = tabId;
    return {
      content: [
        {
          type: "text",
          text: `Selected tab: ${tabId}`,
        },
      ],
    };
  }
  async closeTab(tabId?: string) {
    const targetId = tabId || this.currentTabId;
    if (!targetId) throw new Error("No tab ID provided and no current tab set.");
    await this.request(`/tab/close?tab_id=${targetId}`);
    if (targetId === this.currentTabId) this.currentTabId = null;
    return {
      content: [
        {
          type: "text",
          text: `Closed tab: ${targetId}`,
        },
      ],
    };
  }
  async wait(delayMs: number) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return {
      content: [
        {
          type: "text",
          text: `Waited for ${delayMs}ms`,
        },
      ],
    };
  }

  async read(format: "markdown" | "text" = "markdown", tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const endpoint = format === "markdown" ? "/markdown" : "/text";
    const res = await this.request(this.withTab(endpoint, targetTabId));
    const text = await res.text();

    try {
      const data = JSON.parse(text);
      // Extract from CDP format: { result: { result: { value: "..." } } }
      const extracted = data.result?.result?.value ?? data.result?.value ?? data.value ?? text;
      return {
        content: [
          {
            type: "text",
            text: typeof extracted === "string" ? extracted : JSON.stringify(extracted),
          },
        ],
      };
    } catch (e) {
      // Not JSON, return as is
      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    }
  }
  private async cropImage(buffer: Buffer, rect: { x: number; y: number; width: number; height: number }): Promise<string> {
    if (buffer.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Invalid PNG signature");
    }

    let offset = 8;
    let width = 0, height = 0, colorType = 0;
    const idats: Buffer[] = [];

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
      const data = buffer.slice(offset + 8, offset + 8 + length);
      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        colorType = data[9];
      } else if (type === "IDAT") {
        idats.push(data);
      } else if (type === "IEND") break;
      offset += length + 12;
    }

    const bpp = colorType === 6 ? 4 : 3;
    const rawData = inflateSync(Buffer.concat(idats));
    const rowSize = 1 + width * bpp;
    const unfiltered = Buffer.alloc(width * height * bpp);
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowSize;
      const filterType = rawData[rowStart];
      for (let x = 0; x < width * bpp; x++) {
        const left = x >= bpp ? unfiltered[y * width * bpp + x - bpp] : 0;
        const up = y > 0 ? unfiltered[(y - 1) * width * bpp + x] : 0;
        const upLeft = (x >= bpp && y > 0) ? unfiltered[(y - 1) * width * bpp + x - bpp] : 0;
        let val = rawData[rowStart + 1 + x];
        if (filterType === 1) val = (val + left) & 0xFF;
        else if (filterType === 2) val = (val + up) & 0xFF;
        else if (filterType === 3) val = (val + Math.floor((left + up) / 2)) & 0xFF;
        else if (filterType === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          val = (val + (pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft))) & 0xFF;
        }
        unfiltered[y * width * bpp + x] = val;
      }
    }

    const targetX = Math.max(0, Math.min(rect.x, width)), targetY = Math.max(0, Math.min(rect.y, height));
    const targetW = Math.min(rect.width, width - targetX), targetH = Math.min(rect.height, height - targetY);
    const croppedRaw = Buffer.alloc(targetH * (1 + targetW * bpp));
    for (let y = 0; y < targetH; y++) {
      const dstOffset = y * (1 + targetW * bpp);
      croppedRaw[dstOffset] = 0;
      unfiltered.copy(croppedRaw, dstOffset + 1, ((targetY + y) * width + targetX) * bpp, ((targetY + y) * width + targetX + targetW) * bpp);
    }

    const writeChunk = (type: string, data: Buffer) => {
      const b = Buffer.alloc(8 + data.length + 4);
      b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
      const c = Buffer.alloc(4 + data.length); c.write(type, 0); data.copy(c, 4);
      b.writeUInt32BE(crc32(c), 8 + data.length); return b;
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(targetW, 0); ihdr.writeUInt32BE(targetH, 4); ihdr[8] = 8; ihdr[9] = colorType;
    return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), writeChunk("IHDR", ihdr), writeChunk("IDAT", deflateSync(croppedRaw)), writeChunk("IEND", Buffer.alloc(0))]).toString("base64");
  }

  async screenshotImage(path?: string, returnImage: boolean = true, crop?: { x: number; y: number; width: number; height: number }, tabId?: string) {
    const targetTabId = await this.ensureTab(tabId);
    const res = await this.request(this.withTab("/screenshot", targetTabId));
    const data = await res.json() as any;

    // Kuri returns { id: N, result: { data: "base64..." } }
    let base64 = data.result?.data || data.data;
    if (!base64) {
      throw new Error(`Kuri screenshot failed: ${JSON.stringify(data)}`);
    }

    // Apply cropping if requested
    if (crop) {
      base64 = await this.cropImage(Buffer.from(base64, "base64"), crop);
    }

    if (path) {
      const dirPath = dirname(path);
      if (dirPath && dirPath !== "." && !fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(path, Buffer.from(base64, "base64"));
    }

    const content: any[] = [];
    if (returnImage) {
      content.push({
        type: "image",
        data: base64,
        mimeType: "image/png",
      });
    } else if (path) {
      content.push({
        type: "text",
        text: `Screenshot saved to ${path}`,
      });
    }

    return { content };
  }

  async restart() {
    await this.killKuri();
    this.sessionId = `mcp-session-${Math.random().toString(36).substring(7)}`;
    this.currentTabId = null;
    return {
      content: [
        {
          type: "text",
          text: "Browser engine restarted with a fresh session ID and tab context cleared.",
        },
      ],
    };
}
}
