import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const repositoryRoot = process.cwd();
const testsDirectory = path.join(repositoryRoot, "tests");
const testFiles = (await collectTestFiles(testsDirectory)).sort();

if (testFiles.length === 0) {
  console.error("No TypeScript test files were found under the tests directory.");
  process.exit(1);
}

console.log(`Running ${testFiles.length} TypeScript test files...`);

const tsxCli = path.join(
  repositoryRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

const result = spawnSync(
  process.execPath,
  [tsxCli, "--test", ...testFiles],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
