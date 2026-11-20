#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";

const [playlistPath, xmltvPath] = process.argv.slice(2);
if (!playlistPath || !xmltvPath) {
  console.error("Usage: node scripts/check-epg-match.mjs <playlist.m3u> <guide.xml|guide.xml.gz>");
  process.exit(2);
}

const playlist = fs.readFileSync(playlistPath, "utf8").replace(/^\uFEFF/, "");
const ids = new Map();
for (const line of playlist.split(/\r?\n/)) {
  if (!line.startsWith("#EXTINF:")) continue;
  const id = line.match(/\btvg-id=["']([^"']+)["']/i)?.[1]?.trim();
  const name = line.slice(line.indexOf(",") + 1).trim();
  if (id) ids.set(id, name || id);
}
console.log("M3U channels with tvg-id:", ids.size);

const source = fs.createReadStream(xmltvPath);
const input = xmltvPath.toLowerCase().endsWith(".gz") ? source.pipe(createGunzip()) : source;
const decoder = new StringDecoder("utf8");
let buffer = "";
const found = new Set();
for await (const chunk of input) {
  buffer += decoder.write(chunk);
  let end;
  while ((end = buffer.indexOf(">")) >= 0) {
    const tag = buffer.slice(0, end + 1);
    buffer = buffer.slice(end + 1);
    if (!/^<channel\b/i.test(tag)) continue;
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id) found.add(id);
  }
  if (buffer.length > 4096) buffer = buffer.slice(-1024);
}
buffer += decoder.end();
console.log("XMLTV channel IDs found:", found.size);

const matched = [];
const missing = [];
for (const [id, name] of ids) (found.has(id) ? matched : missing).push({ id, name });
console.log("Exact tvg-id matches:", matched.length);
console.log("Missing tvg-id values:", missing.length);
for (const item of missing) console.log("MISSING", item.id, "-", item.name);
