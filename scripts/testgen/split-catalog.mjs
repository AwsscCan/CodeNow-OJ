/* CodeNow OJ - safe catalog splitting - Bamzc */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const pub = resolve(import.meta.dirname, "../../public");
const sources = ["acwing-course.json", "classic-problems.json", "contest-problems.json"];
const problemsDir = resolve(pub, "problems");
const indexPath = resolve(pub, "catalog-index.json");
const safeProblemId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function fail(message) {
  throw new Error(`split-catalog: ${message}`);
}

function toIndexEntry(problem) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    time: problem.time,
    memory: problem.memory,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    folder: problem.folder,
    sourceUrl: problem.sourceUrl,
    extractionStatus: problem.extractionStatus,
    sampleCount: Array.isArray(problem.samples) ? problem.samples.length : 0,
  };
}

function validateProblem(problem, source, seenIds) {
  if (!problem || typeof problem !== "object" || Array.isArray(problem)) {
    fail(`${source} contains a non-object problem`);
  }

  if (
    typeof problem.id !== "string"
    || !safeProblemId.test(problem.id)
    || problem.id.endsWith(".")
    || windowsReservedName.test(problem.id)
  ) {
    fail(`${source} contains an unsafe problem id`);
  }

  if (seenIds.has(problem.id.toLowerCase())) {
    fail(`${source} duplicates problem id ${problem.id}`);
  }

  seenIds.add(problem.id.toLowerCase());
}

function loadProblems() {
  const problems = [];
  const seenIds = new Set();

  for (const source of sources) {
    const path = resolve(pub, source);
    if (!existsSync(path)) {
      fail(`missing required source ${source}`);
    }

    const catalog = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(catalog)) {
      fail(`${source} must contain an array`);
    }

    for (const problem of catalog) {
      validateProblem(problem, source, seenIds);
      problems.push(problem);
    }
  }

  if (problems.length === 0) {
    fail("catalog sources produced no problems");
  }

  return problems;
}

function verifyStaging(stageProblemsDir, stageIndexPath, problems, index) {
  const expectedFiles = problems.map((problem) => `${problem.id}.json`).sort();
  const actualFiles = readdirSync(stageProblemsDir).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail("staged problem files do not match the source catalog");
  }

  for (const problem of problems) {
    const path = resolve(stageProblemsDir, `${problem.id}.json`);
    const expected = JSON.stringify(problem);
    const persisted = readFileSync(path, "utf8");
    if (persisted !== expected || JSON.parse(persisted).id !== problem.id) {
      fail(`staged problem ${problem.id} did not verify`);
    }
  }

  const expectedIndex = `${JSON.stringify(index)}\n`;
  const persistedIndex = readFileSync(stageIndexPath, "utf8");
  const parsedIndex = JSON.parse(persistedIndex);
  if (persistedIndex !== expectedIndex || !Array.isArray(parsedIndex) || JSON.stringify(parsedIndex) !== JSON.stringify(index)) {
    fail("staged catalog index did not verify");
  }
}

function removeTemporary(path) {
  if (!path || !existsSync(path)) {
    return;
  }

  rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

function buildStaging(problems) {
  const stageRoot = mkdtempSync(resolve(pub, ".split-catalog-stage-"));
  const stageProblemsDir = resolve(stageRoot, "problems");
  const stageIndexPath = resolve(stageRoot, "catalog-index.json");
  const index = problems.map(toIndexEntry);

  try {
    mkdirSync(stageProblemsDir);
    for (const problem of problems) {
      writeFileSync(resolve(stageProblemsDir, `${problem.id}.json`), JSON.stringify(problem), "utf8");
    }
    writeFileSync(stageIndexPath, `${JSON.stringify(index)}\n`, "utf8");
    verifyStaging(stageProblemsDir, stageIndexPath, problems, index);

    return { stageRoot, stageProblemsDir, stageIndexPath, index };
  } catch (error) {
    try {
      removeTemporary(stageRoot);
    } catch (cleanupError) {
      console.warn(`Could not remove failed staging directory ${stageRoot}: ${cleanupError.message}`);
    }
    throw error;
  }
}

function temporaryPath(label) {
  return resolve(pub, `.split-catalog-${label}-${randomUUID()}`);
}

function moveExistingToBackup(path, label) {
  if (!existsSync(path)) {
    return null;
  }

  const backupPath = temporaryPath(`backup-${label}`);
  renameSync(path, backupPath);
  return backupPath;
}

function restorePublishedArtifact(path, backupPath, wasPublished, discarded) {
  if (wasPublished && existsSync(path)) {
    const discardedPath = temporaryPath("discarded");
    renameSync(path, discardedPath);
    discarded.push(discardedPath);
  }

  if (backupPath && existsSync(backupPath)) {
    renameSync(backupPath, path);
  }
}

function publishStaging(staging) {
  let problemsBackup = null;
  let indexBackup = null;
  let problemsPublished = false;
  let indexPublished = false;
  const discarded = [];

  try {
    problemsBackup = moveExistingToBackup(problemsDir, "problems");
    renameSync(staging.stageProblemsDir, problemsDir);
    problemsPublished = true;

    indexBackup = moveExistingToBackup(indexPath, "catalog-index");
    renameSync(staging.stageIndexPath, indexPath);
    indexPublished = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const artifact of [
      [indexPath, indexBackup, indexPublished],
      [problemsDir, problemsBackup, problemsPublished],
    ]) {
      try {
        restorePublishedArtifact(...artifact, discarded);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    for (const path of discarded) {
      try {
        removeTemporary(path);
      } catch (cleanupError) {
        rollbackErrors.push(cleanupError);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "split-catalog publication and rollback failed");
    }

    throw error;
  }

  for (const backupPath of [problemsBackup, indexBackup]) {
    try {
      removeTemporary(backupPath);
    } catch (error) {
      console.warn(`Published catalog but could not remove ${backupPath}: ${error.message}`);
    }
  }
}

function run() {
  const problems = loadProblems();
  const staging = buildStaging(problems);

  try {
    publishStaging(staging);
  } finally {
    try {
      removeTemporary(staging.stageRoot);
    } catch (error) {
      console.warn(`Published catalog but could not remove staging directory ${staging.stageRoot}: ${error.message}`);
    }
  }

  const indexKb = Math.round(readFileSync(indexPath).byteLength / 1024);
  console.log(`Catalog ${staging.index.length} problems -> catalog-index.json (${indexKb}KB) and public/problems/`);
}

run();
