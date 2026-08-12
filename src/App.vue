<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { SceneManager } from "./three/SceneManager.js";
import { Particles } from "./three/particles.js";
import { Input } from "./lib/input.js";
import { createStage } from "./lib/stage.js";
import { SCRIPT } from "./lib/script.js";
import { AI } from "./lib/ai.js";
import {
  extractKeyword,
  colorToHue,
  fillTemplate,
  parseBelief,
  moodGenesFromWorry,
  moodGenesFromWish,
  moodGenesFromBelief,
} from "./lib/keywords.js";

// —— DOM 引用 —— //
const threeRoot = ref(null);
const dialogueEl = ref(null);
const inputWrap = ref(null);
const answerEl = ref(null);
const sendBtn = ref(null);

let sm = null;
let particles = null;
let stage = null;
let rafId = null;
let disposed = false;

// —— 设备探测(桌面/移动):抽出避免 act4/act5 重复探测 —— //
const isMobile = () => matchMedia("(hover: none) and (pointer: coarse)").matches;

// —— 主循环 —— //
function loop() {
  if (disposed) return;
  const dt = sm.render();
  if (particles) particles.update(dt);
  rafId = requestAnimationFrame(loop);
}

// —— 六幕状态 —— //
const answers = { name: "", q1: "", q2: "", q3: "", q4: "" };
const keywords = { kw1: "", kw2: "", kw3: "" }; // 心事/颜色/愿望的关键词,act4 低语用
let revealResult = null;
let userHue = null; // 用户颜色题答的本地 hue(act3 染色 + act6 余韵色)
let belief = "maybe"; // 第4题:信不信,act6 反转台词用

// —— 第一幕 · 相遇 —— //
// 星场先于台词(他从星空来,视觉先行)
function act1Opening() {
  sm.setCameraMode("intro");
  // v5:生命体先于台词显现,全程在场(teamLab 式环境先行)——这样 act3 答题时它在场,setGenes 才有即时质变
  particles.spawn(isMobile() ? 1200 : 2000);
  return SCRIPT.opening.reduce((chain, line) => {
    return chain.then(() => stage.say(line)).then(() => stage.clear());
  }, Promise.resolve());
}

// —— 第二幕 · 相识 —— //
function act2AskName() {
  return stage
    .say(SCRIPT.askName)
    .then(() => stage.ask("你的名字……"))
    .then((name) => {
      const n = name || "旅人";
      answers.name = n;
      // 提交后立刻 thinking 占位,避免 AI.greet 期间空白
      stage.thinking("……" + n);

      // 分层低语撑场(仿第四幕):greet 思考期按时间点引用名字低语,
      // 避免只显示一句静态占位撑满最长 20s 的卡顿感。AI 到达即取消未播的。
      let cancelled = false;
      const timers = [];
      const greetSlots = [0, 3000, 6000];
      SCRIPT.greetMurmurs.forEach((tmpl, i) => {
        const line = tmpl.replace(/\{name\}/g, n);
        const t = setTimeout(() => {
          if (cancelled) return;
          stage.clear().then(() => {
            if (cancelled) return;
            stage.say(line, { speed: 75, hold: 1500 });
          });
        }, greetSlots[i]);
        timers.push(t);
      });

      return AI.greet(n).then((greet) => {
        cancelled = true;
        timers.forEach((t) => clearTimeout(t));
        return stage.clear().then(() => stage.say(greet));
      });
    });
}

