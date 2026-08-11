// 舞台控制器：打字机、输入框显隐、转场
// 由 App.vue 注入 DOM 元素引用
export function createStage(els) {
  // els: { dialogue: HTMLElement, inputWrap: HTMLElement, input: HTMLInputElement, send: HTMLElement }
  const { dialogue: dialogueEl, inputWrap, input: inputEl, send: sendBtn } = els;

  const Stage = {};

  Stage.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  Stage.clear = () => {
    // 中断正在进行的 thinking（设置标志，tick 循环检测到会自停）
    dialogueEl.dataset.stopThinking = "1";
    dialogueEl.classList.remove("visible");
    return Stage.wait(450).then(() => {
      dialogueEl.textContent = "";
      dialogueEl.className = "dialogue";
    });
  };

  // 打字机输出一句台词
  Stage.say = (text, opts) => {
    opts = opts || {};
    const speed = opts.speed || 70;
    const hold = opts.hold != null ? opts.hold : 900;
    const reveal = opts.reveal || false;

    return new Promise((resolve) => {
      const start = () => {
        dialogueEl.textContent = "";
        dialogueEl.className = "dialogue typing" + (reveal ? " reveal" : "");
        void dialogueEl.offsetWidth;
        dialogueEl.classList.add("visible");

        let i = 0;
        const tick = () => {
          if (i <= text.length) {
            dialogueEl.textContent = text.slice(0, i);
            i++;
            setTimeout(tick, speed);
          } else {
            setTimeout(() => {
              dialogueEl.classList.remove("typing");
              resolve();
            }, hold);
          }
        };
        tick();
      };

      if (dialogueEl.classList.contains("visible")) {
        dialogueEl.classList.remove("visible");
        setTimeout(start, 500);
      } else {
        start();
      }
    });
  };

  // 显示输入框，返回用户输入
  Stage.ask = (placeholder) => {
    inputEl.value = "";
    inputEl.placeholder = placeholder || "……";
    inputWrap.classList.remove("hidden");
    void inputWrap.offsetWidth;
    inputWrap.classList.add("visible");
    setTimeout(() => inputEl.focus(), 350);

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const val = (inputEl.value || "").trim();
        inputWrap.classList.remove("visible");
        setTimeout(() => inputWrap.classList.add("hidden"), 500);
        cleanup();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          finish();
        }
      };
      const onClick = () => finish();
      const cleanup = () => {
        inputEl.removeEventListener("keydown", onKey);
        sendBtn.removeEventListener("click", onClick);
      };
      inputEl.addEventListener("keydown", onKey);
      sendBtn.addEventListener("click", onClick);
    });
  };

  // —— AI 思考期间的占位台词（可被 clear 中断，不自动 resolve）—— //
  // 用途：AI 请求期间显示"……让我看看你"，避免舞台空白像卡死。
  // 关键：它永不 resolve，靠下一次 Stage.clear() 强制打断 → 无缝接真实台词。
  Stage.thinking = (text) => {
    text = text || "……";
    return new Promise((resolve) => {
      const start = () => {
        dialogueEl.textContent = "";
        // thinking 复用 typing class（带光标），加 thinking class 触发省略号呼吸动画
        dialogueEl.className = "dialogue typing thinking";
        void dialogueEl.offsetWidth;
        dialogueEl.classList.add("visible");

        let i = 0;
        const speed = 80;
        const tick = () => {
          // _stopThinking 标志由 clear() 设置，用于中断正在打字的 thinking
          if (dialogueEl.dataset.stopThinking === "1") {
            delete dialogueEl.dataset.stopThinking;
            return; // 停止 tick，不 resolve（让 clear 接管 DOM）
          }
          if (i <= text.length) {
            dialogueEl.textContent = text.slice(0, i);
            i++;
            setTimeout(tick, speed);
          } else {
            // 打完不 resolve，保持显示直到被 clear 打断
            // （thinking 的意义就是"占位等待"，不应该自己结束）
          }
        };
        tick();
      };

      if (dialogueEl.classList.contains("visible")) {
        dialogueEl.classList.remove("visible");
        setTimeout(start, 500);
      } else {
        start();
      }
    });
  };

  // 转场压暗
  Stage.gather = (on) => {
    document.body.classList.toggle("gathering", !!on);
  };

  return Stage;
}
