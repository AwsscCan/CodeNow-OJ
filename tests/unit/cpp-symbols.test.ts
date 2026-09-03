import { describe, expect, it } from "vitest";
import { collectCppSymbols } from "../../app/lib/cpp-symbols";

describe("C++ current-document symbols", () => {
  it("collects declared variables, functions, parameters and type names", () => {
    const symbols = collectCppSymbols(`
struct Node { int value; };
using Weight = long long;
typedef vector<int> Values;
int add(int left, const int right) {
  Weight total = left + right;
  auto answer = total;
  return answer;
}`);
    expect(symbols.types).toEqual(expect.arrayContaining(["Node", "Weight", "Values"]));
    expect(symbols.functions).toContain("add");
    expect(symbols.variables).toEqual(expect.arrayContaining(["value", "left", "right", "total", "answer"]));
  });

  it("ignores fake declarations in comments and literals", () => {
    const symbols = collectCppSymbols(`
// int fakeVariable;
const char* text = "struct FakeType { int nope; }";
/* void fakeFunction(int hidden); */
int realValue = 1;
`);
    expect(symbols.variables).toEqual(expect.arrayContaining(["text", "realValue"]));
    expect(symbols.variables).not.toEqual(expect.arrayContaining(["fakeVariable", "nope", "hidden"]));
    expect(symbols.types).not.toContain("FakeType");
    expect(symbols.functions).not.toContain("fakeFunction");
  });

  it("deduplicates declarations and does not return C++ keywords", () => {
    const symbols = collectCppSymbols("int count = 0;\nfor (int count = 0; count < 3; ++count) {}\nint main() {}");
    expect(symbols.variables.filter((item) => item === "count")).toHaveLength(1);
    expect(symbols.variables).not.toContain("int");
    expect(symbols.functions).toContain("main");
  });
});
