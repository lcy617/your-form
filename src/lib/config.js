// 全站配置 —— 部署后唯一需要改的地方
export const CONFIG = {
  /**
   * 你的 Cloudflare Worker 地址。
   * 部署完 worker/worker.js 后填入，形如：
   *   "https://magician-worker.your-name.workers.dev"
   * 留空字符串则 AI 调用走 fallback（预设库），表演不中断。
   */
  workerUrl: "https://magician.1692664808.workers.dev",

  /** 调用超时（ms）。超时走 fallback。qwen3.7-plus 是推理模型，给宽点。 */
  aiTimeoutMs: 20000,

  /** 通义模型名。qwen3.7-plus 推理质量好且有 100w 免费 token；qwen-turbo 更快更便宜但免费额度常已耗尽。 */
  model: "qwen3.7-plus",
};
