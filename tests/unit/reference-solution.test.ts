import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateReferenceCandidate,
  getCachedReference,
  invalidateCache,
  judge0Submit,
  setCachedReference,
  staticCheck,
  type ValidatedReference,
  validateReference,
} from "../../app/api/_lib/reference-solution";

afterEach(() => vi.unstubAllGlobals());

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
const decode = (value: string) => Buffer.from(value, "base64").toString("utf8");

function cachedReference(overrides: Partial<ValidatedReference> = {}): ValidatedReference {
  return {
    solutionCode: "int main(){return 0;}",
    bruteCode: "int main(){return 1;}",
    algorithmSummary: "constant",
    expectedTimeComplexity: "O(1)",
    expectedSpaceComplexity: "O(1)",
    bruteMaxScale: 1,
    report: {
      status: "validated",
      compiled: true,
      samplesPassed: true,
      differentialTestsPassed: 4,
      differentialTestsFailed: 0,
      errors: [],
      validatedAt: "2026-07-27T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("judge0Submit ground-truth fidelity", () => {
  it("preserves leading whitespace in reference stdout", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (/\/submissions\?/.test(u)) {
        return new Response(JSON.stringify({ token: "tok1" }), { status: 201 });
      }
      // poll
      return new Response(JSON.stringify({ stdout: b64(" 3.14\n\n"), status: { id: 3, description: "Accepted" } }), { status: 200 });
    }));

    const result = await judge0Submit("int main(){}", "", 54);
    expect(result.stdout).toBe(" 3.14\n\n");
    expect(result.accepted).toBe(true);
  });
});

describe("staticCheck security gate", () => {
  it("blocks C++ file streams (ifstream/ofstream/fstream)", () => {
    expect(staticCheck('#include <fstream>\nint main(){ std::ifstream f("/etc/passwd"); }')).not.toBeNull();
    expect(staticCheck('#include <fstream>\nint main(){ std::ofstream o("out.txt"); }')).not.toBeNull();
    expect(staticCheck('int main(){ fstream f; }')).not.toBeNull();
    expect(staticCheck('#include <filesystem>\nint main(){ std::filesystem::remove_all("../records"); }')).not.toBeNull();
  });

  it("still allows ordinary competitive solutions", () => {
    expect(staticCheck('#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int n; cin>>n; cout<<n; }')).toBeNull();
    expect(staticCheck('#include <iostream>\n#include <vector>\nint main(){ std::vector<int> v; }')).toBeNull();
  });
});

