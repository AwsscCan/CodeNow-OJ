import { describe, it, expect } from "vitest";
import { formatCppCode } from "../../app/lib/format-cpp";

describe("formatCppCode - 缩进与运算符（既有行为，不得回退）", () => {
  it("对空输入原样返回", () => {
    expect(formatCppCode("")).toBe("");
    expect(formatCppCode("   ")).toBe("   ");
  });

  it("为赋值运算符补齐空格", () => {
    expect(formatCppCode("int x=5;")).toBe("int x = 5;");
  });

  it("保留比较运算符不被拆坏", () => {
    expect(formatCppCode("if (a==b) {")).toBe("if (a == b) {");
    expect(formatCppCode("if (a<=b) {")).toBe("if (a <= b) {");
  });

  it("作用域与箭头运算符保持紧凑", () => {
    expect(formatCppCode("std :: cout;")).toBe("std::cout;");
    expect(formatCppCode("p -> next;")).toBe("p->next;");
  });

  it("按大括号进行四空格缩进", () => {
    const input = "int main() {\nint x = 1;\n{\nx = 2;\n}\n}";
    const output = "int main() {\n    int x = 1;\n    {\n        x = 2;\n    }\n}";
    expect(formatCppCode(input)).toBe(output);
  });

  it("预处理指令顶格不缩进", () => {
    expect(formatCppCode("    #include <bits/stdc++.h>")).toBe("#include <bits/stdc++.h>");
  });
});

describe("formatCppCode - 字面量与注释保护（当前存在缺陷，必须修复）", () => {
  it("不得改动双引号字符串内部的运算符", () => {
    expect(formatCppCode('cout << "1+1";')).toBe('cout << "1+1";');
  });

  it("不得改动字符串里的等号", () => {
    expect(formatCppCode('cout << "a=b";')).toBe('cout << "a=b";');
  });

  it("不得改动字符字面量里的运算符", () => {
    expect(formatCppCode("char c = '=';")).toBe("char c = '=';");
  });

  it("不得改动行注释里的运算符", () => {
    expect(formatCppCode("int x = 5; // a+b=c")).toBe("int x = 5; // a+b=c");
  });

  it("字符串外照常格式化，字符串内保持原样", () => {
    expect(formatCppCode('int n=3;cout<<"x=y";')).toBe('int n = 3;cout << "x=y";');
  });
});
