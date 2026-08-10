// AI 调用（经 Cloudflare Worker 中转）—— 带超时 + fallback
//
// v3 数据契约变更：
//   旧：{ emoji, line }              （汇聚成 emoji 像素图案）
//   新：{ archetype, hue, energy, line }  （驱动 3D 抽象情绪形态）
//   archetype ∈ {nebula,vortex,bloom,cascade,crystal,aurora}
//   hue ∈ [0,360]，energy ∈ [0,1]，line 是揭晓台词
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
function chat(messages) {
  const url = CONFIG.workerUrl;
  if (!url) return Promise.reject(new Error("no worker url"));

  return fetchWithTimeout(
    url,
    { model: CONFIG.model, messages: messages },
    CONFIG.aiTimeoutMs
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

// 钳制 + 类型安全：把任意输入变成合法的 mood 描述符
function sanitizeMood(obj) {
  if (!obj || typeof obj !== "object") return null;
  let archetype = String(obj.archetype || "").toLowerCase().trim();
  if (!ARCHETYPES.includes(archetype)) archetype = "nebula";

  let hue = Number(obj.hue);
  if (!isFinite(hue)) hue = 200;
  hue = Math.max(0, Math.min(360, hue));

  let energy = Number(obj.energy);
  if (!isFinite(energy)) energy = 0.5;
  energy = Math.max(0, Math.min(1, energy));

  let line = String(obj.line || "").replace(/\s+/g, " ").trim();
  if (line.length < 2) line = "这是给你的。";
  if (line.length > 60) line = line.slice(0, 60);

  return { archetype, hue, energy, line };
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
  // 兜底：把整段文本当 line，archetype/hue/energy 用默认
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
  /** 调用 #1：个性化招呼 */
  greet(name) {
    return chat([
      {
        role: "system",
        content:
          "你是一位神秘、温和的魔术师，用中文说话。根据观众的名字，生成一句不超过15个字的个性化开场招呼，带一点神秘感和亲切感。只输出招呼这一句话本身，不要引号、不要解释。",
      },
      { role: "user", content: "观众名字是「" + name + "」" },
    ])
      .then((txt) => {
        const clean = txt
          .replace(/^["「『]+|["」』]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (clean.length < 2 || clean.length > 40) throw new Error("bad greet");
        return clean;
      })
      .catch(() => pick(SCRIPT.fallbackGreets, name));
  },

  /** 调用 #2：揭晓生成（输出抽象情绪描述符，驱动 3D 形态） */
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
        content:
          "你是一位神秘的魔术师，正在为这位观众完成读心魔术的揭晓。" +
          "你不再给出具象图案，而是把TA此刻的心境翻译成一个抽象的「光之形态」。" +
          "请从这六种原型中选择最契合的一种：" +
          "nebula(沉思静谧的体积星云)、vortex(涌动蜕变的双臂漩涡星系)、bloom(希望生长的曼陀罗绽放)、cascade(释怀哀愁的倾泻流瀑)、crystal(清明决断的几何晶格)、aurora(梦境超脱的起伏光帘)。" +
          "同时给出一个主色相 hue(0~360 的数字，如蓝200、紫270、金45、红0、绿130、青180)和能量值 energy(0~1，0静谧、1激昂)。" +
          "再配一句不超过25个字的话，有「读懂TA」的余韵，温暖或带一点神秘。" +
          "严格只输出 JSON，格式：{\"archetype\":\"nebula\",\"hue\":210,\"energy\":0.6,\"line\":\"……\"}，不要 markdown、不要多余文字。",
      },
      { role: "user", content: userText },
    ])
      .then((txt) => {
        const r = parseReveal(txt);
        if (!r) throw new Error("parse failed");
        return r;
      })
      .catch(() => pick(SCRIPT.fallbackReveals));
  },
};
