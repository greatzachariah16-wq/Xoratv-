/**
 * 3. Headless Browsing Strategy for the Open Web
 *
 * Implements headless browser interaction strategies for dynamic SPAs,
 * DOM traversal, dynamic infinite scroll, and network resource optimization.
 *
 * Conforms to the Technical Specification:
 * - Route Interception: Aborts unnecessary resources (image, stylesheet, font, tracking pixels)
 * - DOM Traversal: Simulates window.scrollTo and page.waitForSelector triggers
 */

export type InterceptedResourceType =
  | "document"
  | "stylesheet"
  | "image"
  | "media"
  | "font"
  | "script"
  | "texttrack"
  | "xhr"
  | "fetch"
  | "eventsource"
  | "websocket"
  | "manifest"
  | "other";

export interface NetworkRoute {
  request: {
    url: string;
    resourceType: InterceptedResourceType | string;
    method: string;
    headers: Record<string, string>;
  };
  abort: () => Promise<void>;
  continue: () => Promise<void>;
}

export interface HeadlessScrapeOptions {
  waitForSelector?: string | undefined;
  scrollSteps?: number | undefined;
  scrollDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
  enableStealth?: boolean | undefined;
  blockUnnecessaryResources?: boolean | undefined;
  storageStatePath?: string | undefined;
}

export interface ExtractedPageElement {
  selector: string;
  text: string;
  attributes: Record<string, string>;
  html?: string | undefined;
}

/**
 * Route optimization filter matching the specification:
 * Aborts images, stylesheets, and fonts to accelerate page rendering and catalog harvesting.
 */
export async function routeIntercept(route: NetworkRoute): Promise<void> {
  const blockedTypes: (InterceptedResourceType | string)[] = [
    "image",
    "stylesheet",
    "font",
    "media",
  ];
  if (blockedTypes.includes(route.request.resourceType)) {
    await route.abort();
  } else {
    await route.continue();
  }
}

/**
 * Headless Engine controller
 */
export class HeadlessBrowsingEngine {
  private userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  /**
   * Generates stealth browser launch options matching the specification.
   */
  public getStealthLaunchConfig(): Record<string, unknown> {
    return {
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--blink-settings=imagesEnabled=false",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--user-agent=${this.userAgent}`,
      ],
      ignoreHTTPSErrors: true,
    };
  }

  /**
   * Simulates dynamic infinite scrolling and selector trigger polling.
   */
  public getDynamicScrollScript(steps = 3, delayMs = 800): string {
    return `
      (async () => {
        for (let i = 0; i < ${steps}; i++) {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          await new Promise(resolve => setTimeout(resolve, ${delayMs}));
        }
      })();
    `;
  }
}
