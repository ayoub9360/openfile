import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"
// Registry audits are version-based and cannot see our local braces patch.
// Only this exact development-only advisory is accepted, after its regression
// suite passes. Any new advisory, production path, or audit error fails CI.
const test = spawnSync(
  process.execPath,
  ["--test", "scripts/security.test.mjs"],
  { stdio: "inherit" }
)
if (test.status !== 0) process.exit(1)
const audit = spawnSync("pnpm", ["audit", "--json"], { encoding: "utf8" })
if (audit.error || ![0, 1].includes(audit.status))
  throw new Error("Dependency audit could not run")
let result
try {
  result = JSON.parse(audit.stdout)
} catch {
  throw new Error("Invalid registry audit response")
}
assert.ok(
  result.metadata && result.advisories && !result.error,
  "Incomplete registry audit"
)
const unexpected = Object.values(result.advisories).filter(
  (advisory) =>
    !(
      advisory.github_advisory_id === "GHSA-vfj7-8cjw-p6xm" &&
      advisory.module_name === "braces" &&
      advisory.findings?.length &&
      advisory.findings.every(
        (finding) => finding.version === "3.0.3" && finding.dev === true
      )
    )
)
for (const advisory of unexpected)
  console.error(
    `${advisory.module_name}: ${advisory.github_advisory_id ?? advisory.id} (${advisory.severity})`
  )
if (unexpected.length) process.exit(1)
console.log(
  "No unmitigated registry advisories. The development-only braces advisory is covered by the tested local depth-limit patch."
)
