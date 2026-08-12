// 剧本 —— 异世界旅人的读心仪式
//
// 世界观:
//   他是来自另一个魔法世界的旅人,途经此地,偶然发现了你。
//   在他那里,人能"看见"心的颜色和形状。他为你停了一会儿,然后继续旅途。
//   气质:小王子 × 星际穿越的温柔 × 吉卜力的轻盈孤独。
//
// 核心伏笔(前埋后收):
//   · 颜色 —— 第三幕"我把它变成真的光" → 第六幕"你给我的颜色,我带走了"
//   · 信不信 —— 第三幕"在我那里这叫看见" → 第六幕反转"这,也许就是魔术"
//   · 旅途 —— 开场"路过你的世界我停了一下" → 结尾"该走了"+留一颗粒子
//
// {kw} 占位由 keywords.js 的 fillTemplate 即时填充用户答案关键词。
// {name} 占位在运行时替换为用户名字。
export const SCRIPT = {
  // —— 第一幕 · 相遇 —— //
  // 星场先于台词入场(他从星空来,视觉先行)
  opening: [
    "……我并非来自这里。",
    "路过你的世界时，我停了一下。",
    "在我那里，我能看见，人心的颜色。",
  ],
  askName: "你叫什么？在我那里，名字是有重量的。",

  // —— 第三幕 · 对话(四题) —— //
  // react 用 {kw} 占位,填入从答案提取的关键词,让旅人"真的在听"
  // reactColor 在颜色题特殊:0ms 触发粒子染色后说这句
  questions: [
    {
      ask: "今天……心里，装着什么？",
      placeholder: "随便说说……",
      // 心事题:接住用户的关键词
      react: "{kw}……我，接住了。",
    },
    {
      ask: "说一种颜色。我把它，变成真的光。",
      placeholder: "一种颜色……",
      // 颜色题:答完瞬间染色粒子,旅人确认"它成了光"
      react: "{kw}……好。你看，它成了光。",
      // 用户没答颜色(乱答/空)时的兜底 react,不强行引用无关词
      reactMiss: "没关系。光，会自己找你。",
      isColor: true,
    },
    {
      ask: "闭上眼。你最想，看见什么？",
      placeholder: "你想看见的……",
      // 愿望题:记下,为第四幕低语埋伏笔
      react: "{kw}……我，记下了。",
    },
    {
      ask: "最后一个。你，信魔术吗？在我那里，这叫——看见。",
      placeholder: "信，或不信……",
      // 信不信题:不立刻表态,留悬念(伏笔,结尾回收)
      react: "……有意思。我记着了。",
      isBelief: true,
    },
  ],

  // —— 第四幕 · 凝视 —— //
  beforeReveal: "现在，别动。让我，看清你。",
  // 分层渐进低语:AI 思考期间(5-15s)按时间点逐步说出,引用用户具体答案
  // 用 {kw1}{kw2}{kw3} 占位分别填心事/颜色/愿望的关键词
  // 时序:0s/4s/8s/12s 四段,撑住等待前半段(12s 兜底层不引用 kw,AI 迟到时避免画面停滞)
  murmurs: [
    "你给我的颜色……{kw2}。我，接住了。",
    "{kw1}。原来，它是这个样子。",
    "你想看见的——{kw3}。我也，看见了。",
    "再等等。我，快看清了。",
  ],
  // AI murmur 到达后的引导句(过渡到揭晓)
  murmurFinal: "好。我看见你了。",

  // —— 第五幕 · 揭晓 —— //
  // 揭晓台词 line 由 AI 生成(见 ai.js reveal),这里只是揭晓后的总结
  revealAfter: "这就是，此刻的你。",

  // —— 第六幕 · 告别(反转 + 余韵) —— //
  // 三段递进:反转(回收信不信)→ 呼应颜色伏笔 → 旅途告别 + 余韵
  // belief 根据用户第4题回答选 yes/no/maybe 三种
  farewellBelief: {
    yes: "你说，信。那么你看——一个异乡人，刚刚看见了真正的你。这，也许就是魔术。",
    no: "你说，不信。可你看——一个异乡人，刚刚看见了真正的你。这，难道不是魔术吗？",
    maybe: "你犹豫了。可你看——一个异乡人，刚刚看见了真正的你。也许，那就是魔术。",
  },
  // 颜色伏笔回收:粒子飞散时带走用户给的颜色
  farewellColor: "你给我的颜色，我带走了。",
  // 旅途告别:呼应开场"路过你的世界我停了一下"
  farewell: "该走了。{name}，别忘记，你心里的光。",

  // —— Fallback 揭晓库(AI 失败时用) —— //
  // v5:每条带完整生长基因(驱动 curl 流场活生态),让 fallback 时生态也独一无二
  // line 是揭晓台词(描述生命体状态),murmur 是酝酿期低语;archetype 覆盖六原型作气质标签
  fallbackReveals: [
    { archetype: "nebula",  huePrimary: 220, hueSecondary: 280, flowSpeed: 0.5, density: 0.65, stability: 0.85, growthBias: -0.2, saturation: 0.45, line: "你的心，是一片很安静的夜。", murmur: "安静的东西，往往最深。" },
    { archetype: "nebula",  huePrimary: 45,  hueSecondary: 0,   flowSpeed: 0.7, density: 0.6,  stability: 0.65, growthBias: 0.1,  saturation: 0.6,  line: "你比自己想的，要亮一些。",   murmur: "我看见一点光，在动。" },
    { archetype: "bloom",   huePrimary: 330, hueSecondary: 30,  flowSpeed: 0.9, density: 0.65, stability: 0.6,  growthBias: 0.3,  saturation: 0.65, line: "有些事，正在慢慢开。",      murmur: "开得很慢，但很稳。" },
    { archetype: "aurora",  huePrimary: 160, hueSecondary: 200, flowSpeed: 1.4, density: 0.4,  stability: 0.35, growthBias: 0.4,  saturation: 0.7,  line: "你心里的风，刮得很自由。",   murmur: "我听见风的声音了。" },
    { archetype: "cascade", huePrimary: 200, hueSecondary: 260, flowSpeed: 1.0, density: 0.45, stability: 0.4,  growthBias: -0.4, saturation: 0.5,  line: "心里的水，终会落到底。",     murmur: "落下来，就轻了。" },
    { archetype: "bloom",   huePrimary: 130, hueSecondary: 190, flowSpeed: 0.9, density: 0.65, stability: 0.6,  growthBias: 0.35, saturation: 0.7,  line: "你心里，有什么要开了。",     murmur: "开得慢，但我看见了。" },
    { archetype: "vortex",  huePrimary: 30,  hueSecondary: 0,   flowSpeed: 1.5, density: 0.5,  stability: 0.3,  growthBias: 0,    saturation: 0.65, line: "转动的东西，会回到你手里。", murmur: "转得很快，我没看错。" },
    { archetype: "crystal", huePrimary: 270, hueSecondary: 210, flowSpeed: 0.4, density: 0.7,  stability: 0.85, growthBias: 0,    saturation: 0.55, line: "在宇宙里，你并不孤单。",     murmur: "我数过了，光点很多。" },
    { archetype: "aurora",  huePrimary: 280, hueSecondary: 220, flowSpeed: 1.2, density: 0.45, stability: 0.4,  growthBias: 0.1,  saturation: 0.55, line: "梦里的光，记得带你回去。",   murmur: "那条路，我认得。" },
    { archetype: "vortex",  huePrimary: 190, hueSecondary: 30,  flowSpeed: 1.8, density: 0.5,  stability: 0.25, growthBias: 0.2,  saturation: 0.75, line: "你正在，剧烈地变成什么。",   murmur: "变得很疼，但很真。" },
  ],

  // —— Fallback 个性化招呼库 —— //
  // 旅人气质:异乡的好奇 + 温柔
  fallbackGreets: [
    "{name}……在我那里，这是个有力量的名字。",
    "{name}。路过你之前，我没想过会停下。",
    "我记住你了，{name}。",
    "{name}，好名字。在我那里，它会有光。",
  ],

  // —— 第二幕 greet 期间的分层低语(AI.greet 思考期撑场,引用名字) —— //
  // 仿第四幕 murmurs 的分层设计,避免只显示一句静态占位造成卡顿感
  greetMurmurs: [
    "{name}……好。让我，看看你。",
    "名字里，藏着点什么。我，找找。",
    "别急。我，快看见你了。",
  ],
};
