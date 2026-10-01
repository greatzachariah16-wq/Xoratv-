import { MongoClient, type Db } from "mongodb";

export type XoraContentRecord = {
  id: string;
  firebaseId?: string | null;
  contentType: "course" | "lesson" | "video" | "short" | "xseries" | "post" | "other";
  creatorId?: string | null;
  title: string;
  description: string;
  cloudinaryPublicId?: string | null;
  cloudinaryUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  originalBytes?: number | null;
  compressedBytes?: number | null;
  status: "processing" | "ready" | "failed" | "archived";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
const CONTENT_SECRET = process.env.XORA_CONTENT_DB_SECRET?.trim() || "";
const MONGO_URI = process.env.MONGODB_URI?.trim() || "";

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

function requireConfig() {
  if (!SUPABASE_KEY || !CONTENT_SECRET) {
    throw new Error("Xora content database credentials are not configured.");
  }
  if (!MONGO_URI) throw new Error("MONGODB_URI is not configured.");
}

async function getMongoDb() {
  requireConfig();
  if (mongoClient && mongoDb) return mongoDb;

  // A failed Atlas connection must not leave a half-initialized MongoClient in
  // memory. Render instances can retry after a transient TLS handshake failure.
  mongoClient = new MongoClient(MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });

  try {
    await mongoClient.connect();
    mongoDb = mongoClient.db("xoratv");
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ id: 1 }, { unique: true });
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ creatorId: 1, contentType: 1 });
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ cloudinaryPublicId: 1 }, { sparse: true });
    return mongoDb;
  } catch (error) {
    await mongoClient.close().catch(() => undefined);
    mongoClient = null;
    mongoDb = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("MongoDB content database connection failed: " + message);
  }
}

async function supabaseUpsert(record: XoraContentRecord) {
  requireConfig();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/xora_content?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
      "x-xora-content-secret": CONTENT_SECRET,
    },
    body: JSON.stringify({
      id: record.id,
      firebase_id: record.firebaseId ?? null,
      content_type: record.contentType,
      creator_id: record.creatorId ?? null,
      title: record.title,
      description: record.description,
      cloudinary_public_id: record.cloudinaryPublicId ?? null,
      cloudinary_url: record.cloudinaryUrl ?? null,
      thumbnail_url: record.thumbnailUrl ?? null,
      duration_seconds: record.durationSeconds ?? null,
      original_bytes: record.originalBytes ?? null,
      compressed_bytes: record.compressedBytes ?? null,
      status: record.status,
      metadata: record.metadata ?? {},
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase content write failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

export async function upsertXoraContent(record: XoraContentRecord) {
  requireConfig();
  const mongo = await getMongoDb();
  await Promise.all([
    supabaseUpsert(record),
    mongo.collection<XoraContentRecord>("videos").updateOne(
      { id: record.id },
      { $set: record, $setOnInsert: { createdAt: record.createdAt } },
      { upsert: true },
    ),
  ]);
  return record;
}

export async function registerCloudinaryVideo(input: {
  id: string;
  creatorId?: string | null;
  title?: string;
  description?: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  originalBytes?: number | null;
  compressedBytes?: number | null;
  contentType?: XoraContentRecord["contentType"];
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  return upsertXoraContent({
    id: input.id,
    firebaseId: input.id,
    contentType: input.contentType || "video",
    creatorId: input.creatorId ?? null,
    title: input.title || "",
    description: input.description || "",
    cloudinaryPublicId: input.cloudinaryPublicId,
    cloudinaryUrl: input.cloudinaryUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    durationSeconds: input.durationSeconds ?? null,
    originalBytes: input.originalBytes ?? null,
    compressedBytes: input.compressedBytes ?? null,
    status: "ready",
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  });
}

export async function getXoraContent(id: string): Promise<XoraContentRecord | null> {
  requireConfig();
  const mongo = await getMongoDb();
  const record = await mongo.collection<XoraContentRecord>("videos").findOne({ id });
  if (record) return record;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/xora_content?id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "x-xora-content-secret": CONTENT_SECRET,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? {
    id: rows[0].id,
    firebaseId: rows[0].firebase_id,
    contentType: rows[0].content_type,
    creatorId: rows[0].creator_id,
    title: rows[0].title,
    description: rows[0].description,
    cloudinaryPublicId: rows[0].cloudinary_public_id,
    cloudinaryUrl: rows[0].cloudinary_url,
    thumbnailUrl: rows[0].thumbnail_url,
    durationSeconds: rows[0].duration_seconds,
    originalBytes: rows[0].original_bytes,
    compressedBytes: rows[0].compressed_bytes,
    status: rows[0].status,
    metadata: rows[0].metadata || {},
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  } : null;
}

export async function deleteXoraContent(id: string): Promise<void> {
  requireConfig();
  const errors: string[] = [];

  // Clean the two metadata stores independently. A transient MongoDB failure
  // should not prevent the Supabase copy from being removed.
  try {
    const response = await fetch(
      SUPABASE_URL + "/rest/v1/xora_content?id=eq." + encodeURIComponent(id),
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          "x-xora-content-secret": CONTENT_SECRET,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => "");
      errors.push("Supabase: " + response.status + " " + detail.slice(0, 200));
    }
  } catch (error) {
    errors.push("Supabase: " + (error instanceof Error ? error.message : String(error)));
  }

  try {
    const mongo = await getMongoDb();
    await mongo.collection<XoraContentRecord>("videos").deleteOne({ id });
  } catch (error) {
    errors.push("MongoDB: " + (error instanceof Error ? error.message : String(error)));
  }

  if (errors.length) {
    throw new Error("Course content cleanup failed — " + errors.join(" · "));
  }
}

export async function closeContentDatabaseConnections() {
  if (mongoClient) await mongoClient.close();
  mongoClient = null;
  mongoDb = null;
}
