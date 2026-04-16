/**
 * Custom Playwright reporter that writes:
 *  1. A human-readable run summary (SUMMARY.md) in the run directory
 *  2. A description.md in each test's artifact folder
 *
 * Output structure:
 *   e2e/test-results/
 *     run-{datetime}-{trigger}/
 *       SUMMARY.md           ← all tests + status at a glance
 *       test-{name}/         ← per-test artifacts (screenshots, traces, etc.)
 *         description.md     ← what the test does + error if failed
 */

import * as fs from "fs";
import * as path from "path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

interface TestRecord {
  title: string;
  file: string;
  status: string;
  duration: number;
  error?: string;
  dir?: string;
  hasFlow: boolean;
}

function slugify(text: string, maxLen = 120): string {
  return text
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, maxLen);
}

function fmtMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * Extract the section of a flow file that matches a test title.
 *
 * Flow files use `## ` headings as section boundaries. Each section
 * describes one test. We match by finding the heading whose text
 * has the most word overlap with the test title.
 */
function extractFlowSection(
  flowContent: string,
  testTitle: string
): string | null {
  // Split into sections by ## headings
  const sections: { heading: string; body: string }[] = [];
  const parts = flowContent.split(/^(?=## )/m);
  for (const part of parts) {
    const match = part.match(/^## (.+)/);
    if (match) {
      sections.push({ heading: match[1].trim(), body: part.trim() });
    }
  }
  if (sections.length === 0) return flowContent; // no sections — return all

  // Score each section by word overlap with the test title
  const titleWords = new Set(
    testTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
  );
  let best: { section: (typeof sections)[0]; score: number } | null = null;
  for (const section of sections) {
    const headingWords = section.heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/);
    const score = headingWords.filter((w) => titleWords.has(w)).length;
    if (!best || score > best.score) {
      best = { section, score };
    }
  }

  return best && best.score > 0 ? best.section.body : null;
}

class RunSummaryReporter implements Reporter {
  private records: TestRecord[] = [];
  private outputDir = "";
  private startTime = Date.now();

  onBegin(config: FullConfig, _suite: Suite) {
    this.outputDir =
      config.projects[0]?.outputDir ?? config.configFile
        ? path.resolve(
            path.dirname(config.configFile!),
            config.projects[0]?.outputDir ?? "e2e/test-results"
          )
        : "";
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const spec = test.titlePath().slice(1); // drop root suite
    const fullTitle = spec.join(" › ");
    const file = test.location.file.replace(/.*e2e\/specs\//, "");

    // Build a short, readable folder name: {spec-path}--{test-name}
    // e.g. "auth-login--redirects-unauthenticated-user-to-login"
    const specSlug = slugify(file.replace(/\.spec\.ts$/, ""));
    const testSlug = slugify(test.title, 60);
    const dirName = `${specSlug}--${testSlug}`;
    const testDir = path.join(this.outputDir, dirName);

    // Check for approved flow
    const flowPath = test.location.file.replace(/\.spec\.ts$/, ".flow.md");
    const hasFlow = fs.existsSync(flowPath);

    const record: TestRecord = {
      title: fullTitle,
      file,
      status: result.status,
      duration: result.duration,
      dir: dirName,
      hasFlow,
    };

    if (result.status === "failed" || result.status === "timedOut") {
      const err = result.errors?.[0];
      record.error = err?.message?.split("\n").slice(0, 5).join("\n") ?? "";
    }

    this.records.push(record);

    // Read the approved flow from the co-located .flow.md file
    let approvedFlow: string | null = null;
    try {
      if (hasFlow) {
        approvedFlow = fs.readFileSync(flowPath, "utf-8");
      }
    } catch {}

    // Write per-test description.md
    try {
      fs.mkdirSync(testDir, { recursive: true });
      const lines = [
        `# ${fullTitle}`,
        "",
        `**File:** \`${file}\``,
        `**Status:** ${result.status}`,
        `**Duration:** ${fmtMs(result.duration)}`,
      ];

      // Include only the matching section of the approved flow
      if (approvedFlow) {
        const section = extractFlowSection(approvedFlow, test.title);
        lines.push("", "## Approved Flow", "", section ?? approvedFlow);
      } else {
        lines.push(
          "",
          "## Approved Flow",
          "",
          `> **WARNING: No approved flow found.** This test is incomplete.`,
          `> Expected: \`e2e/specs/${file.replace(/\.spec\.ts$/, ".flow.md")}\``
        );
      }

      if (record.error) {
        lines.push("", "## Error", "", "```", record.error, "```");
      }
      if (result.attachments.length > 0) {
        lines.push("", "## Artifacts", "");
        for (const att of result.attachments) {
          // Use the attachment name as the filename (e.g. "01-trips-list.png")
          const fileName = att.name.includes(".")
            ? att.name
            : att.path
              ? path.basename(att.path)
              : `${att.name}.bin`;
          const dest = path.join(testDir, fileName);
          try {
            if (att.body) {
              // Buffer attachment (from test.info().attach with body)
              fs.writeFileSync(dest, att.body);
              lines.push(`- \`${fileName}\``);
            } else if (att.path) {
              // File-path attachment (from Playwright auto-capture)
              fs.copyFileSync(att.path, dest);
              lines.push(`- \`${fileName}\``);
            }
          } catch {
            lines.push(
              `- ${att.name} (failed to save${att.path ? ": " + att.path : ""})`
            );
          }
        }
      }
      fs.writeFileSync(path.join(testDir, "description.md"), lines.join("\n"));
    } catch {
      // Non-critical — don't break the run
    }
  }

  onEnd(result: FullResult) {
    if (!this.outputDir) return;

    const totalMs = Date.now() - this.startTime;
    const passed = this.records.filter((r) => r.status === "passed").length;
    const failed = this.records.filter(
      (r) => r.status === "failed" || r.status === "timedOut"
    ).length;
    const skipped = this.records.filter((r) => r.status === "skipped").length;
    const total = this.records.length;

    const lines = [
      `# E2E Run Summary`,
      "",
      `**Date:** ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
      `**Duration:** ${fmtMs(totalMs)}`,
      `**Result:** ${result.status === "passed" ? "PASSED" : "FAILED"}`,
      `**Tests:** ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)`,
      "",
      "---",
      "",
      "| Status | Test | File | Duration |",
      "|--------|------|------|----------|",
    ];

    // Sort: failures first, then passed, then skipped
    const sorted = [...this.records].sort((a, b) => {
      const order: Record<string, number> = {
        failed: 0,
        timedOut: 0,
        passed: 1,
        skipped: 2,
      };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    for (const r of sorted) {
      const icon =
        r.status === "passed"
          ? "PASS"
          : r.status === "skipped"
            ? "SKIP"
            : "FAIL";
      const flowIcon = r.hasFlow ? "" : " **[NO FLOW]**";
      const link = r.dir ? `[${r.title}](./${r.dir}/description.md)` : r.title;
      lines.push(
        `| ${icon} | ${link}${flowIcon} | ${r.file} | ${fmtMs(r.duration)} |`
      );
    }

    // Warn about tests missing approved flows
    const missingFlows = sorted.filter((r) => !r.hasFlow);
    if (missingFlows.length > 0) {
      lines.push(
        "",
        "---",
        "",
        `## Missing Approved Flows (${missingFlows.length})`,
        "",
        "These tests have no `.flow.md` file and are considered **incomplete**:",
        ""
      );
      for (const r of missingFlows) {
        lines.push(
          `- \`${r.file.replace(/\.spec\.ts$/, ".flow.md")}\` — ${r.title}`
        );
      }
    }

    if (failed > 0) {
      lines.push("", "---", "", "## Failed Tests", "");
      for (const r of sorted.filter(
        (r) => r.status === "failed" || r.status === "timedOut"
      )) {
        lines.push(`### ${r.title}`);
        lines.push(`File: \`${r.file}\``);
        if (r.error) {
          lines.push("```", r.error, "```");
        }
        if (r.dir) {
          lines.push(`Details: [${r.dir}/description.md](./${r.dir}/description.md)`);
        }
        lines.push("");
      }
    }

    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.outputDir, "SUMMARY.md"),
        lines.join("\n")
      );

      // Clean up empty Playwright artifact folders (auto-created per test
      // even when no failure artifacts exist). Keep only our test-* folders.
      for (const entry of fs.readdirSync(this.outputDir)) {
        if (entry === "SUMMARY.md" || entry.startsWith(".")) continue;
        const full = path.join(this.outputDir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory() && fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full);
          }
        } catch {}
      }
    } catch {
      // Non-critical
    }
  }
}

export default RunSummaryReporter;
