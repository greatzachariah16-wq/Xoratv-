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

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\\/$/, "");
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
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
    await mongoClient.connect();
    mongoDb = mongoClient.db("xoratv");
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ id: 1 }, { unique: true });
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ creatorId: 1, contentType: 1 });
    await mongoDb.collection<XoraContentRecord>("videos").createIndex({ cloudinaryPublicId: 1 }, { sparse: true });
  }
  return mongoDb;
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

export async function closeContentDatabaseConnections() {
  if (mongoClient) await mongoClient.close();
  mongoClient = null;
  mongoDb = null;
}
