/**
 * 4. Automated Signup & Session Management on Free-to-Watch Sites
 *
 * Implements:
 * A. Synthetic Identity & Credential Generation (managed pool of burner profiles)
 * B. Session Persistence & Cookie Jar Management (Session Vault storageState serialization)
 * C. Anti-Bot and Human-Like Emulation (behavioral delays, human typing simulation, CAPTCHA handlers)
 */

export interface SyntheticProfile {
  email: string;
  username: string;
  password: string;
  birthYear: number;
  gender: string;
  createdAt: string;
}

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface StoredOriginStorage {
  origin: string;
  localStorage: { name: string; value: string }[];
}

/**
 * Conforms to Playwright / Puppeteer storage_state specification
 */
export interface BrowserStorageState {
  cookies: StoredCookie[];
  origins: StoredOriginStorage[];
}

export interface FormFieldAction {
  selector: string;
  value: string;
  typingDelayMs?: number | undefined;
}

/**
 * Session Vault (Redis / persistent storage abstraction)
 */
export class SessionVault {
  private memoryVault: Map<string, BrowserStorageState> = new Map();

  public async saveSession(platformId: string, state: BrowserStorageState): Promise<void> {
    this.memoryVault.set(platformId, state);
  }

  public async getSession(platformId: string): Promise<BrowserStorageState | null> {
    return this.memoryVault.get(platformId) ?? null;
  }

  public async hasValidSession(platformId: string): Promise<boolean> {
    const session = this.memoryVault.get(platformId);
    if (!session || session.cookies.length === 0) return false;
    const now = Date.now() / 1000;
    const hasActiveCookie = session.cookies.some((c) => c.expires === -1 || c.expires > now);
    return hasActiveCookie;
  }
}

/**
 * Synthetic Identity Generator
 */
export class SyntheticIdentityGenerator {
  private emailDomains = ["freemail-inbox.test", "stream-burner.org", "mail-collector.net"];

