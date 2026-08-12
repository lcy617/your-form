// 舞台控制器：打字机、输入框显隐、转场
// 由 App.vue 注入 DOM 元素引用
export function createStage(els) {
  // els: { dialogue: HTMLElement, inputWrap: HTMLElement, input: HTMLInputElement, send: HTMLElement }
  const { dialogue: dialogueEl, inputWrap, input: inputEl, send: sendBtn } = els;

  // 对话令牌:每次 clear/say 递增,旧 say 检测到 token 变化则自停,避免并发写 DOM
  let sayGen = 0;

  const Stage = {};

  Stage.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  Stage.clear = () => {
    // 中断正在进行的 thinking + say(令牌递增,旧 tick 自停)
    sayGen++;
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
      const myGen = ++sayGen; // 本次 say 拿到独立令牌
      const alive = () => sayGen === myGen; // 令牌未被更新 = 本次 say 仍有效

      const start = () => {
        if (!alive()) { resolve(); return; } // 启动前已被取消
        dialogueEl.textContent = "";
        dialogueEl.className = "dialogue typing" + (reveal ? " reveal" : "");
        void dialogueEl.offsetWidth;
        dialogueEl.classList.add("visible");

        let i = 0;
        const tick = () => {
          if (!alive()) { resolve(); return; } // 被 clear/新 say 取消,停止写 DOM
          if (i <= text.length) {
            dialogueEl.textContent = text.slice(0, i);
            i++;
            setTimeout(tick, speed);
          } else {
            setTimeout(() => {
              if (alive()) dialogueEl.classList.remove("typing");
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

  // —— AI 思考期间的占位台词（可被 clear/say 中断，不自动 resolve）—— //
  // 用途：AI 请求期间显示"……让我看看你"，避免舞台空白像卡死。
  // 关键：① 立即显示完整文字（不打字机、不等淡出）——占位要快，不能留空窗
  //       ② 永不 resolve，靠下一次 Stage.clear()/say() 的令牌递增使其失效
  Stage.thinking = (text) => {
    text = text || "……";
    const myGen = ++sayGen; // thinking 也占一个令牌,后续 clear/say 会使其失效
    return new Promise(() => {
      dialogueEl.textContent = text;
      dialogueEl.className = "dialogue thinking visible";
    });
  };

  // 转场压暗
  Stage.gather = (on) => {
    document.body.classList.toggle("gathering", !!on);
  };

  return Stage;
}
