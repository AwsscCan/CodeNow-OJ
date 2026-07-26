/* CodeNow OJ · 桌宠台词与状态分类(高木同学人设) · Bamzc */

import type { Result } from "./problem-store";

export type MascotMood = "smile" | "laugh" | "smug" | "surprised" | "gentle" | "annoyed" | "angry";

/** 桌宠所处的编程情境阶段 */
export type MascotPhase = "idle" | "coding" | "judging" | "ac" | "wa" | "ce" | "re" | "tle";

export type MascotLine = { text: string; mood: MascotMood; sprite: number };

export const MASCOT_PHASES: readonly MascotPhase[] = ["idle", "coding", "judging", "ac", "wa", "ce", "re", "tle"];

/**
 * 本地台词池：高木同学(からかい上手の高木さん)人设的兜底台词。
 * 未配置 API Key、请求失败或需要即时反应时使用，按情境分类随机不重复取用。
 */
export const MASCOT_LINE_POOL: Record<MascotPhase, MascotLine[]> = {
  idle: [
    { text: "我就坐在这看着哦，ふふ，偷懒可瞒不过我。", mood: "smile", sprite: 6 },
    { text: "呆坐着干嘛，题目又不会自己解开，ね？", mood: "gentle", sprite: 0 },
    { text: "在发呆？被我盯着就慌神了吧，ふふ。", mood: "smug", sprite: 2 },
    { text: "手指头别停呀，我可等着看你出丑呢。", mood: "smile", sprite: 0 },
    { text: "要不要打赌？十分钟内你连第一行都写不出。", mood: "laugh", sprite: 1 },
  ],
  coding: [
    { text: "唔，这段写得挺认真，我倒要看你撑到哪。", mood: "gentle", sprite: 0 },
    { text: "ね，是不是又想偷懒写暴力？我看穿了哦。", mood: "smug", sprite: 2 },
    { text: "慢慢写没关系，反正我很闲，陪你到底。", mood: "smile", sprite: 0 },
    { text: "手感不错嘛…别得意，坑还在后头等你。", mood: "smug", sprite: 2 },
    { text: "赌不赌？这题你一遍过不了，ふふ。", mood: "smug", sprite: 2 },
    { text: "诶，这行写得有点意思…让我凑近看看。", mood: "surprised", sprite: 3 },
    { text: "写这么起劲？ふふ，待会我可要挑刺的。", mood: "laugh", sprite: 1 },
    { text: "变量名起成这样，もう，亏你想得出来。", mood: "annoyed", sprite: 4 },
  ],
  judging: [
    { text: "让我看看这次能不能惊艳到我…才怪。", mood: "surprised", sprite: 3 },
    { text: "评测机转起来了，心跳加速没？我可没有。", mood: "smug", sprite: 2 },
    { text: "心跳加速了吧？别慌，又不是我在挨判。", mood: "surprised", sprite: 3 },
    { text: "赌一包辣条，这次过不了全部，ふふ。", mood: "smug", sprite: 2 },
  ],
  ac: [
    { text: "全过了…哼，这次算你有本事，少しだけ哦。", mood: "smug", sprite: 2 },
    { text: "诶，居然一次过？我可没夸你，别乱想。", mood: "laugh", sprite: 1 },
    { text: "すごいじゃん…啊说漏嘴了，当我没说。", mood: "laugh", sprite: 1 },
    { text: "全绿了呢，勉强…让我刮目相看一下下。", mood: "smile", sprite: 0 },
    { text: "嘛，还行啦…别骄傲，下题我可不让你。", mood: "smug", sprite: 2 },
  ],
  wa: [
    { text: "又 WA 啦？ふふ，就知道你会栽在这。", mood: "annoyed", sprite: 4 },
    { text: "看吧看吧，第一个红点正冲你笑呢。", mood: "smug", sprite: 2 },
    { text: "もう，太天真啦，边界情况根本没想吧？", mood: "annoyed", sprite: 4 },
    { text: "输出对不上哦，要我偷偷提示你？…不给。", mood: "smug", sprite: 2 },
    { text: "诶？这个点居然错了，我都替你意外呢。", mood: "surprised", sprite: 3 },
    { text: "错成这样还嘴硬？だめだめ，重新想。", mood: "angry", sprite: 5 },
  ],
  ce: [
    { text: "编译都过不了还敢提交？だめだめ。", mood: "angry", sprite: 5 },
    { text: "红线一片你没看见吗！先给我改干净。", mood: "angry", sprite: 5 },
    { text: "语法都没理顺就想蒙混？门儿都没有。", mood: "annoyed", sprite: 4 },
    { text: "红字辣眼睛，先把编译过了再说，もう。", mood: "annoyed", sprite: 4 },
  ],
  re: [
    { text: "诶诶，跑崩了？数组是不是又越界啦。", mood: "surprised", sprite: 3 },
    { text: "运行时炸了哦，指针是不是乱飞了，ね？", mood: "surprised", sprite: 3 },
    { text: "程序当场崩了…别慌，我陪你一起收尾。", mood: "gentle", sprite: 0 },
    { text: "又崩啦？边界没护住吧，来，我盯着你改。", mood: "annoyed", sprite: 4 },
  ],
  tle: [
    { text: "太慢啦，我都等得打哈欠了，ふぁ～", mood: "smug", sprite: 2 },
    { text: "超时了哦，暴力赢不了我，复杂度算过没？", mood: "annoyed", sprite: 4 },
    { text: "这速度…乌龟看了都想超你呢。", mood: "smug", sprite: 2 },
    { text: "又超时？换个思路啦，我等得都困了，ね。", mood: "annoyed", sprite: 4 },
  ],
};