// —— 第三幕 · 对话(四题,旅人口吻 + 关键词即时反应 + 颜色即时染色) —— //
function act3Questions() {
  return SCRIPT.questions.reduce((chain, q, idx) => {
    return chain
      .then(() => stage.clear())
      .then(() => stage.say(q.ask))
      .then(() => stage.ask(q.placeholder))
      .then((ans) => {
        // 空答案兜底(用户直接回车),给一个中性默认值,保证后续台词读得通
        const safe = ans || "";
        // 存答案(空答案也存,喂给 AI 时 AI 会自行处理)
        // v5:每题答案驱动生长基因,生态肉眼质变(沉重↔轻盈 / 向上↔回避 / 笃定↔飘忽)
        if (idx === 0) { answers.q1 = safe; keywords.kw1 = extractKeyword(safe) || "你的心事"; particles.setGenes(moodGenesFromWorry(safe)); }
        if (idx === 1) { answers.q2 = safe; keywords.kw2 = extractKeyword(safe, { preferColor: true }) || "那颜色"; }
        if (idx === 2) { answers.q3 = safe; keywords.kw3 = extractKeyword(safe) || "你想要的"; particles.setGenes(moodGenesFromWish(safe)); }
        if (idx === 3) { answers.q4 = safe; belief = parseBelief(safe); particles.setGenes(moodGenesFromBelief(belief)); }

        // 颜色题:0ms 即时染色粒子(不等 AI)。乱答非颜色时 colorToHue 返回 null,不染色
        if (q.isColor) {
          const hue = colorToHue(safe);
          if (hue !== null) {
            userHue = hue;
            particles.tintHue(hue);
          }
          // 用户答出颜色→引用颜色词;没答出(乱答/空)→用 reactMiss 兜底
          const reactText = hue !== null
            ? fillTemplate(q.react, keywords.kw2, "那颜色")
            : q.reactMiss;
          stage.thinking("嗯……");
          return stage.wait(900).then(() =>
            stage.clear().then(() => stage.say(reactText, { speed: 85, hold: 800 }))
          );
        }

        // 信不信题:留悬念,react 不变
        if (q.isBelief) {
          stage.thinking("……有意思");
          return stage.wait(1100).then(() =>
            stage.clear().then(() => stage.say(q.react, { speed: 90, hold: 700 }))
          );
        }

        // 即时反应:用关键词填充 react 模板(每题不同兜底词,保证读得通)
        const fbMap = ["你的心事", "那颜色", "那个愿望"];
        const kw = (idx === 0 && keywords.kw1) || (idx === 1 && keywords.kw2) || (idx === 2 && keywords.kw3);
        const react = fillTemplate(q.react, kw, fbMap[idx]);
        stage.thinking("嗯……");
        return stage.wait(900).then(() =>
          stage.clear().then(() => stage.say(react, { speed: 85, hold: 800 }))
        );
      });
  }, Promise.resolve());
}

// —— 第四幕 · 凝视(分层低语撑场 + AI 并发) —— //
// 关键:AI 思考 5-15s 期间,旅人按时间点分层低语,引用用户答案关键词,
// 让用户感到"被看见";AI 到达则取消未播的低语,显示 murmur(深化)。
// 设计:低语用 setTimeout 调度,每句触发前检查 cancelled;AI 到达时清空所有未触发 timer。
function act4Gather() {
  return stage
    .clear()
    .then(() => stage.say(SCRIPT.beforeReveal, { speed: 80, hold: 600 }))
    .then(() => {
      stage.gather(true);
      stage.clear();
      sm.setCameraMode("gather");
      // v5:生命体已在 act1 显现并全程在场,这里不再 spawn;凝视期它继续流动 + 旅人低语 + AI 在读

      // —— 可取消的低语调度 —— //
      let cancelled = false;
      const timers = [];
      // 当前正在进行的低语 say promise(AI 到达时若它还在打,不强行打断 say 内部,
      // 但标记取消,让它播完当前句后不再继续)
      const cancelMurmurs = () => {
        cancelled = true;
        timers.forEach((t) => clearTimeout(t));
        timers.length = 0;
      };

      const lines = SCRIPT.murmurs.map((tmpl) =>
        tmpl
          .replace(/\{kw1\}/g, keywords.kw1 || "你的心事")
          .replace(/\{kw2\}/g, keywords.kw2 || "那颜色")
          .replace(/\{kw3\}/g, keywords.kw3 || "你想要的")
      );

      // 低语时序:0s / 4s / 8s(每句打字~1.5s + hold 1.8s + clear 0.3s ≈ 3.6s,留缓冲)
      const slots = [0, 4000, 8000, 12000];
      lines.forEach((line, i) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          stage.clear().then(() => {
            if (cancelled) return;
            stage.say(line, { speed: 75, hold: 1800 });
          });
        }, slots[i]);
        timers.push(t);
      });

      // —— AI 并发请求 —— //
      return AI.reveal(answers).then(async (reveal) => {
        revealResult = reveal;
        cancelMurmurs(); // 取消所有未播的低语
        // 清场,显示 AI 的 murmur(深化低语)+ 引导句
        await stage.clear();
        if (reveal.murmur) {
          await stage.say(reveal.murmur, { speed: 75, hold: 2000 });
          await stage.clear();
        }
        await stage.say(SCRIPT.murmurFinal, { speed: 70, hold: 900 });
        await stage.clear();
      });
    });
}

