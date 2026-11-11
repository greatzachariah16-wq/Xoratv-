import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const baseSha = process.env.XORA_BASE_SHA;

if (!baseSha) {
  console.error("XORA_BASE_SHA is required for baseline regression validation.");
  process.exit(2);
}

function run(command, args, cwd, maxBuffer = 40 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer,
    env: process.env,
  });

  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function addCounts(counts, key) {
  counts.set(key, (counts.get(key) || 0) + 1);
}

function parseTypeScriptDiagnostics(output) {
  const counts = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    if (match) addCounts(counts, `${match[1]} | ${match[2]} | ${match[3]}`);
  }
  return counts;
}

function parseLintDiagnostics(output, cwd) {
  let reports;
  try {
    reports = JSON.parse(output);
  } catch {
    throw new Error(`ESLint did not return valid JSON. Output: ${output.slice(0, 2000)}`);
  }

  const counts = new Map();
  for (const report of reports) {
    const file = path.relative(cwd, report.filePath).split(path.sep).join("/");
    for (const message of report.messages || []) {
      const key = [
        file,
        message.ruleId || "fatal",
        message.message,
      ].join(" | ");
      addCounts(counts, key);
    }
  }
  return counts;
}

function compareDiagnostics(label, base, head) {
  const regressions = [];
  for (const [key, count] of head) {
    const previous = base.get(key) || 0;
    if (count > previous) {
      regressions.push({ key, additional: count - previous });
    }
  }

  const baseTotal = [...base.values()].reduce((sum, count) => sum + count, 0);
  const headTotal = [...head.values()].reduce((sum, count) => sum + count, 0);
  console.log(
    `${label}: base=${baseTotal}, PR=${headTotal}, new=${regressions.reduce((sum, item) => sum + item.additional, 0)}`,
  );

  if (regressions.length > 0) {
    for (const item of regressions.slice(0, 40)) {
      console.error(`NEW ${label}: +${item.additional} ${item.key}`);
    }
  }
  return regressions.length === 0;
}

function runTypeScript(cwd) {
  const compiler = path.join(cwd, "node_modules", "typescript", "bin", "tsc");
  const result = run(process.execPath, [compiler, "--noEmit", "--pretty", "false"], cwd);
  const diagnostics = parseTypeScriptDiagnostics(result.stdout + result.stderr);
  if (result.status !== 0 && diagnostics.size === 0) {
    throw new Error(`TypeScript failed without parseable diagnostics in ${cwd}: ${result.stderr.slice(0, 2000)}`);
  }
  return diagnostics;
}

function runLint(cwd) {
  const eslint = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js");
  const result = run(process.execPath, [eslint, ".", "--format", "json"], cwd);
  const diagnostics = parseLintDiagnostics(result.stdout, cwd);
  if (result.status !== 0 && diagnostics.size === 0) {
    throw new Error(`ESLint failed without parseable diagnostics in ${cwd}: ${result.stderr.slice(0, 2000)}`);
  }
  return diagnostics;
}

const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "xoratv-base-"));
let worktreeAdded = false;

try {
  const added = run("git", ["worktree", "add", "--detach", baseDir, baseSha], root);
  if (added.status !== 0) {
    throw new Error(`Could not create base worktree: ${added.stderr || added.stdout}`);
  }
  worktreeAdded = true;

  fs.symlinkSync(path.join(root, "node_modules"), path.join(baseDir, "node_modules"), "dir");

  console.log(`Comparing PR diagnostics with base ${baseSha.slice(0, 12)}...`);
  const baseTypeScript = runTypeScript(baseDir);
  const headTypeScript = runTypeScript(root);
  const baseLint = runLint(baseDir);
  const headLint = runLint(root);

  const typeScriptClean = compareDiagnostics("TypeScript", baseTypeScript, headTypeScript);
  const lintClean = compareDiagnostics("ESLint", baseLint, headLint);

  if (!typeScriptClean || !lintClean) process.exitCode = 1;
  else console.log("No new TypeScript or ESLint diagnostics were introduced by this PR.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (worktreeAdded) {
    const removed = run("git", ["worktree", "remove", "--force", baseDir], root);
    if (removed.status !== 0) {
      console.error(`Could not remove temporary base worktree: ${removed.stderr || removed.stdout}`);
      process.exitCode = 1;
    }
  }
  fs.rmSync(baseDir, { recursive: true, force: true });
}
