import { afterEach, describe, expect, it, vi } from "vitest";
import { judge0Submit, staticCheck } from "../../app/api/_lib/reference-solution";

afterEach(() => vi.unstubAllGlobals());

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

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