// —— 第五幕 · 揭晓 —— //
function act5Reveal() {
  // 崩溃保护:revealResult 缺失/损坏时降级到 fallback reveal,
  // 保证即便这一幕出错,后续告别反转(act6)也不被跳过(否则会落到顶层 catch 直接"今天先到这里")
  let reveal = revealResult;
  if (!reveal || !reveal.archetype || typeof reveal.huePrimary !== "number") {
    reveal = SCRIPT.fallbackReveals[Math.floor(Math.random() * SCRIPT.fallbackReveals.length)];
    revealResult = reveal;
  }
  const { archetype, huePrimary, line } = reveal;

  stage.gather(false);
  // ambient 先染主色;主云随后由 formTo 用 AI 完整基因覆盖(含 hueSecondary 层次)
  particles.tintHue(huePrimary, 1.2);
  sm.setCameraMode("reveal", archetype);
  // v5:粒子是 curl 流场活生态,formTo 用 AI 生长基因驱动 + 渐进致密成型
  particles.formTo(reveal);
  // 揭晓台词:打完后停留 2.5s(不用 999999,act6 的 clear 会自然接管)
  const sayPromise = stage.say(line, { reveal: true, speed: 55, hold: 2500 });

  // 等汇聚完成 + 台词打完
  return Promise.all([sayPromise, stage.wait(4200)])
    .then(() => stage.wait(2000))
    .then(() => stage.clear())
    .then(() => stage.say(SCRIPT.revealAfter, { speed: 70, hold: 2500 }));
}

// —— 第六幕 · 告别(反转 + 颜色伏笔回收 + 余韵) —— //
function act6Farewell() {
  sm.setCameraMode("farewell");
  // 飞散时带走用户给的颜色(呼应伏笔)
  const keepHue = (revealResult && (revealResult.huePrimary ?? revealResult.hue)) || userHue || 210;
  particles.disperse();

  return stage
    .clear()
    .then(() => stage.wait(1000))
    // 1. 反转:回收"信不信"伏笔(这是高潮,稍慢)
    .then(() => {
      const line = SCRIPT.farewellBelief[belief] || SCRIPT.farewellBelief.maybe;
      return stage.say(line, { speed: 65, hold: 2500 });
    })
    .then(() => stage.clear())
    .then(() => stage.wait(300))
    // 2. 颜色伏笔回收 + 旅途告别合并(避免太碎)
    .then(() => {
      const farewellLine = SCRIPT.farewell.replace(/\{name\}/g, answers.name || "旅人");
      // 先说颜色带走,再说告别 —— 两句连播,中间不 clear
      return stage.say(SCRIPT.farewellColor, { speed: 72, hold: 1500 })
        .then(() => stage.clear())
        .then(() => stage.wait(300))
        .then(() => {
          // 留下一点什么(告别台词打出时出现)
          particles.leaveOneBack(keepHue);
          return stage.say(farewellLine, { speed: 70, hold: 4000 });
        });
    })
    .then(() => stage.clear());
}

function start() {
  act1Opening()
    .then(act2AskName)
    .then(act3Questions)
    .then(act4Gather)
    .then(act5Reveal)
    .then(act6Farewell)
    .catch((e) => {
      console.error("表演中断:", e);
      try {
        if (particles) particles.disperse();
      } catch (_) {}
      stage
        .say("……今天，先到这里。")
        .then(() => stage.clear())
        .then(() => {
          if (particles) particles.clear();
        });
    });
}

onMounted(() => {
  Input.start();
  sm = new SceneManager(threeRoot.value);
  particles = new Particles(sm);
  stage = createStage({
    dialogue: dialogueEl.value,
    inputWrap: inputWrap.value,
    input: answerEl.value,
    send: sendBtn.value,
  });
  rafId = requestAnimationFrame(loop);
  start();
});

onUnmounted(() => {
  disposed = true;
  if (rafId) cancelAnimationFrame(rafId);
  if (particles) particles.dispose();
  if (sm) sm.dispose();
  Input.stop();
});
</script>

<template>
  <!-- 多层径向渐变呼吸背景 -->
  <div class="bg-aura"></div>
  <!-- Three.js 粒子层（真 3D） -->
  <div ref="threeRoot" class="three-root"></div>
  <!-- 舞台层 -->
  <div class="stage">
    <div ref="dialogueEl" class="dialogue"></div>
    <div ref="inputWrap" class="input-wrap hidden">
      <input
        ref="answerEl"
        class="answer-input"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="……"
        maxlength="60"
      />
      <button ref="sendBtn" class="send-btn" type="button" aria-label="说出">
        <span style="line-height: 1">→</span>
      </button>
    </div>
  </div>
</template>
