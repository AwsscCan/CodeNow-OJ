export type SubmissionRecord = {
  id: string;
  problemId: string;
  problemTitle: string;
  status: string;
  passed: string;
  sourceCode: string;
  submittedAt: string;
};

const rows: SubmissionRecord[] = [];

function clone(record: SubmissionRecord): SubmissionRecord {
  return { ...record };
}

function sortNewestFirst(records: SubmissionRecord[]) {
  return [...records].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function listSubmissions(problemId: string): Promise<SubmissionRecord[]> {
  return sortNewestFirst(rows.filter((row) => row.problemId === problemId)).map(clone);
}

export async function createSubmission(record: SubmissionRecord): Promise<SubmissionRecord> {
  const existingIndex = rows.findIndex((row) => row.id === record.id);
  if (existingIndex >= 0) rows.splice(existingIndex, 1);
  rows.push(clone(record));
  return clone(record);
}

export async function deleteSubmission(id: string): Promise<void> {
  const index = rows.findIndex((row) => row.id === id);
  if (index >= 0) rows.splice(index, 1);
}

export async function deleteSubmissionsByProblemIds(problemIds: string[]): Promise<void> {
  const ids = new Set(problemIds);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (ids.has(rows[index].problemId)) rows.splice(index, 1);
  }
}

export async function renameSubmissionProblem(oldProblemId: string, newProblemId: string, problemTitle: string): Promise<void> {
  for (const row of rows) {
    if (row.problemId === oldProblemId) {
      row.problemId = newProblemId;
      row.problemTitle = problemTitle;
    }
  }
}
