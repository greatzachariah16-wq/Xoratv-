#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";

const [m3uPath, xmltvPath] = process.argv.slice(2);
if (!m3uPath || !xmltvPath) {
  console.error("Usage: node scripts/check-epg-match.mjs <channels.m3u> <guide.xml|guide.xml.gz>");
  process.exit(2);
}
if (!fs.existsSync(m3uPath) || !fs.existsSync(xmltvPath)) {
  console.error("Both input files must exist.");
  process.exit(2);
}

const m3u = fs.readFileSync(m3uPath, "utf8");
const m3uIds = new Set();
for (const line of m3u.split(/\r?\n/)) {
  if (!/^#EXTINF:/i.test(line)) continue;
  const id = line.match(/\btvg-id\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
  if (id) m3uIds.add(id);
}

async function readXmltvIds(filePath) {
  const source = createReadStream(filePath);
  const input = filePath.toLowerCase().endsWith(".gz") ? source.pipe(createGunzip()) : source;
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const ids = new Set();
  for await (const bytes of input) {
    buffer += decoder.write(bytes);
    while (true) {
      const start = buffer.search(/<channel\b/i);
      if (start < 0) {
        buffer = buffer.slice(-256);
        break;
      }
      if (start > 0) buffer = buffer.slice(start);
      const end = buffer.toLowerCase().indexOf("</channel>");
      if (end < 0) break;
      const block = buffer.slice(0, end + 10);
      const open = block.slice(0, block.indexOf(">") + 1);
      const id = open.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
      if (id) ids.add(id);
      buffer = buffer.slice(end + 10);
    }
    if (buffer.length > 1024 * 1024) throw new Error("XMLTV has an oversized or malformed channel element.");
  }
  buffer += decoder.end();
  const start = buffer.search(/<channel\b/i);
  if (start >= 0) {
    const block = buffer.slice(start);
    const open = block.slice(0, block.indexOf(">") + 1);
    const id = open.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

try {
  const xmltvIds = await readXmltvIds(xmltvPath);
  const matched = [...m3uIds].filter((id) => xmltvIds.has(id));
  const missing = [...m3uIds].filter((id) => !xmltvIds.has(id));
  console.log("M3U file: " + path.resolve(m3uPath));
  console.log("XMLTV file: " + path.resolve(xmltvPath));
  console.log("Unique M3U tvg-id values: " + m3uIds.size);
  console.log("XMLTV channel IDs: " + xmltvIds.size);
  console.log("Exact ID matches: " + matched.length);
  console.log("Missing IDs: " + missing.length);
  if (missing.length) {
    console.log("\nM3U tvg-id values missing from XMLTV:");
    for (const id of missing) console.log(" - " + id);
  }
  console.log("\nMatch rate: " + (m3uIds.size ? ((matched.length / m3uIds.size) * 100).toFixed(1) : "0.0") + "%");
} catch (error) {
  console.error("Could not inspect XMLTV:", error instanceof Error ? error.message : error);
  process.exit(1);
}
