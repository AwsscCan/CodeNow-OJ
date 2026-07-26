import { afterEach, describe, expect, it, vi } from "vitest";
import { judge0Submit, staticCheck, validateReference } from "../../app/api/_lib/reference-solution";

afterEach(() => vi.unstubAllGlobals());

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
const decode = (value: string) => Buffer.from(value, "base64").toString("utf8");

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
  });

  it("still allows ordinary competitive solutions", () => {
    expect(staticCheck('#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int n; cin>>n; cout<<n; }')).toBeNull();
    expect(staticCheck('#include <iostream>\n#include <vector>\nint main(){ std::vector<int> v; }')).toBeNull();
  });
});

describe("validateReference compile probe", () => {
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
