export type EpgChannel = {
  id: string;
  name: string;
  tvgId?: string;
  tvgName?: string;
  logo?: string;
  country?: string;
};
export type EpgProgramme = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: number;
  stop: number;
};
export type EpgMeta = {
  key: string;
  value: unknown;
};

const DB_NAME = "xoratv-epg";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("channels")) db.createObjectStore("channels", { keyPath: "id" });
      if (!db.objectStoreNames.contains("programmes")) {
        const store = db.createObjectStore("programmes", { keyPath: "id" });
        store.createIndex("channelId", "channelId", { unique: false });
        store.createIndex("start", "start", { unique: false });
        store.createIndex("stop", "stop", { unique: false });
        store.createIndex("channelStart", ["channelId", "start"], { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("mappings")) db.createObjectStore("mappings", { keyPath: "channelId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open EPG database."));
    request.onblocked = () => reject(new Error("EPG database upgrade is blocked."));
  });
  return dbPromise;
}

export async function saveChannels(channels: EpgChannel[]): Promise<void> {
  const db = await database();
  const tx = db.transaction("channels", "readwrite");
  const store = tx.objectStore("channels");
  for (const channel of channels) store.put(channel);
  await transactionDone(tx);
}

export async function writeProgrammeBatch(programmes: EpgProgramme[]): Promise<void> {
  const db = await database();
  const tx = db.transaction("programmes", "readwrite");
  const store = tx.objectStore("programmes");
  for (const programme of programmes) store.put(programme);
  await transactionDone(tx);
}

export async function getProgrammes(channelId: string, start: number, stop: number): Promise<EpgProgramme[]> {
  const db = await database();
  const tx = db.transaction("programmes", "readonly");
  const index = tx.objectStore("programmes").index("channelStart");
  const range = IDBKeyRange.bound([channelId, start], [channelId, stop]);
  const values = await requestResult(index.getAll(range)) as EpgProgramme[];
  return values.filter((item) => item.stop > start && item.start < stop).sort((a, b) => a.start - b.start);
}

export async function getAllChannels(): Promise<EpgChannel[]> {
  const db = await database();
  const tx = db.transaction("channels", "readonly");
  return requestResult(tx.objectStore("channels").getAll()) as Promise<EpgChannel[]>;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await database();
  const tx = db.transaction("meta", "readonly");
  const value = await requestResult(tx.objectStore("meta").get(key)) as EpgMeta | undefined;
  return value?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await database();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value } satisfies EpgMeta);
  await transactionDone(tx);
}

export async function getManualMappings(): Promise<Record<string, string>> {
  const db = await database();
  const tx = db.transaction("mappings", "readonly");
  const rows = await requestResult(tx.objectStore("mappings").getAll()) as Array<{channelId:string; epgId:string}>;
  return Object.fromEntries(rows.map((row) => [row.channelId, row.epgId]));
}

export async function setManualMapping(channelId: string, epgId: string): Promise<void> {
  const db = await database();
  const tx = db.transaction("mappings", "readwrite");
  tx.objectStore("mappings").put({ channelId, epgId });
  await transactionDone(tx);
}

export async function clearEpgContent(): Promise<void> {
  const db = await database();
  const tx = db.transaction(["channels", "programmes", "meta"], "readwrite");
  tx.objectStore("channels").clear();
  tx.objectStore("programmes").clear();
  tx.objectStore("meta").delete("channelMatches");
  tx.objectStore("meta").delete("unmatchedChannels");
  await transactionDone(tx);
}

export async function deleteExpiredProgrammes(now = Date.now()): Promise<void> {
  const db = await database();
  const tx = db.transaction("programmes", "readwrite");
  const index = tx.objectStore("programmes").index("stop");
  const request = index.openCursor(IDBKeyRange.upperBound(now - 2 * 60 * 60 * 1000));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };
  await transactionDone(tx);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}
