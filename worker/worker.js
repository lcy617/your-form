/* Cloudflare Worker —— 通义大模型 API 代理
   作用：藏 API Key + 加 CORS 头 + 转发到 DashScope（OpenAI 兼容接口）。
   部署步骤见 README.md。 */
const DASHSCOPE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!env.DASHSCOPE_KEY) {
      return new Response(JSON.stringify({ error: "worker not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const body = await request.text();
      const upstream = await fetch(DASHSCOPE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.DASHSCOPE_KEY,
        },
        body: body,
      });
      const respText = await upstream.text();
      return new Response(respText, {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("Content-Type") || "application/json",
          ...corsHeaders,
        },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "upstream error", detail: String(e) }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  },
};