  /**
   * Creates randomized burner credentials for free streaming registration.
   */
  public generateIdentity(): SyntheticProfile {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const domain =
      this.emailDomains[Math.floor(Math.random() * this.emailDomains.length)] ??
      "stream-burner.org";
    const username = `cine_guest_${randomSuffix}`;
    const email = `${username}@${domain}`;
    const password = `XoraStream!${Math.random().toString(36).substring(2, 10).toUpperCase()}#2026`;

    return {
      email,
      username,
      password,
      birthYear: 1990 + Math.floor(Math.random() * 12),
      gender: Math.random() > 0.5 ? "male" : "female",
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Proxy Manager for handling Region-blocked / Geo-blocked sites
 */
export interface ProxyEndpoint {
  server: string;
  region: string;
  protocol: "http" | "https" | "socks5";
  auth?: { username: string; password: string };
}

export class GeoProxyManager {
  private fallbackProxies: ProxyEndpoint[] = [
    { server: "us-east.stream-proxy.internal:8080", region: "US", protocol: "http" },
    { server: "us-west.residential-node.internal:8080", region: "US", protocol: "http" },
    { server: "eu-central.stream-node.internal:8080", region: "EU", protocol: "http" },
  ];

  /**
   * Checks if an error or URL response indicates geographic or regional restriction
   */
  public isGeoBlocked(url: string, httpStatus: number, pageText = ""): boolean {
    const text = pageText.toLowerCase();
    return (
      url.includes("gdpr.") ||
      url.includes("region-restricted") ||
      url.includes("country-blocked") ||
      url.includes("not-available-in-your-country") ||
      httpStatus === 451 ||
      (httpStatus === 403 &&
        (text.includes("territory") || text.includes("geographic") || text.includes("region"))) ||
      text.includes("not currently available in your area") ||
      text.includes("not available in your region") ||
      text.includes("only available to customers in the united states")
    );
  }

  /**
   * Returns proxy launch arguments for headless Chrome when a site is geoblocked
   */
  public getProxyLaunchArgs(region = "US"): string[] {
    const proxy = this.fallbackProxies.find((p) => p.region === region) || this.fallbackProxies[0];
    return proxy ? [`--proxy-server=${proxy.server}`] : [];
  }
}

/**
 * Deep Clone of Human-Like Behavioral Simulator
 * Emulates authentic human typing cadence, cubic Bézier mouse movement,
 * reading scroll pauses, and natural form navigation.
 */
export class HumanBehaviorSimulator {
  private proxyManager = new GeoProxyManager();

  public getProxyManager(): GeoProxyManager {
    return this.proxyManager;
  }

  /**
   * Calculates natural randomized typing delay between keystrokes (45ms to 195ms)
   * with occasional micro-pauses (300ms - 450ms) mimicking human hesitation.
   */
  public getRandomTypingDelay(): number {
    const isHesitating = Math.random() < 0.08;
    if (isHesitating) {
      return Math.floor(Math.random() * (450 - 280 + 1)) + 280;
    }
    return Math.floor(Math.random() * (195 - 45 + 1)) + 45;
  }

  /**
   * Generates pause duration between user actions (e.g. moving between form inputs).
   */
  public async pauseBetweenActions(minMs = 600, maxMs = 2200): Promise<void> {
    const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((resolve) => setTimeout(resolve, duration));
  }

  /**
   * Generates cubic Bézier curve points for realistic human mouse trajectory
   */
  public generateBezierPath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    steps = 15,
  ): { x: number; y: number }[] {
    // Generate randomized control points with human tremor
    const ctrlX1 = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * 40;
    const ctrlY1 = startY + (targetY - startY) * 0.1 + (Math.random() - 0.5) * 40;
    const ctrlX2 = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * 30;
    const ctrlY2 = startY + (targetY - startY) * 0.9 + (Math.random() - 0.5) * 30;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const x = uuu * startX + 3 * uu * t * ctrlX1 + 3 * u * tt * ctrlX2 + ttt * targetX;
      const y = uuu * startY + 3 * uu * t * ctrlY1 + 3 * u * tt * ctrlY2 + ttt * targetY;
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    return points;
  }

  /**
   * Deep clone of human typing simulation in a page context
   */
  public async simulateHumanTyping(
    page: {
      evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
    },
    selector: string,
    text: string,
  ): Promise<void> {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const delay = this.getRandomTypingDelay();
      await new Promise((r) => setTimeout(r, delay));
      await page.evaluate(
        (sel, c) => {
          const el = document.querySelector(sel as string) as HTMLInputElement | null;
          if (el) {
            el.focus();
            el.value = (el.value || "") + (c as string);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        },
        selector,
        char,
      );
    }
  }

  /**
   * Simulates realistic reading scroll with variable speed and micro-reversals
   */
  public async simulateHumanReadingScroll(page: {
    evaluate: (fn: () => unknown) => Promise<unknown>;
  }): Promise<void> {
    await page.evaluate(async () => {
      const scrollStep = Math.floor(Math.random() * 200) + 150;
      window.scrollBy({ top: scrollStep, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 600));
      // Micro upward recoil (simulates human eye alignment)
      window.scrollBy({ top: -30, behavior: "smooth" });
    });
    await this.pauseBetweenActions(400, 900);
  }

  /**
   * Generates form input interaction sequence matching the specification
   */
  public buildSignupActions(profile: SyntheticProfile): FormFieldAction[] {
    return [
      {
        selector: 'input[name="email"], input[type="email"]',
        value: profile.email,
        typingDelayMs: this.getRandomTypingDelay(),
      },
      {
        selector: 'input[name="password"], input[type="password"]',
        value: profile.password,
        typingDelayMs: this.getRandomTypingDelay(),
      },
      {
        selector: 'button[type="submit"], input[type="submit"], form button',
        value: "click",
      },
    ];
  }
}
