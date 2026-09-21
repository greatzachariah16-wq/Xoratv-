import { queryRtdb, getLocalStore } from "./xseries-service-account";

const PREROLL_CONFIG_RTDB_PATH = "preroll_config";

export interface PrerollConfig {
  enabled: boolean;
  adTagUrl: string;
  applyToExternal: boolean;
  applyToDirect: boolean;
  updatedAt?: string;
}

export const DEFAULT_PREROLL_CONFIG: PrerollConfig = {
  enabled: true,
  adTagUrl:
    process.env.VITE_VAST_AD_TAG_URL || "https://youradexchange.com/video/select.php?r=12201910",
  applyToExternal: true,
  applyToDirect: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Fetch active Pre-Roll Configuration from RTDB or local store memory.
 */
export async function getPrerollConfig(): Promise<PrerollConfig> {
  try {
    const raw = (await queryRtdb(PREROLL_CONFIG_RTDB_PATH).catch(
      () => null,
    )) as Partial<PrerollConfig> | null;
    if (raw && typeof raw === "object" && typeof raw.enabled === "boolean") {
      return {
        enabled: raw.enabled,
        adTagUrl: (raw.adTagUrl || DEFAULT_PREROLL_CONFIG.adTagUrl).trim(),
        applyToExternal: typeof raw.applyToExternal === "boolean" ? raw.applyToExternal : true,
        applyToDirect: typeof raw.applyToDirect === "boolean" ? raw.applyToDirect : true,
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
    }

    // Check local memory store
    const store = getLocalStore();
    const local = store.get(PREROLL_CONFIG_RTDB_PATH) as PrerollConfig | undefined;
    if (local && typeof local === "object" && typeof local.enabled === "boolean") {
      return local;
    }
  } catch (err) {
    console.warn("[PrerollService] Error fetching config:", err);
  }

  return { ...DEFAULT_PREROLL_CONFIG };
}

/**
 * Save / update Pre-Roll Configuration in RTDB & local memory.
 */
export async function updatePrerollConfig(updates: Partial<PrerollConfig>): Promise<PrerollConfig> {
  const current = await getPrerollConfig();
  const nextConfig: PrerollConfig = {
    enabled: typeof updates.enabled === "boolean" ? updates.enabled : current.enabled,
    adTagUrl: (updates.adTagUrl || current.adTagUrl).trim() || DEFAULT_PREROLL_CONFIG.adTagUrl,
    applyToExternal:
      typeof updates.applyToExternal === "boolean"
        ? updates.applyToExternal
        : current.applyToExternal,
    applyToDirect:
      typeof updates.applyToDirect === "boolean" ? updates.applyToDirect : current.applyToDirect,
    updatedAt: new Date().toISOString(),
  };

  // Persist to RTDB
  await queryRtdb(PREROLL_CONFIG_RTDB_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextConfig),
  }).catch((err) => {
    console.warn("[PrerollService] Failed writing config to RTDB:", err);
  });

  // Update local memory store
  const store = getLocalStore();
  store.set(PREROLL_CONFIG_RTDB_PATH, nextConfig);

  return nextConfig;
}
