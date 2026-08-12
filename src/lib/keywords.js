// 本地即时反应引擎 —— 不依赖 AI,0ms 内把用户答案变成可见反馈
//
// 设计动机:
//   AI 调用要 5-15s。这段时间页面不能静止。本模块用纯本地规则,
//   在用户提交答案的瞬间:① 提取关键词塞进旅人台词 ② 把颜色词翻译成 hue 喂给粒子。
//   让用户"立刻感到被看见",再等 AI 来深化。
//
// 三件套:
//   extractKeyword(text) —— 从答案里抠出 2-5 字的关键词(中文启发式)
//   colorToHue(text)     —— 颜色词 → hue(0~360),粒子的即时染色入口
//   fillTemplate(tmpl,kw) —— 把 react 模板的 {kw} 换成关键词

// —— 中文停用词:这些词即使出现也不算"关键词" —— //
const STOP_WORDS = new Set([
  // 代词/助词/量词
  "我", "你", "他", "她", "它", "们", "的", "了", "是", "在", "也", "都",
  "就", "还", "又", "把", "被", "让", "给", "和", "与", "或", "但", "而",
  "这", "那", "一个", "一种", "一些", "一样", "什么", "怎么", "为什么",
  "没有", "不是", "不会", "不能", "可以", "可能", "也许", "大概",
  // 常见动词/虚词(弱信息)
  "觉得", "感觉", "想要", "希望", "喜欢", "害怕", "担心", "想着", "看着",
  "今天", "现在", "此刻", "时候", "地方", "东西", "样子",
  // 问卷式填充
  "不知道", "没什么", "随便", "还好", "真的",
]);

// —— 引导动词/愿望类弱词:出现在句首时剥掉,露出核心 —— //
// 注意:长模式必须排在短模式前(正则 | 从左到右取第一个命中分支)
const LEAD_VERBS = /^(想看见|想看到|想要看|好希望|能看见|能看到|想要|想看|想去|希望|好想|渴望|期待|看见|看到|找到|遇见|拥有|成为|变成|想)/;

// —— 颜色词 → hue 映射(覆盖常见中文颜色表达) —— //
// hue 用标准色环:红0 橙30 金45 黄60 绿130 青180 蓝210 紫270 粉330
const COLOR_MAP = [
  // 直接颜色词
  { kw: ["红", "朱", "赤"], hue: 0 },
  { kw: ["橙", "橘"], hue: 30 },
  { kw: ["棕", "褐", "咖啡", "栗"], hue: 28 },
  { kw: ["金"], hue: 45 },
  { kw: ["黄", "暖黄"], hue: 55 },
  { kw: ["绿", "翠", "青绿"], hue: 130 },
  { kw: ["青", "碧", "湛蓝"], hue: 185 },
  { kw: ["蓝", "深蓝", "天蓝", "靛"], hue: 215 },
  { kw: ["紫", "靛紫", "薰衣草"], hue: 275 },
  { kw: ["粉", "粉红", "樱"], hue: 330 },
  { kw: ["白", "银", "月白"], hue: 200 },
  { kw: ["黑", "墨", "漆黑"], hue: 240 },
  { kw: ["灰", "莫兰迪", "雾"], hue: 220 },
  // 意象色(用户可能用比喻)
  { kw: ["夕阳", "晚霞", "落日"], hue: 20 },
  { kw: ["海", "海洋", "深海"], hue: 205 },
  { kw: ["森林", "草地", "苔藓"], hue: 140 },
  { kw: ["夜空", "星空", "宇宙", "银河"], hue: 225 },
  { kw: ["晨光", "黎明", "日出"], hue: 40 },
  { kw: ["火焰", "岩浆", "炭"], hue: 15 },
  { kw: ["冰", "雪", "霜"], hue: 195 },
  { kw: ["玫瑰", "樱花", "桃花"], hue: 335 },
];

/**
 * 从用户答案提取核心关键词。
 * 策略:① 先找最长颜色词(颜色题专用);② 去停用词;③ 取剩余最长片段;④ 兜底整句截取。
 * @param {string} text 用户输入
 * @param {object} [opt]
 * @param {boolean} [opt.preferColor] 颜色题用,优先返回颜色词
 * @returns {string} 2-8 字的关键词
 */
