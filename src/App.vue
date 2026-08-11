<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { SceneManager } from "./three/SceneManager.js";
import { Particles } from "./three/particles.js";
import { generateForm } from "./three/form-generator.js";
import { createStage } from "./lib/stage.js";
import { SCRIPT } from "./lib/script.js";
import { AI } from "./lib/ai.js";

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

// —— 主循环 —— //
function loop() {
  if (disposed) return;
  const dt = sm.render();
  if (particles && particles.hasParticles()) {
    particles.update(dt);
  } else if (particles) {
    // 即使没有主粒子云，也要更新 ambient 星场的 uniform
    particles.update(dt);
  }
  rafId = requestAnimationFrame(loop);
}

// —— 五幕 —— //
const answers = { name: "", q1: "", q2: "", q3: "", q4: "" };
let revealResult = null;

function act1Opening() {
  sm.setCameraMode("intro");
  return SCRIPT.opening.reduce((chain, line) => {
    return chain.then(() => stage.say(line)).then(() => stage.clear());
  }, Promise.resolve());
}

function act2AskName() {
  return stage
    .say(SCRIPT.askName)
    .then(() => stage.ask("你的名字……"))
    .then((name) => {
      const n = name || "旅人";
      answers.name = n;
      // 提交后立刻 thinking 占位，避免 AI.greet 期间舞台空白像卡死
      stage.thinking("……" + n + "，让我看看你");
      return AI.greet(n).then((greet) =>
        stage.clear().then(() => stage.say(greet))
      );
    });
}

function act3Questions() {
  return SCRIPT.questions.reduce((chain, q, idx) => {
    return chain
      .then(() => stage.clear())
      .then(() => stage.say(q.ask))
      .then(() => stage.ask(q.placeholder))
      .then((ans) => {
        if (idx === 0) answers.q1 = ans;
        if (idx === 1) answers.q2 = ans;
        if (idx === 2) answers.q3 = ans;
        if (idx === 3) answers.q4 = ans;
        // 提交后 thinking 占位，让问答之间有"正在感受"的节奏（不再瞬切）
        stage.thinking("嗯……");
        return stage.wait(1100).then(() => {
          if (q.react) {
            return stage.clear().then(() =>
              stage.say(q.react, { speed: 90, hold: 700 })
            );
          }
        });
      });
  }, Promise.resolve());
}

function act4Gather() {
  return stage
    .clear()
    .then(() => stage.say(SCRIPT.beforeReveal, { speed: 80, hold: 600 }))
    .then(() => {
      stage.gather(true);
      stage.clear();
      sm.setCameraMode("gather");
      // 主粒子云涌入
      const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches;
      const n = isMobile ? 2600 : 5000;
      particles.spawn(n);
      // thinking 占位：AI 思考期间粒子在预演收缩，台词在"正在读懂你"
      stage.thinking("好……正在读懂你");
      // 同时请求 AI（推理模型可能 5-15s，期间 thinking + 粒子预演撑场）
      return AI.reveal(answers);
    })
    .then((reveal) => {
      revealResult = reveal;
      // AI 返回后立刻 clear 中断 thinking，进 act5
      return stage.clear();
    });
}

function act5Reveal() {
  // 由情绪描述符生成 3D 形态目标点云
  const { archetype, hue, energy, line } = revealResult;
  const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const n = isMobile ? 2600 : 5000;
  const form = generateForm(archetype, n, hue, energy);

  stage.gather(false);
  // 台词优先：先开始打揭晓台词，让用户第一时间"被读懂"
  // 同时粒子开始汇聚（视觉与文字同步展开）
  sm.setCameraMode("reveal", archetype);
  particles.formTo(form, archetype);
  const sayPromise = stage.say(line, { reveal: true, speed: 55, hold: 999999 });

  // 等汇聚真正完成（formTo 单粒子最长 delay~1.15 + dur 3.0 ≈ 4.2s）
  // 台词打字通常 3-5s（25 字 × 55ms），两者并行
  return Promise.all([sayPromise, stage.wait(4200)]).then(() =>
    stage.wait(5000)
  );
}

function act6Farewell() {
  sm.setCameraMode("farewell");
  particles.disperse();
  return stage
    .clear()
    .then(() => stage.wait(1800))
    .then(() => {
      const line = SCRIPT.farewell.replace(/\{name\}/g, answers.name || "旅人");
      return stage.say(line, { speed: 75, hold: 4000 });
    })
    .then(() => {
      particles.clear();
      return stage.clear();
    });
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
        .say("……魔术，今天先到这里。")
        .then(() => stage.clear())
        .then(() => {
          if (particles) particles.clear();
        });
    });
}

onMounted(() => {
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
