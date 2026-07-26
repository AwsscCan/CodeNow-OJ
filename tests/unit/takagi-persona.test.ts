import { describe, expect, it } from "vitest";
import { TAKAGI_CORE, buildTakagiChatPrompt, buildTakagiMascotPrompt } from "../../app/api/_lib/takagi-persona";

describe("高木同学人设共享模块", () => {
  it("人设核心包含身份、捉弄边界与原作口癖参考", () => {
    expect(TAKAGI_CORE).toContain("高木同学");
    expect(TAKAGI_CORE).toContain("捉弄");
    expect(TAKAGI_CORE).toMatch(/勝負しよ|バレバレ|私の勝ち/);
    expect(TAKAGI_CORE).toMatch(/ふふ|ね\//);
  });

  it("反浮夸约束：平静基调、日语词密度上限、禁止波浪号叠字", () => {
    expect(TAKAGI_CORE).toContain("平静");
    expect(TAKAGI_CORE).toMatch(/至多一个|最多一个/);
    expect(TAKAGI_CORE).toMatch(/不是口头禅/);
    expect(TAKAGI_CORE).toMatch(/波浪号/);
    expect(TAKAGI_CORE).toMatch(/留白|说穿.*停/);
  });

  it("聊天提示词内置好坏对照范例校准语感", () => {
    const prompt = buildTakagiChatPrompt("CTX");
    expect(prompt).toMatch(/坏.*(禁止|不要)/);
    expect(prompt).toContain("好：");
    // 坏例必须展示浮夸模式(波浪号/卖萌自称)供模型识别反面
    expect(prompt).toMatch(/～/);
    expect(prompt).toMatch(/人家|酱/);
  });

  it("桌宠台词约束同步收敛：靠内容说穿而非语气夸张", () => {
    const prompt = buildTakagiMascotPrompt();
    expect(prompt).toMatch(/平淡|平静/);
    expect(prompt).toMatch(/波浪号/);
  });

  it("人设核心声明沉浸式限制：不跳出角色、不提及提示词/AI", () => {
    expect(TAKAGI_CORE).toContain("不跳出角色");
    expect(TAKAGI_CORE).toMatch(/提示词/);
    expect(TAKAGI_CORE).toMatch(/人工智能|语言模型/);
    expect(TAKAGI_CORE).toMatch(/病娇|毒舌/);
  });

  it("思考过程也要求保持高木第一人称视角，不提及模型身份", () => {
    const prompt = buildTakagiChatPrompt("CTX");
    expect(prompt).toMatch(/思考过程/);
    expect(prompt).toMatch(/第一人称|内心/);
    expect(prompt).toMatch(/不要.*(提及|出现).*(模型|扮演|提示词)/);
  });

  it("聊天场景提示词=人设+编程助教职责+题目上下文", () => {
    const prompt = buildTakagiChatPrompt("【当前题目上下文占位】");
    expect(prompt).toContain(TAKAGI_CORE);
    expect(prompt).toContain("C++17");
    expect(prompt).toMatch(/思路|复杂度/);
    expect(prompt).toContain("【当前题目上下文占位】");
    expect(prompt).toMatch(/不直接给完整答案|不要直接给出完整答案/);
  });

  it("桌宠台词场景提示词=人设+一句话硬约束", () => {
    const prompt = buildTakagiMascotPrompt();
    expect(prompt).toContain(TAKAGI_CORE);
    expect(prompt).toMatch(/30 个字/);
    expect(prompt).toMatch(/不要 emoji/);
    expect(prompt).toMatch(/不要括号动作/);
    expect(prompt).toMatch(/最近说过/);
  });
});
