import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, rtdbSet, sanitizePathKey } from "./db";
import type { FraudSignal, IPReputationData } from "./types";

/**
 * Checks if an IP is a local loopback, intranet, or private address.
 */
function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.trim().toLowerCase();
  return (
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "localhost" ||
    clean.startsWith("10.") ||
    clean.startsWith("192.168.") ||
    clean.startsWith("172.16.") ||
    clean.startsWith("172.17.") ||
    clean.startsWith("172.18.") ||
    clean.startsWith("172.19.") ||
    clean.startsWith("172.2") ||
    clean.startsWith("172.30.") ||
    clean.startsWith("172.31.") ||
    clean.startsWith("fc00:") ||
    clean.startsWith("fe80:")
  );
}

/**
 * Well-known commercial cloud / datacenter ASNs and names commonly used for bot farms.
 */
const KNOWN_DATACENTER_KEYWORDS = [
  "amazon",
  "aws",
  "google cloud",
  "digitalocean",
  "linode",
  "hetzner",
  "ovh",
  "m247",
  "choopa",
  "vultr",
  "oracle",
  "microsoft",
  "azure",
  "contabo",
  "leaseweb",
  "datapacket",
  "cogent",
  "fastly",
  "cloudflare",
];

export class IPReputationService {
  /**
   * Checks the reputation of an IP address.
   * Leverages Firebase RTDB caching to minimize external API requests on Render free tier.
   */
  public static async checkReputation(ip: string): Promise<{
    reputation: IPReputationData;
    signals: FraudSignal[];
  }> {
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // 1. Handle local or empty IP
    if (!ip || isPrivateOrLocalIp(ip)) {
      const localRep: IPReputationData = {
        ip: ip || "127.0.0.1",
        isDatacenter: false,
        isProxy: false,
        isVpn: false,
        isTor: false,
        countryCode: "LOCAL",
        countryName: "Localhost / Intranet",
        isp: "Local Loopback",
        asOrganization: "Private Network",
        asn: "AS0",
        cachedAt: now,
        expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      };
      return { reputation: localRep, signals: [] };
    }

    const cleanIpKey = sanitizePathKey(ip);
    const cachePath = `${FRAUD_GUARD_CONFIG.rtdbPaths.ipReputationCache}/${cleanIpKey}`;

    // 2. Check Firebase RTDB Cache first
    const cached = await rtdbGet<IPReputationData>(cachePath);
    if (cached && cached.expiresAt > now) {
      const signals = this.evaluateSignals(cached, nowIso);
      return { reputation: cached, signals };
    }

    // 3. Perform external lookup with timeout
    let repData: IPReputationData;
    try {
      repData = await this.fetchFromIpApi(ip, now);
    } catch {
      // Fallback if external API fails or times out
      repData = {
        ip,
        isDatacenter: false,
        isProxy: false,
        isVpn: false,
        isTor: false,
        countryCode: "UNKNOWN",
        countryName: "Unknown",
        isp: "Unknown",
        asOrganization: "Unknown",
        asn: "Unknown",
        cachedAt: now,
        expiresAt: now + 60 * 60 * 1000, // Short cache for failures (1 hour)
      };
    }

    // 4. Cache in RTDB (asynchronous)
    void rtdbSet(cachePath, repData);

    const signals = this.evaluateSignals(repData, nowIso);
    return { reputation: repData, signals };
  }

  private static async fetchFromIpApi(ip: string, now: number): Promise<IPReputationData> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      FRAUD_GUARD_CONFIG.ipReputation.apiTimeoutMs,
    );

    try {
      // Free endpoint with hosting, proxy, and mobile flags
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,isp,org,as,mobile,proxy,hosting,query`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        status?: string;
        country?: string;
        countryCode?: string;
        isp?: string;
        org?: string;
        as?: string;
        mobile?: boolean;
        proxy?: boolean;
        hosting?: boolean;
      };

      const ispLower = (json.isp || "").toLowerCase();
      const orgLower = (json.org || "").toLowerCase();
      const asLower = (json.as || "").toLowerCase();

      const matchesDcKeyword = KNOWN_DATACENTER_KEYWORDS.some(
        (kw) => ispLower.includes(kw) || orgLower.includes(kw) || asLower.includes(kw),
      );

      const isDatacenter = Boolean(json.hosting) || matchesDcKeyword;
      const isProxy = Boolean(json.proxy);

      const ttlMs = FRAUD_GUARD_CONFIG.ipReputation.cacheTtlHours * 60 * 60 * 1000;

      return {
        ip,
        isDatacenter,
        isProxy,
        isVpn: isProxy,
        isTor: false,
        countryCode: json.countryCode || "UNKNOWN",
        countryName: json.country || "Unknown",
        isp: json.isp || "Unknown",
        asOrganization: json.org || json.as || "Unknown",
        asn: (json.as || "").split(" ")[0] || "Unknown",
        cachedAt: now,
        expiresAt: now + ttlMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private static evaluateSignals(rep: IPReputationData, detectedAt: string): FraudSignal[] {
    const signals: FraudSignal[] = [];

    if (rep.isDatacenter) {
      signals.push({
        type: "DATACENTER_OR_HOSTING_IP",
        severity: "high",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.datacenterOrHostingIp,
        description: `Traffic originating from datacenter / cloud hosting IP (${rep.asOrganization || rep.isp}). High bot probability.`,
        evidence: {
          ip: rep.ip,
          isp: rep.isp,
          asn: rep.asn,
          country: rep.countryCode,
        },
        detectedAt,
      });
    }

    if (rep.isProxy || rep.isVpn) {
      signals.push({
        type: "VPN_OR_PROXY_DETECTED",
        severity: "medium",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.proxyOrVpnDetected,
        description: `Known proxy or commercial VPN network detected.`,
        evidence: {
          ip: rep.ip,
          isp: rep.isp,
        },
        detectedAt,
      });
    }

    if (rep.isTor) {
      signals.push({
        type: "TOR_EXIT_NODE",
        severity: "critical",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.torExitNode,
        description: `Tor exit node detected.`,
        evidence: { ip: rep.ip },
        detectedAt,
      });
    }

    return signals;
  }
}
