// 舞台控制器：打字机、输入框显隐、转场
// 由 App.vue 注入 DOM 元素引用
export function createStage(els) {
  // els: { dialogue: HTMLElement, inputWrap: HTMLElement, input: HTMLInputElement, send: HTMLElement }
  const { dialogue: dialogueEl, inputWrap, input: inputEl, send: sendBtn } = els;

  const Stage = {};

  Stage.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  Stage.clear = () => {
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

  // 转场压暗
  Stage.gather = (on) => {
    document.body.classList.toggle("gathering", !!on);
  };

  return Stage;
}
