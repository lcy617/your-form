// 剧本 —— 这场魔术的台词本，集中在此方便改气质
export const SCRIPT = {
  // —— 第一幕 · 登场 —— //
  opening: ["你好。", "我是一个能看见心里的魔术师。", "让我，为你变一个魔术。"],
  askName: "但首先……你叫什么名字？",
  greetFallback: "你好啊，{name}。请坐。",

  // —— 第二幕 · 套话 —— //
  questions: [
    { ask: "今天……心里装着什么事？", placeholder: "随便说说……", react: "嗯……我感受到了。" },
    { ask: "如果用一种颜色，形容此刻的你？", placeholder: "一种颜色", react: "这颜色，很好。" },
    { ask: "闭上眼——你最希望，看见什么？", placeholder: "你想看见的……", react: "我记下了。" },
    { ask: "最后一个秘密：你，相信魔术吗？", placeholder: "信，或不信……", react: "……有意思。" },
  ],

  // —— 第三幕 · 酝酿 —— //
  beforeReveal: "好……别动。让我看看。",

  // —— 第五幕 · 落幕 —— //
  farewell: "这是给你的。再见，{name}。",

  // —— Fallback 揭晓库（AI 失败时用）—— //
  // 每条是一个抽象情绪描述符：archetype(原型) + hue(色相) + energy(能量) + line(台词)
  // 六大原型各覆盖，保证 fallback 也形态多样
  fallbackReveals: [
    { archetype: "nebula",  hue: 220, energy: 0.35, line: "夜深了，愿你被温柔以待。" },
    { archetype: "nebula",  hue: 45,  energy: 0.55, line: "你比你想的，更亮一点。" },
    { archetype: "bloom",   hue: 330, energy: 0.6,  line: "春天会来，慢慢走也没关系。" },
    { archetype: "aurora",  hue: 160, energy: 0.5,  line: "放下的事，会以另一种方式回来。" },
    { archetype: "cascade", hue: 200, energy: 0.4,  line: "心里那片海，终会平静。" },
    { archetype: "bloom",   hue: 130, energy: 0.65, line: "你正在长出新的自己。" },
    { archetype: "vortex",  hue: 30,  energy: 0.45, line: "先歇一会儿，没关系。" },
    { archetype: "crystal", hue: 270, energy: 0.5,  line: "在宇宙里，你并不孤单。" },
    { archetype: "aurora",  hue: 280, energy: 0.55, line: "梦里的光，会带你回去。" },
    { archetype: "vortex",  hue: 190, energy: 0.7,  line: "转动的，终会回到你手里。" },
  ],

  // —— Fallback 个性化招呼库 —— //
  fallbackGreets: [
    "你好啊，{name}。请坐。",
    "{name}……好名字。请坐。",
    "欢迎你，{name}。",
    "{name}，我等你一会儿了。",
  ],
};
