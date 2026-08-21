import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sourceScript = resolve(repositoryRoot, "scripts/testgen/split-catalog.mjs");

function makeProblem(id, title = id) {
  return {
    id,
    title,
    difficulty: "easy",
    time: "1s",
    memory: "128MB",
    description: `${title} description`,
    inputFormat: "input",
    outputFormat: "output",
    samples: [{ input: "1\n", output: "1\n" }],
    folder: "fixture",
    sourceUrl: `https://example.test/${id}`,
    extractionStatus: "verified",
  };
}

function createFixture({ acwing = [], classic = [], contest = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "codenow-split-catalog-"));
  const scriptPath = join(root, "scripts", "testgen", "split-catalog.mjs");
  const publicDir = join(root, "public");
  const problemsDir = join(publicDir, "problems");

  mkdirSync(dirname(scriptPath), { recursive: true });
  mkdirSync(problemsDir, { recursive: true });
  copyFileSync(sourceScript, scriptPath);

  writeFileSync(join(publicDir, "acwing-course.json"), JSON.stringify(acwing));
  writeFileSync(join(publicDir, "classic-problems.json"), JSON.stringify(classic));
  writeFileSync(join(publicDir, "contest-problems.json"), JSON.stringify(contest));
  writeFileSync(join(problemsDir, "legacy.json"), JSON.stringify({ id: "legacy" }));
  writeFileSync(join(publicDir, "catalog-index.json"), "[{\"id\":\"legacy\"}]\n");

  return { root, scriptPath, publicDir, problemsDir };
}

function runSplitCatalog(fixture) {
  return spawnSync(process.execPath, [fixture.scriptPath], {
    cwd: fixture.root,
    encoding: "utf8",
  });
}

function publishedSnapshot(fixture) {
  const files = readdirSync(fixture.problemsDir).sort();
  return {
    files: files.map((file) => [file, readFileSync(join(fixture.problemsDir, file), "utf8")]),
    index: readFileSync(join(fixture.publicDir, "catalog-index.json"), "utf8"),
    temporaryEntries: readdirSync(fixture.publicDir).filter((name) => name.startsWith(".split-catalog-")).sort(),
  };
}

function removeFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

test("a malformed later source preserves published artifacts", (t) => {
  const fixture = createFixture({ acwing: [makeProblem("NEW001")] });
  t.after(() => removeFixture(fixture));

  writeFileSync(join(fixture.publicDir, "classic-problems.json"), "{not valid json");
  const before = publishedSnapshot(fixture);
  const result = runSplitCatalog(fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.deepEqual(publishedSnapshot(fixture), before);
});

test("an invalid output path preserves published artifacts", (t) => {
  const fixture = createFixture({
    acwing: [makeProblem("NEW001"), makeProblem("nested/problem")],
  });
  t.after(() => removeFixture(fixture));

  const before = publishedSnapshot(fixture);
  const result = runSplitCatalog(fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.deepEqual(publishedSnapshot(fixture), before);
});

test("Windows case-insensitive id collisions fail before publication", (t) => {
  const fixture = createFixture({
    acwing: [makeProblem("NEW001"), makeProblem("new001")],
  });
  t.after(() => removeFixture(fixture));

  const before = publishedSnapshot(fixture);
  const result = runSplitCatalog(fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.deepEqual(publishedSnapshot(fixture), before);
});

test("only replaces published artifacts after complete validation", (t) => {
  const expectedProblems = [makeProblem("NEW001"), makeProblem("NEW002"), makeProblem("NEW003")];
  const fixture = createFixture({
    acwing: [expectedProblems[0]],
    classic: [expectedProblems[1]],
    contest: [expectedProblems[2]],
  });
  t.after(() => removeFixture(fixture));

  const result = runSplitCatalog(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(fixture.problemsDir).sort(), ["NEW001.json", "NEW002.json", "NEW003.json"]);
  assert.equal(existsSync(join(fixture.problemsDir, "legacy.json")), false);
  for (const problem of expectedProblems) {
    const persisted = JSON.parse(readFileSync(join(fixture.problemsDir, `${problem.id}.json`), "utf8"));
    assert.deepEqual(persisted, problem);
  }

  const index = JSON.parse(readFileSync(join(fixture.publicDir, "catalog-index.json"), "utf8"));
  assert.deepEqual(index.map((item) => item.id), ["NEW001", "NEW002", "NEW003"]);
  assert.equal(index.every((item) => !("samples" in item)), true);
  assert.deepEqual(
    readdirSync(fixture.publicDir).filter((name) => name.startsWith(".split-catalog-")).sort(),
    [],
  );
});
