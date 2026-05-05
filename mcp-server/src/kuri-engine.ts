import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

interface Preset {
  userAgent: string;
  width: number;
  height: number;
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
  },
  pixel_8: {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    width: 412,
    height: 915,
  },
  tablet_ipad: {
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    width: 810,
    height: 1080,
  },
  bot_google: {
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    width: 1200,
    height: 800,
  },
};

export class KuriEngine extends EventEmitter {
  private kuriProcess: ChildProcess | null = null;
  private port: number = 8080;
  private baseUrl: string = `http://127.0.0.1:${this.port}`;
  private sessionId: string = `mcp-session-${Math.random().toString(36).substring(7)}`;
  private kuriPath: string = "kuri";
  private currentTabId: string | null = null;
  private currentConfig: any = {
    headless: true,
    proxy: null,
  };

  constructor() {
    super();
    this.setupCleanup();
  }

  private setupCleanup() {
    const cleanup = () => {
      this.killKuri();
    };
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(); });
    process.on("SIGTERM", () => { cleanup(); process.exit(); });
  }

  private killKuri() {
    if (this.kuriProcess) {
      console.error(`Killing Kuri process ${this.kuriProcess.pid}...`);
      try {
        if (this.kuriProcess.pid) {
          process.kill(-this.kuriProcess.pid, "SIGKILL");
        }
      } catch (e) {
        this.kuriProcess.kill("SIGKILL");
      }
      this.kuriProcess = null;
    }
  }

  private async ensureRunning() {
    if (this.kuriProcess) return;

    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (res.ok) {
        console.error("Kuri already running on port 8080");
        return;
      }
    } catch (e) {
      // expected
    }

    console.error(`Starting Kuri process: ${this.kuriPath}`);
    const env = { ...process.env, PORT: this.port.toString(), HEADLESS: this.currentConfig.headless.toString() };
    if (this.currentConfig.proxy) {
      (env as any).KURI_PROXY = this.currentConfig.proxy;
    }

    this.kuriProcess = spawn(this.kuriPath, [], { env, stdio: "pipe", detached: true });

    this.kuriProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[Kuri] ${data.toString().trim()}`);
    });

    this.kuriProcess.on("error", (err) => {
      console.error(`Kuri process error: ${err.message}`);
    });

    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`${this.baseUrl}/health`);
        if (res.ok) {
          console.error("Kuri is healthy");
          return;
        }
      } catch (e) {
        // ignore
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.killKuri();
    throw new Error("Kuri failed to start after 20 seconds");
  }

  private async request(path: string, options: any = {}) {
    await this.ensureRunning();
    
    const urlObj = new URL(path, this.baseUrl);
    if (this.currentTabId && !urlObj.searchParams.has("tab_id")) {
      urlObj.searchParams.set("tab_id", this.currentTabId);
    }
    
    const res = await fetch(urlObj.toString(), {
      ...options,
      headers: {
        ...options.headers,
        "X-Kuri-Session": this.sessionId,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kuri API error (${res.status}): ${text}`);
    }

    return res;
  }

  async configure(args: { preset?: string; userAgent?: string; width?: number; height?: number; proxy?: string; headless?: boolean }) {
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
      this.restart();
      await this.ensureRunning();
    }

    let effectiveUA = args.userAgent;
    let effectiveWidth = args.width;
    let effectiveHeight = args.height;

    if (args.preset && PRESETS[args.preset]) {
      const p = PRESETS[args.preset];
      effectiveUA = effectiveUA || p.userAgent;
      effectiveWidth = effectiveWidth || p.width;
      effectiveHeight = effectiveHeight || p.height;
    }

    return {
      content: [
        {
          type: "text",
          text: `Browser configured: ${JSON.stringify({ 
            preset: args.preset, 
            userAgent: effectiveUA, 
            viewport: effectiveWidth ? `${effectiveWidth}x${effectiveHeight}` : "default",
            proxy: this.currentConfig.proxy,
            headless: this.currentConfig.headless
          })}`,
        },
      ],
    };
  }

  async navigate(url: string) {
    // 1. Ensure we have a tab
    if (!this.currentTabId) {
      const resTab = await this.request("/tab/new");
      const dataTab = await resTab.json() as any;
      this.currentTabId = dataTab.tab_id;
    }

    // 2. Navigate the tab
    const res = await this.request(`/navigate?url=${encodeURIComponent(url)}`);
    const data = await res.json() as any;
    
    return {
      content: [
        {
          type: "text",
          text: `Navigated to ${url}. Title: ${data.title || "Loaded"} (Tab: ${this.currentTabId})`,
        },
      ],
    };
  }

  async snapshot(filter: "interactive" | "all" = "interactive") {
    const res = await this.request(`/snapshot?filter=${filter}&format=compact`);
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

  async click(ref: string) {
    const elementRef = ref.startsWith("@") ? ref.substring(1) : ref;
    await this.request(`/action?action=click&ref=${elementRef}`);
    return {
      content: [
        {
          type: "text",
          text: `Clicked ${ref}`,
        },
      ],
    };
  }

  async type(ref: string, text: string) {
    const elementRef = ref.startsWith("@") ? ref.substring(1) : ref;
    await this.request(`/action?action=fill&ref=${elementRef}&value=${encodeURIComponent(text)}`);
    return {
      content: [
        {
          type: "text",
          text: `Typed into ${ref}`,
        },
      ],
    };
  }

  async read(format: "markdown" | "text" = "markdown") {
    const endpoint = format === "markdown" ? "/markdown" : "/text";
    const res = await this.request(endpoint);
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

  async restart() {
    this.killKuri();
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
