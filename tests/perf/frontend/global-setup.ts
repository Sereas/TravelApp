import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const python = path.join(repoRoot, ".venv", "bin", "python");
  const script = path.join(repoRoot, "tests", "perf", "prepare_ui_perf_context.py");
  const output = execFileSync(python, [script], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  const parsed = JSON.parse(output);
  const targetPath = path.join(
    repoRoot,
    "tests",
    "perf",
    "artifacts",
    "machine",
    "ui_perf_context_latest.json"
  );
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2) + "\n");
}