export function extractKeyword(text, opt = {}) {
  if (!text) return "";
  let clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  // 颜色题:优先抠颜色词
  if (opt.preferColor) {
    const colorWord = findColorWord(clean);
    if (colorWord) return colorWord;
  }

  // 剥掉句首引导动词(想看见/希望/想要...),露出核心
  clean = clean.replace(LEAD_VERBS, "").trim();

  // 通用:按标点/空格切,去掉停用词,取最长的有意义片段
  const segs = clean
    .split(/[，,。.、；;！!？?~～\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 过滤掉纯停用词片段,再按长度降序
  const meaningful = segs.filter((s) => !STOP_WORDS.has(s) && s.length >= 2);
  if (meaningful.length > 0) {
    meaningful.sort((a, b) => b.length - a.length);
    // 取最长,但截到 8 字以内
    return meaningful[0].slice(0, 8);
  }

  // 无标点长句:按"的"切分,取"的"后面的核心名词(如"宁静的大海"→"大海")
  // 或取最后一个实词片段
  if (clean.includes("的")) {
    const parts = clean.split("的").map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 0) {
      // 取最后一个非停用词部分(通常是核心名词)
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!STOP_WORDS.has(parts[i])) return parts[i].slice(0, 8);
      }
    }
  }

  // 从原句里删停用词,取剩余最长连续段
  const stripped = clean.replace(
    new RegExp([...STOP_WORDS].join("|"), "g"),
    " "
  );
  const remain = stripped
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (remain.length > 0) {
    remain.sort((a, b) => b.length - a.length);
    return remain[0].slice(0, 8);
  }

  // 最后兜底:整句截前 6 字
  return clean.slice(0, 6);
}

/**
 * 判断关键词是否"有意义"(非乱码)。
 * 规则:① 非空;② 含至少一个中文字符;③ 长度≥2。
 * 纯英文/纯数字/纯符号视为无意义(用户乱敲)。
 */
function isMeaningful(kw) {
  if (!kw || kw.length < 2) return false;
  // 必须含至少一个 CJK 中文字符
  return /[\u4e00-\u9fff]/.test(kw);
}

/**
 * 找出文本里命中的颜色词(返回词本身,如 "深蓝")。用于 react 引用 + 颜色题。
 */
function findColorWord(text) {
  let best = null;
  for (const entry of COLOR_MAP) {
    for (const kw of entry.kw) {
      if (text.includes(kw)) {
        // 取最长命中(深蓝 > 蓝)
        if (!best || kw.length > best.length) best = kw;
      }
    }
  }
  return best;
}

/**
 * 颜色词 → hue(0~360)。命中返回数字,不命中返回 null(让调用方走 AI 兜底)。
 * 支持修饰词("深"→hue 偏冷、"暖"→hue 偏暖、"亮"→提亮)。
 */
export function colorToHue(text) {
  if (!text) return null;
  const clean = String(text).trim();

  // 找命中的基础 hue(取最长命中的条目)
  let baseHue = null;
  let matchedWord = null;
  for (const entry of COLOR_MAP) {
    for (const kw of entry.kw) {
      if (clean.includes(kw)) {
        if (!matchedWord || kw.length > matchedWord.length) {
          matchedWord = kw;
          baseHue = entry.hue;
        }
      }
    }
  }
  if (baseHue === null) return null;

  // 修饰词微调:深/浅主要影响明度(由 form-generator 的 L 抖动体现),
  // 这里只做极小的 hue 偏移让"深蓝"和"天蓝"有一点差别(±3°,不破坏色相识别)
  let hue = baseHue;
  if (/深|暗|墨|黑|浓/.test(clean)) hue = (hue + 357) % 360; // 偏冷 3°
  if (/浅|淡|亮|明|轻|天/.test(clean)) hue = (hue + 3) % 360; // 偏暖 3°
  return Math.round(hue);
}

