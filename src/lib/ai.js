// AI 调用(经 Cloudflare Worker 中转)—— 带超时 + fallback
//
// 世界观:你是来自另一个魔法世界的旅人,偶然路过此地,遇见了这位观众。
// 在你那里,人能"看见"心的颜色和形状。你为他停了一会儿,然后继续旅途。
//
// v5 数据契约(teamLab 活生态):
//   reveal 返回 { archetype, huePrimary, hueSecondary, flowSpeed, density, stability, growthBias, saturation, line, murmur }
//   · archetype:气质标签(六选一,辅助,不驱动几何)
//   · huePrimary/hueSecondary ∈ [0,360]:主/辅色相(色彩层次,告别单色廉价)
//   · flowSpeed ∈ [0.3,2.0]:流速 | density/stability/saturation ∈ [0,1] | growthBias ∈ [-1,1]
//   · line:揭晓台词(描述生命体状态,≤20字) | murmur:酝酿期低语(引用TA原词,≤18字)
//   · 向后兼容:缺新字段时 hue→huePrimary 兜底
import { CONFIG } from "./config.js";
import { SCRIPT } from "./script.js";
import { ARCHETYPES } from "../three/form-generator.js";

// 带超时的 fetch
function fetchWithTimeout(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
      .then((r) => {
        clearTimeout(timer);
        if (!r.ok) reject(new Error("http " + r.status));
        else return r.json();
      })
      .then((data) => resolve(data))
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// 调 Worker → 通义 OpenAI 兼容接口
function chat(messages, timeoutMs) {
  const url = CONFIG.workerUrl;
  if (!url) return Promise.reject(new Error("no worker url"));

  return fetchWithTimeout(
    url,
    { model: CONFIG.model, messages: messages },
    timeoutMs || CONFIG.aiTimeoutMs
  ).then((data) => {
    const txt =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!txt) throw new Error("empty response");
    return txt.trim();
  });
}

// 钳制 + 类型安全:把任意输入变成合法的生长基因描述符
function sanitizeMood(obj) {
  if (!obj || typeof obj !== "object") return null;

  // 气质标签(辅助,不驱动几何)
  let archetype = String(obj.archetype || "").toLowerCase().trim();
  if (!ARCHETYPES.includes(archetype)) archetype = "nebula";

  // 色相(主/辅)——向后兼容旧字段 hue
  const clampHue = (v, d) => {
    let h = Number(v);
    if (!isFinite(h)) h = d;
    return Math.max(0, Math.min(360, h));
  };
  const huePrimary = clampHue(obj.huePrimary ?? obj.hue, 200);
  const hueSecondary = clampHue(obj.hueSecondary ?? (huePrimary + 60) % 360, (huePrimary + 60) % 360);

  // 0~1 类基因
  const clamp01 = (v, d) => {
    let x = Number(v);
    if (!isFinite(x)) x = d;
    return Math.max(0, Math.min(1, x));
  };
  const density = clamp01(obj.density, 0.55);
  const stability = clamp01(obj.stability, 0.6);
  const saturation = clamp01(obj.saturation, 0.6);

  // flowSpeed 0.3~2.0
  let flowSpeed = Number(obj.flowSpeed);
  if (!isFinite(flowSpeed)) flowSpeed = 1.0;
  flowSpeed = Math.max(0.3, Math.min(2.0, flowSpeed));

  // growthBias -1~1
  let growthBias = Number(obj.growthBias);
  if (!isFinite(growthBias)) growthBias = 0;
  growthBias = Math.max(-1, Math.min(1, growthBias));

  // 台词
  let line = String(obj.line || "").replace(/\s+/g, " ").trim();
  if (line.length < 2) line = "它在这里。";
  if (line.length > 25) line = line.slice(0, 25);

  let murmur = String(obj.murmur || "").replace(/\s+/g, " ").trim();
  if (murmur.length < 2) murmur = "";
  if (murmur.length > 22) murmur = murmur.slice(0, 22);

  return { archetype, huePrimary, hueSecondary, flowSpeed, density, stability, growthBias, saturation, line, murmur };
}

// 从可能含 JSON 的文本里提取情绪描述符
function parseReveal(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const clean = sanitizeMood(obj);
      if (clean) return clean;
    } catch (e) {}
  }
  // 兜底:把整段文本当 line
  const line = text.replace(/^[\s:：，,。.\-]+/, "").trim();
  if (line.length >= 2) {
    return sanitizeMood({ line });
  }
  return null;
}

function pick(arr, name) {
  const item = arr[Math.floor(Math.random() * arr.length)];
  return name ? item.replace(/\{name\}/g, name) : item;
}

