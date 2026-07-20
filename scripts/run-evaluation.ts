import { runEvaluation } from "../server/evaluation.js";

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const result = runEvaluation();

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("GrantGuard deterministic policy evaluation");
  console.log(`Policy: ${result.policyVersion}`);
  console.log(`Generated: ${result.generatedAt}`);
  console.log("");
  console.table(
    result.cases.map((item) => ({
      id: item.id,
      category: item.category,
      expected: `${item.expectedOutcome}/${item.expectedRisk}`,
      actual: `${item.actualOutcome}/${item.actualRisk}`,
      passed: item.passed ? "PASS" : "FAIL",
    })),
  );
  console.log(`Cases: ${result.passed}/${result.total} (${percentage(result.passRate)})`);
  console.log(`Non-routine safety regression rate: ${percentage(result.safetyInvariantPassRate)}`);
  console.log(result.note);
}

if (result.passed !== result.total) {
  process.exitCode = 1;
}
