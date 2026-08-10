// 全站配置 —— 部署后唯一需要改的地方
export const CONFIG = {
  /**
   * 你的 Cloudflare Worker 地址。
   * 部署完 worker/worker.js 后填入，形如：
   *   "https://magician-worker.your-name.workers.dev"
   * 留空字符串则 AI 调用走 fallback（预设库），表演不中断。
   */
  workerUrl: "",

  /** 调用超时（ms）。超时走 fallback。 */
  aiTimeoutMs: 12000,

  /** 通义模型名。qwen-turbo 最便宜，qwen-plus 质量更好。 */
  model: "qwen-turbo",
};