export const AI = {
  /** 调用 #1:个性化招呼 —— 旅人初见 */
  greet(name) {
    return chat([
      {
        role: "system",
        content:
          "你是来自另一个魔法世界的旅人，偶然路过此地，遇见了这位观众。" +
          "在你那里，人能「看见」心的颜色。你为他停了一会儿。" +
          "气质：温柔、好奇、略带孤独，像一个会发光的远方朋友（参考小王子、吉卜力）。" +
          "用中文，根据观众的名字，生成一句不超过15个字的招呼，带异乡的亲切与一点神秘。" +
          "可以呼应「名字的重量」「路过」「停留」等意象。只输出招呼这一句话本身，不要引号、不要解释。",
      },
      { role: "user", content: "观众名字是「" + name + "」" },
    ], CONFIG.greetTimeoutMs)
      .then((txt) => {
        const clean = txt
          .replace(/^["「『]+|["」』]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        // 与 prompt 的"≤15字"对齐(留 5 字容差)
        if (clean.length < 2 || clean.length > 20) throw new Error("bad greet");
        return clean;
      })
      .catch(() => pick(SCRIPT.fallbackGreets, name));
  },

  /** 调用 #2:揭晓生成 —— 输出抽象情绪描述符 + 酝酿期低语 */
  reveal(ans) {
    const userText =
      "观众名字：" + ans.name +
      "\n心里装着的事：" + ans.q1 +
      "\n形容此刻的颜色：" + ans.q2 +
      "\n最希望看见的：" + ans.q3 +
      "\n是否相信魔术：" + ans.q4;

    return chat([
      {
        role: "system",
        content: `## 角色
你是来自另一个魔法世界的旅人,你能"看见"心的颜色和形状。此刻你在为这位观众培育一个专属于TA的「光之生命体」——把TA的心境翻译成这个生命体的生长基因,并轻声描述它长成了什么样。

## 任务
读取观众的四段回答(心事/颜色/愿望/是否信魔术),输出一个 JSON:生命体的生长基因 + 两句中文台词。

## 基因规则(严格遵守)
- huePrimary(0~360):生命体主色,贴合观众说的颜色词。蓝约215、红约0、金约45、绿约130、紫约275、青约185、粉约330、橙约30、棕约28;"深/暗"偏冷-10、"浅/亮"偏暖+10。
- hueSecondary(0~360):辅色,与主色形成层次(通常主色±60),避免死板单色。
- flowSpeed(0.3~2.0):流速。激昂/焦虑/混乱→快(1.2~2.0);沉静/疲惫→慢(0.3~0.8)。
- density(0~1):聚集度。沉重/执念→高(0.7~1);释怀/自由→低(0.2~0.5)。
- stability(0~1):稳定度。坚定/笃定→高(0.7~1);犹豫/迷茫→低(0.2~0.5)。
- growthBias(-1~1):生长偏向。希望/向上→正(0.3~1);低落/下沉→负(-1~-0.3);平静→近0。
- saturation(0~1):饱和度。浓烈情绪→高(0.7~1);淡然/疲惫→低(0.3~0.5)。
- archetype:气质标签(六选一,辅助,不决定形态):nebula(静谧沉思)/vortex(涌动蜕变)/bloom(希望生长)/cascade(释怀哀愁)/crystal(清明决断)/aurora(梦境超脱)。

## 台词规则
- line(≤20字):揭晓时一句,描述这个生命体此刻的状态(禁止套话),要让人感觉你真的看见了它。例如"它在你的蓝里,慢慢亮着"。
- murmur(≤18字):酝酿期一句,必须直接引用观众写下的原词(心事/颜色/愿望之一),像你正看它成形。例如观众说"深蓝",murmur 可"你说深蓝,它沉下去了"。禁止"生长""光""希望"这类空词。

## 输出契约
严格只输出 JSON,不要 markdown、不要解释:
{"archetype":"nebula","huePrimary":215,"hueSecondary":275,"flowSpeed":0.7,"density":0.6,"stability":0.7,"growthBias":0,"saturation":0.6,"line":"……","murmur":"……"}

## 反例(禁止)
- line="你充满希望" → 套话,违规(应描述生命体具体状态)。
- murmur="我看见光在生长" → 没引用观众原词,违规。
- huePrimary 与观众颜色无关 → 违规,必须贴合TA说的颜色。`,
      },
      { role: "user", content: userText },
    ])
      .then((txt) => {
        const r = parseReveal(txt);
        if (!r) throw new Error("parse failed");
        // murmur 缺失兜底
        if (!r.murmur) {
          const fb = pick(SCRIPT.fallbackReveals);
          r.murmur = fb.murmur;
        }
        return r;
      })
      .catch(() => {
        // 失败兜底:仍返回完整结构(含 murmur),不撕裂世界观
        const fb = pick(SCRIPT.fallbackReveals);
        return fb;
      });
  },
};