/**
 * 依据判题结果推断桌宠情境阶段。
 * 优先级：编译错误 > 全部通过 > 超时 > 运行/内存错误 > 答案错误。
 */
export function classifyResults(results: Result[]): {
  phase: MascotPhase;
  passed: number;
  total: number;
  firstFailedIndex: number;
} {
  const total = results.length;
  const passed = results.filter((r) => r.status === "AC").length;
  const firstFailedIndex = results.findIndex((r) => r.status !== "AC");

  let phase: MascotPhase;
  if (total === 0) phase = "coding";
  else if (results.some((r) => r.status === "CE")) phase = "ce";
  else if (passed === total) phase = "ac";
  else if (results.some((r) => r.status === "TLE")) phase = "tle";
  else if (results.some((r) => r.status === "RE")) phase = "re";
  else phase = "wa";

  return { phase, passed, total, firstFailedIndex };
}

/**
 * 从本地台词池按情境挑一句，优先避开最近说过的，避免重复。
 * 整池都说过时至少排除当前正显示的一句(recent 队尾)，保证点击换台词必出新句；
 * 候选中存在不同 sprite 时优先换动作，避免"台词换了立绘却纹丝不动"。
 * rng 可注入以便测试确定性。
 */
export function pickLocalLine(phase: MascotPhase, recent: string[], rng: () => number = Math.random): MascotLine {
  const pool = MASCOT_LINE_POOL[phase] ?? MASCOT_LINE_POOL.idle;
  const fresh = pool.filter((line) => !recent.includes(line.text));
  const current = recent[recent.length - 1];
  const candidates = fresh.length ? fresh : pool.filter((line) => line.text !== current);
  const usable = candidates.length ? candidates : pool;
  const currentSprite = Object.values(MASCOT_LINE_POOL).flat().find((line) => line.text === current)?.sprite;
  const moved = currentSprite === undefined ? usable : usable.filter((line) => line.sprite !== currentSprite);
  const finalPool = moved.length ? moved : usable;
  return finalPool[Math.floor(rng() * finalPool.length)] ?? pool[0];
}