describe("reference candidate mutant pool", () => {
  it("uses Claude Messages wire format when configured", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(JSON.stringify({ content: [{ type: "text", text: content }] }), { status: 200 });
    }));

    const candidate = await generateReferenceCandidate("claude-key", "https://relay.example/v1", "deepseek-v4", "P", [], undefined, "anthropic");
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(requestUrl).toBe("https://relay.example/v1/messages");
    expect(requestInit?.headers).toMatchObject({ "x-api-key": "claude-key", "anthropic-version": "2023-06-01" });
    expect(body).toMatchObject({ model: "deepseek-v4", max_tokens: 7000 });
    expect(body.messages).toEqual([
      { role: "user", content: "Return the JSON object now." },
    ]);
    expect(candidate.solutionCode).toContain("main");
  });

  it("aborts an in-flight reference candidate request when its caller disconnects", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("client disconnected", "AbortError");
    let notifyFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      notifyFetchStarted = resolve;
    });
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
    });
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
      }, 30);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason || abortError);
      };
      notifyFetchStarted();
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const generation = generateReferenceCandidate("key", "https://api.deepseek.com", "model", "P", [], controller.signal);
    await fetchStarted;
    controller.abort(abortError);

    await expect(generation).rejects.toMatchObject({ name: "AbortError", message: "client disconnected" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps at most eight unique non-empty mutant sources", async () => {
    const mutants = [
      { id: "m1", sourceCode: "int main(){return 1;}" },
      { id: "m1", sourceCode: "duplicate id" },
      { id: "duplicate-source", sourceCode: "int main(){return 1;}" },
      { id: "blank", sourceCode: "   " },
      ...Array.from({ length: 10 }, (_, index) => ({ id: `m${index + 2}`, sourceCode: `int main(){return ${index + 2};}` })),
    ];
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      expectedTimeComplexity: "O(1)",
      expectedSpaceComplexity: "O(1)",
      bruteMaxScale: 10,
      algorithmSummary: "constant",
      assumptions: [],
      validationInputs: ["1", "2", "3", "4"],
      mutants,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 })));

    const candidate = await generateReferenceCandidate(
      "test-key",
      "https://api.deepseek.com",
      "deepseek-chat",
      "constant problem",
      [],
    );

    expect(candidate.mutants).toHaveLength(8);
    expect(candidate.mutants?.map((item) => item.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
  });

  it("parses a bounded deterministic generator artifact", async () => {
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
      generator: { sourceCode: "int main(){return 0;}", seeds: [7, 7, 11, "bad", 13, 17, 19, 23, 29, 31] },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));

    const candidate = await generateReferenceCandidate("key", "https://api.deepseek.com", "model", "P", []);

    expect(candidate.generator).toMatchObject({ sourceCode: "int main(){return 0;}", seeds: [7, 11, 13, 17, 19, 23, 29, 31] });
  });

  it("drops filesystem-capable generator artifacts at the parsing boundary", async () => {
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
      generator: {
        sourceCode: "#include <filesystem>\nint main(){std::filesystem::remove_all(\"../records\");}",
        seeds: [1],
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));

    const candidate = await generateReferenceCandidate("key", "https://api.deepseek.com", "model", "P", []);

    expect(candidate.generator).toBeUndefined();
  });

  it("requires generator source code to be a string", async () => {
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
      generator: { sourceCode: { language: "cpp" }, seeds: [1] },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));

    const candidate = await generateReferenceCandidate("key", "https://api.deepseek.com", "model", "P", []);

    expect(candidate.generator).toBeUndefined();
  });

  it("retains only integer generator seeds from the model artifact", async () => {
    const content = JSON.stringify({
      solutionCode: "int main(){return 0;}",
      bruteCode: "int main(){volatile int x=0;return x;}",
      validationInputs: ["1", "2", "3", "4"],
      generator: { sourceCode: "int main(){return 0;}", seeds: [1, "2", 3.5, 4] },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));

    const candidate = await generateReferenceCandidate("key", "https://api.deepseek.com", "model", "P", []);

    expect(candidate.generator?.seeds).toEqual([1, 4]);
  });
});

describe("reference cache provenance", () => {
  it("does not return a reference for a different digest with the same legacy hash", () => {
    const firstDigest = "Aa";
    const collidingDigest = "BB";
    try {
      setCachedReference(firstDigest, cachedReference());
      expect(getCachedReference(collidingDigest)).toBeNull();
    } finally {
      invalidateCache(firstDigest);
      invalidateCache(collidingDigest);
    }
  });

  it("does not let an older validation artifact overwrite a newer cache entry", () => {
    const digest = "cache-order";
    try {
      setCachedReference(digest, cachedReference({
        solutionCode: "int main(){return 2;}",
        report: { ...cachedReference().report, validatedAt: "2026-07-27T01:00:00.000Z" },
      }));
      setCachedReference(digest, cachedReference({
        solutionCode: "int main(){return 3;}",
        report: { ...cachedReference().report, validatedAt: "2026-07-27T00:00:00.000Z" },
      }));
      setCachedReference(digest, cachedReference({
        solutionCode: "int main(){return 4;}",
        report: { ...cachedReference().report, validatedAt: "2026-07-27T01:00:00.000Z" },
      }));

      expect(getCachedReference(digest)?.solutionCode).toBe("int main(){return 2;}");
    } finally {
      invalidateCache(digest);
    }
  });

  it("isolates cached generator metadata from caller mutation", () => {
    const digest = "cache-clone";
    const reference = cachedReference({ generator: { sourceCode: "int main(){return 0;}", seeds: [1, 2] } });
    try {
      setCachedReference(digest, reference);
      reference.generator?.seeds.push(3);

      const firstRead = getCachedReference(digest);
      expect(firstRead?.generator?.seeds).toEqual([1, 2]);
      firstRead?.generator?.seeds.push(4);
      expect(getCachedReference(digest)?.generator?.seeds).toEqual([1, 2]);
    } finally {
      invalidateCache(digest);
    }
  });
});

