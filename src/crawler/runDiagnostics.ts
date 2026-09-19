/**
 * Diagnostic CLI Execution Harness for First Real Test
 */

import { CrawlerTestRunner } from "./testRunner.ts";
import fs from "fs";

async function main() {
  console.log("Starting First Real Diagnostic Crawl...");
  const runner = new CrawlerTestRunner();
  const summary = await runner.executeDiagnosticCrawl();

  fs.writeFileSync("./crawler-diagnostic-result.json", JSON.stringify(summary, null, 2));
  console.log("Crawl completed! Saved output to crawler-diagnostic-result.json");
}

main().catch((err) => {
  console.error("Fatal crawler diagnostic error:", err);
  process.exit(1);
});
