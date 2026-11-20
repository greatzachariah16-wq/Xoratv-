export type EpgChannel = { id: string; displayName?: string; logo?: string };
export type EpgProgramme = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: number;
  stop: number;
};

const DB_NAME = "xoratv-epg";
const DB_VERSION = 1;
const CHANNELS = "channels";
const PROGRAMMES = "programmes";
const META = "meta";
const MAPPINGS = "mappings";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHANNELS)) db.createObjectStore(CHANNELS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROGRAMMES)) {
        const store = db.createObjectStore(PROGRAMMES, { keyPath: "id" });
        store.createIndex("channelId", "channelId", { unique: false });
        store.createIndex("start", "start", { unique: false });
        store.createIndex("stop", "stop", { unique: false });
        store.createIndex("channelStart", ["channelId", "start"], { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(MAPPINGS)) db.createObjectStore(MAPPINGS, { keyPath: "channelId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open EPG database."));
    request.onblocked = () => reject(new Error("EPG database upgrade is blocked by another tab."));
  });
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = run(tx);
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error || new Error("EPG database request failed."));
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error("EPG database transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("EPG database transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export async function putChannels(items: EpgChannel[]): Promise<void> {
  if (!items.length) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHANNELS, "readwrite");
      const store = tx.objectStore(CHANNELS);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function putProgrammes(items: EpgProgramme[]): Promise<void> {
  if (!items.length) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROGRAMMES, "readwrite");
      const store = tx.objectStore(PROGRAMMES);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function getEpgChannels(): Promise<EpgChannel[]> {
  return transaction([CHANNELS], "readonly", (tx) => tx.objectStore(CHANNELS).getAll());
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const value = await transaction([META], "readonly", (tx) => tx.objectStore(META).get(key)) as { key: string; value: T } | undefined;
  return value?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await transaction([META], "readwrite", (tx) => tx.objectStore(META).put({ key, value }));
}

export async function getMappings(): Promise<Record<string, string>> {
  const rows = await transaction([MAPPINGS], "readonly", (tx) => tx.objectStore(MAPPINGS).getAll()) as Array<{ channelId: string; epgChannelId: string }>;
  return Object.fromEntries(rows.map((row) => [row.channelId, row.epgChannelId]));
}

export async function saveMappings(mappings: Record<string, string>): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MAPPINGS, "readwrite");
      const store = tx.objectStore(MAPPINGS);
      for (const [channelId, epgChannelId] of Object.entries(mappings)) store.put({ channelId, epgChannelId });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function saveManualMapping(channelId: string, epgChannelId: string): Promise<void> {
  await transaction([MAPPINGS], "readwrite", (tx) => tx.objectStore(MAPPINGS).put({ channelId, epgChannelId, manual: true }));
}

export async function getProgrammesForChannel(channelId: string, endTime = Date.now() + 48 * 3600000): Promise<EpgProgramme[]> {
  const db = await openDatabase();
  try {
    return await new Promise<EpgProgramme[]>((resolve, reject) => {
      const tx = db.transaction(PROGRAMMES, "readonly");
      const range = IDBKeyRange.bound([channelId, 0], [channelId, endTime]);
      const request = tx.objectStore(PROGRAMMES).index("channelStart").getAll(range);
      request.onsuccess = () => {
        const sorted = (request.result as EpgProgramme[]).filter((item) => item.stop > Date.now()).sort((a, b) => a.start - b.start);
        const normalized = sorted.map((item, index) => {
          const next = sorted[index + 1];
          return next && next.start < item.stop ? { ...item, stop: next.start } : item;
        });
        resolve(normalized.filter((item) => item.stop > item.start));
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function getProgrammesForChannels(channelIds: string[], startTime: number, endTime: number): Promise<EpgProgramme[]> {
  const uniqueIds = Array.from(new Set(channelIds)).slice(0, 150);
  if (!uniqueIds.length) return [];
  const db = await openDatabase();
  try {
    return await new Promise<EpgProgramme[]>((resolve, reject) => {
      const tx = db.transaction(PROGRAMMES, "readonly");
      const index = tx.objectStore(PROGRAMMES).index("channelStart");
      const groups: EpgProgramme[][] = [];
      for (const id of uniqueIds) {
        const request = index.getAll(IDBKeyRange.bound([id, 0], [id, endTime]));
        request.onsuccess = () => {
          const sorted = (request.result as EpgProgramme[])
            .filter((item) => item.stop > startTime && item.start < endTime)
            .sort((a, b) => a.start - b.start);
          groups.push(sorted.map((item, itemIndex) => {
            const next = sorted[itemIndex + 1];
            return next && next.start < item.stop ? { ...item, stop: next.start } : item;
          }).filter((item) => item.stop > item.start));
        };
        request.onerror = () => reject(request.error);
      }
      tx.oncomplete = () => resolve(groups.flat().sort((a, b) => a.start - b.start));
      tx.onerror = () => reject(tx.error || new Error("Could not read EPG timeline."));
      tx.onabort = () => reject(tx.error || new Error("EPG timeline read was aborted."));
    });
  } finally { db.close(); }
}

export async function deleteExpiredProgrammes(now = Date.now()): Promise<number> {
  const db = await openDatabase();
  let deleted = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROGRAMMES, "readwrite");
      const request = tx.objectStore(PROGRAMMES).index("stop").openCursor(IDBKeyRange.upperBound(now));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        deleted++;
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
  return deleted;
}