describe("validateReference compile probe", () => {
  it("stops waiting for in-flight Judge0 work when validation is cancelled", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("client disconnected", "AbortError");
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).includes("/languages")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 }));
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    const candidate = {
      solutionCode: "int main(){return 0;}", bruteCode: "int main(){return 1;}",
      expectedTimeComplexity: "O(1)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 1,
      algorithmSummary: "constant", assumptions: [], validationInputs: ["1", "2", "3", "4"],
    };
    const validation = validateReference(candidate, [], 0, controller.signal);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    controller.abort(abortError);
    const outcome = await Promise.race([
      validation.then(
        () => ({ kind: "resolved" as const }),
        (error) => ({ kind: "error" as const, error }),
      ),
      new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 40)),
    ]);

    expect(outcome).toMatchObject({ kind: "error", error: { name: "AbortError", message: "client disconnected" } });
  });

  it("does not reject a compiling reference that crashes on empty stdin", async () => {
    // Router: /languages -> a compiler id; create -> token encodes the stdin
    // decision; poll -> RE (no compile error) for empty stdin, correct output
    // otherwise. This models an input-reading program that segfaults on "".
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/languages")) {
        return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
      }
      if (/\/submissions\?/.test(u)) {
        const body = JSON.parse(String(init?.body)) as { stdin: string };
        const stdin = decode(body.stdin).trim();
        return new Response(JSON.stringify({ token: stdin === "" ? "empty" : "ok" }), { status: 201 });
      }
      // poll
      if (u.includes("/submissions/empty")) {
        // Runtime error on empty input — NOT a compile error.
        return new Response(JSON.stringify({ stdout: "", stderr: b64("segfault"), compile_output: "", status: { id: 11, description: "Runtime Error (SIGSEGV)" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ stdout: b64("6\n"), stderr: "", compile_output: "", status: { id: 3, description: "Accepted" } }), { status: 200 });
    }));

    const candidate = {
      solutionCode: "#include <iostream>\nint main(){int n;std::cin>>n;long long s=0,x;for(int i=0;i<n;i++){std::cin>>x;s+=x;}std::cout<<s<<\"\\n\";}",
      bruteCode: "#include <iostream>\n#include <vector>\nint main(){int n;std::cin>>n;std::vector<long long>v(n);long long s=0;for(auto&x:v){std::cin>>x;s+=x;}std::cout<<s<<\"\\n\";}",
      expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      algorithmSummary: "sum", assumptions: [], validationInputs: [],
    };

    const { report, validated } = await validateReference(candidate, [{ input: "3\n1 2 3", output: "6" }], 0);

    expect(report.status).toBe("validated");
    expect(validated).toBeTruthy();
  });

  it("runs differential validation rounds concurrently, not one input at a time", async () => {
    let pollInFlight = 0;
    let maxPollInFlight = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/languages")) return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 9.2.0)" }]), { status: 200 });
      if (/\/submissions\?/.test(u)) return new Response(JSON.stringify({ token: "t" }), { status: 201 });
      // poll — same accepted output for solution and brute so they always agree
      pollInFlight += 1;
      maxPollInFlight = Math.max(maxPollInFlight, pollInFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      pollInFlight -= 1;
      return new Response(JSON.stringify({ stdout: b64("6\n"), stderr: "", compile_output: "", status: { id: 3, description: "Accepted" } }), { status: 200 });
    }));

    const candidate = {
      solutionCode: "int main(){/*sol*/}", bruteCode: "int main(){/*brute*/}",
      expectedTimeComplexity: "O(n)", expectedSpaceComplexity: "O(1)", bruteMaxScale: 10,
      algorithmSummary: "sum", assumptions: [],
      validationInputs: ["1\n1", "2\n1 2", "3\n1 2 3", "4\n1 2 3 4", "5\n1 2 3 4 5", "6\n1 2 3 4 5 6"],
    };

    const { report } = await validateReference(candidate, [{ input: "3\n1 2 3", output: "6" }], 6);

    expect(report.status).toBe("validated");
    // Sequential rounds cap concurrent polls at 2 (one input's solution+brute);
    // concurrent rounds lift it above 2.
    expect(maxPollInFlight).toBeGreaterThan(2);
  });
});