/**
 * 把模板里的 {kw} 占位换成关键词。
 * 关键词为空或乱码(无中文)时,用 fallback 词,保证台词读得通。
 * @param {string} tmpl 含 {kw} 的模板
 * @param {string} kw 关键词
 * @param {string} [fallback="这个"] 无意义时的兜底词
 * @returns {string} 填充后的台词
 */
export function fillTemplate(tmpl, kw, fallback) {
  if (!tmpl) return tmpl;
  const fb = fallback || "这个";
  const w = isMeaningful(kw) ? kw : fb;
  return tmpl.replace(/\{kw\}/g, w);
}

/**
 * 判断用户是否表达了"信"(第4题专用,影响结尾反转台词)。
 * 启发式:含肯定词算"信",含否定词算"不信",模糊算"信"(默认向温柔侧)。
 * @returns {"yes"|"no"|"maybe"}
 */
export function parseBelief(text) {
  if (!text) return "maybe";
  const t = String(text).trim();
  if (/^(不|没|别|算了吧|不太|应该不|不信|假的|骗)/.test(t)) return "no";
  if (/(不信|假的|骗|不存在的|怎么可能|不太信)/.test(t)) return "no";
  if (/^(信|相信|嗯|是的|当然|必须|一定|信的|我信)/.test(t)) return "yes";
  if (/(信|相信|愿意|希望|也许有|可能有|大概)/.test(t)) return "yes";
  return "maybe";
}

// —— 情感 → 生长基因映射(阶段 C:act3 每题答题驱动生态肉眼质变) —— //
// 启发式关键词匹配,返回部分基因(供 particles.setGenes 合并)。变化幅度刻意拉大以保证肉眼可见。

const WORRY_HEAVY = /(累|疲惫|压力|压抑|痛|难过|焦虑|烦躁|崩溃|悲伤|孤独|孤单|害怕|担心|失落|绝望|死|哭|空虚|沉重|困住|迷茫|无助|窒息|郁闷|抑郁|丧|裂)/;
const WORRY_LIGHT = /(开心|快乐|幸福|平静|安宁|期待|爱着|希望|美好|温暖|满足|轻松|自由|梦想|感激|欣慰|踏实|宁静|放松)/;

const WISH_UP = /(希望|想要|梦想|成为|找到|看见|自由|飞翔|光|远方|新的|到达|实现|遇见|拥有|变好|重新|探索|创造)/;
const WISH_DOWN = /(逃离|消失|忘记|结束|不要|害怕|躲|回去|放弃|解脱|离开|藏起来|停下)/;

/** 心事题 → 基因(沉重↔轻盈)。沉重心事:致密+飘忽+下沉+焦躁;轻盈心事:稀疏+沉稳+上升+舒缓 */
export function moodGenesFromWorry(text) {
  const t = String(text || "");
  if (WORRY_HEAVY.test(t)) return { density: 0.78, stability: 0.32, growthBias: -0.5, flowSpeed: 1.35 };
  if (WORRY_LIGHT.test(t)) return { density: 0.4, stability: 0.72, growthBias: 0.4, flowSpeed: 0.7 };
  return { density: 0.58, stability: 0.55, growthBias: -0.1, flowSpeed: 1.0 };
}

/** 愿望题 → 基因(向上↔回避)。向上愿望:上升+沉稳;回避愿望:下沉+飘忽 */
export function moodGenesFromWish(text) {
  const t = String(text || "");
  if (WISH_UP.test(t)) return { growthBias: 0.45, stability: 0.65, flowSpeed: 0.85 };
  if (WISH_DOWN.test(t)) return { growthBias: -0.35, stability: 0.4, flowSpeed: 1.2 };
  return { growthBias: 0.1, stability: 0.55, flowSpeed: 1.0 };
}

/** 信不信题 → 基因(笃定↔飘忽)。信:璀璨+沉稳;不信:飘忽+激荡;犹豫:中性 */
export function moodGenesFromBelief(belief) {
  if (belief === "yes") return { stability: 0.78, saturation: 0.72, flowSpeed: 0.8, density: 0.6 };
  if (belief === "no") return { stability: 0.38, flowSpeed: 1.3, density: 0.5 };
  return { stability: 0.5, flowSpeed: 1.05, density: 0.55 };
}
