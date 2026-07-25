import { describe, expect, it } from "vitest";
import { DELETE, GET, PATCH, POST } from "../../app/api/submissions/route";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("submissions API", () => {
  it("creates, lists, renames, and deletes submission records without drizzle insert chains", async () => {
    const id = `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const problemId = `P${Math.floor(Math.random() * 1_000_000)}`;
    const newProblemId = `${problemId}X`;

    const createResponse = await POST(jsonRequest("http://localhost/api/submissions", "POST", {
      id,
      problemId,
      problemTitle: "A+B",
      status: "AC",
      passed: "1/1",
      sourceCode: "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}",
      submittedAt: new Date().toISOString(),
    }));
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { record?: { id?: string; problemId?: string } };
    expect(created.record?.id).toBe(id);
    expect(created.record?.problemId).toBe(problemId);

    const listResponse = await GET(jsonRequest(`http://localhost/api/submissions?problemId=${problemId}`, "GET"));
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json() as { history?: Array<{ id: string }> };
    expect(listed.history?.some((item) => item.id === id)).toBe(true);

    const renameResponse = await PATCH(jsonRequest("http://localhost/api/submissions", "PATCH", {
      oldProblemId: problemId,
      newProblemId,
      problemTitle: "A+B renamed",
    }));
    expect(renameResponse.status).toBe(200);

    const renamedResponse = await GET(jsonRequest(`http://localhost/api/submissions?problemId=${newProblemId}`, "GET"));
    const renamed = await renamedResponse.json() as { history?: Array<{ id: string; problemId: string }> };
    expect(renamed.history?.some((item) => item.id === id && item.problemId === newProblemId)).toBe(true);

    const deleteResponse = await DELETE(jsonRequest(`http://localhost/api/submissions?id=${id}`, "DELETE"));
    expect(deleteResponse.status).toBe(200);

    const afterDeleteResponse = await GET(jsonRequest(`http://localhost/api/submissions?problemId=${newProblemId}`, "GET"));
    const afterDelete = await afterDeleteResponse.json() as { history?: Array<{ id: string }> };
    expect(afterDelete.history?.some((item) => item.id === id)).toBe(false);
  });
});
