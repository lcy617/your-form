# 异乡旅人 · 一场为你而停的 3D 粒子读心仪式

> 一个来自另一个魔法世界的旅人，路过此地，偶然发现了你。
> 在他那里，人能"看见"心的颜色和形状。他为你停了一会儿。
> 先在星空下与你对话，问你的心事、你的颜色、你的愿望、你是否相信魔术。
> 然后粒子从远处球壳**螺旋涌入**，编织成一个专属于你的抽象情绪形态——
> 星云、漩涡、绽放、流瀑、晶格、极光，
> 颜色与能量都来自 AI 对你心境的解读。
> 最后他带走你给的颜色，留下一抹光，继续他的旅途。
> 2~3 分钟一场的仪式感表演。

## 技术栈

- **Three.js + postprocessing(Bloom)** —— 真 3D 透视空间 + 电影级辉光，质感核心
- **自定义 ShaderMaterial** —— 软圆点 + 亮核 + 透视尺寸衰减（不再依赖贴图，纯着色器绘制柔光）
- **GSAP** —— 粒子汇聚的缓动韵律（power2.inOut）
- **Vue 3 + Vite** —— 工程组织与打包
- ACES 色调映射 + AdditiveBlending 叠加
- **情绪驱动的 3D 形态生成器** —— 六大原型 × 色相 × 能量，几乎场场不重样

## 架构

```
Vite 打包 → GitHub Pages (前端)
                ↓ fetch
        Cloudflare Worker (免费代理，藏 API Key)
                ↓
        阿里通义 DashScope (qwen3.7-plus，负责"读心")
```

不配 Worker 时 AI 自动走 fallback（预设库），整场表演照样能完整演完。

## 表演流程（六幕 · 全程有粒子 + 即时反馈）

1. **相遇**：旅人从星空而来，星场先于台词入场，三句建立世界观，问名字
2. **相识**：AI 个性化招呼（异乡旅人口吻）
3. **对话**：4 个问题（心事 / 颜色 / 想看见什么 / 是否信魔术）
   - **每题答完即时反应**：本地提取关键词填入旅人台词（如"压力……我，接住了"），不等 AI
   - **颜色题 0ms 即时染色**：答完瞬间粒子就染成用户说的颜色（蓝→hue215、金→hue45…），眼见为实
4. **凝视**：粒子从远处涌入，AI 思考期间旅人**分层低语**（0s/4s/8s 三句，引用具体答案）撑场，AI 到达后显示深化低语（murmur）
5. **揭晓**：粒子编织成专属 3D 抽象形态（六大原型之一），相机环绕，AI 揭晓台词浮现
6. **告别**：粒子飞散**带走用户给的颜色**（伏笔回收）→ 旅人回收"信不信"伏笔（反转：这，也许就是魔术）→ 留下一抹光余韵

### 三条伏笔（前埋后收）

| 钩子 | 埋点 | 回收 |
|------|------|------|
| **颜色** | 第3幕"我把它，变成真的光" + 即时染色 | 第6幕"你给我的颜色，我带走了" |
| **信不信** | 第3幕"在我那里这叫看见" | 第6幕反转"一个异乡人看见了真正的你，这也许就是魔术" |
| **旅途** | 第1幕"路过你的世界我停了一下" | 第6幕"该走了" + 留一抹光 |

### AI 等待期为何不卡死（设计核心）

AI 调用要 5-15s。这段时间用「**本地即时反应 + 分层渐进低语 + AI 延迟深化**」三段式撑场：

```
用户提交答案 ──0ms──▶ 粒子即时染色 + 旅人低语引用关键词（本地，立即可见）
            ──0/4/8s──▶ 分层低语继续"读懂你"（引用心事/颜色/愿望）
            ──AI到达──▶ AI 的 murmur 深化低语覆盖（个性化高潮）
```

任何时候页面都不会静止超过 1.5s。

### 六大情绪原型

| archetype | 形态 | 情绪语义 |
|-----------|------|----------|
| `nebula` | 体积星云 | 沉思 / 静谧 |
| `vortex` | 双臂漩涡星系 | 涌动 / 蜕变 |
| `bloom` | 曼陀罗绽放 | 希望 / 生长 |
| `cascade` | 倾泻流瀑 | 释怀 / 哀愁 |
| `crystal` | 几何晶格（二十面体线框） | 清明 / 决断 |
| `aurora` | 起伏光帘 | 梦境 / 超脱 |

每场访问 = 原型 × 色相 hue[0~360] × 能量 energy[0~1] → 配色与形态几乎不重样。

---

## 本地开发

```bash
npm install      # 安装依赖（three, postprocessing, gsap, vite, vue）
npm run dev      # 启动开发服务器，默认 http://localhost:5173
npm run build    # 打包到 dist/
npm run preview  # 预览打包产物
```

> `config.js` 的 `workerUrl` 留空时走 fallback，方便先看整体效果。

## 部署到 GitHub Pages

### 1. 打包
```bash
npm run build
```
生成 `dist/` 目录（含 index.html + assets）。

### 2. 推送 dist 到 GitHub Pages
两种方式：

**方式 A（推荐）：用 gh-pages 分支**
```bash
npm run build
npx gh-pages -d dist   # 把 dist 推到 gh-pages 分支
```
然后仓库 Settings → Pages → Source 选 `gh-pages` 分支。

**方式 B：把 dist 内容推到 main 的 docs/ 或根目录**
把 `dist/` 里的内容复制到仓库根目录或 `docs/`，Settings → Pages 选对应分支和目录。

> **重要**：`vite.config.js` 已设 `base: "./"`，打包产物用相对路径，部署到任意子路径（`用户名.github.io/仓库名/`）都正常。

### 3. 配置 Worker（可选，想要真读心时做）

1. [阿里云百炼](https://bailian.console.aliyun.com/) → API-KEY 管理 → 创建 `sk-xxx`
2. [Cloudflare](https://dash.cloudflare.com/) → Workers & Pages → 创建 Worker → 粘贴 `worker/worker.js`
3. Worker Settings → Variables → 添加 `DASHSCOPE_KEY` = 你的 `sk-xxx`
4. 把 Worker 地址填入 `src/lib/config.js` 的 `workerUrl`
5. 重新 `npm run build` 并部署

---

## 文件结构

```
├── index.html              # Vite 入口
├── package.json            # three, postprocessing, gsap, vite, vue
├── vite.config.js          # base:'./' + @ 别名
├── src/
│   ├── main.js             # createApp 挂载
│   ├── App.vue             # 六幕编排 + 渲染循环 + 相机模式切换
│   ├── style.css           # 黑底 + 多层径向渐变呼吸背景
│   ├── lib/
│   │   ├── config.js       # workerUrl / model / 超时（部署后唯一要改的）
│   │   ├── stage.js        # 打字机 / 输入框 / 转场（带令牌防并发写）
│   │   ├── script.js       # 剧本（异乡旅人世界观 + 关键词模板 + 伏笔 + fallback 库）
│   │   ├── keywords.js     # 本地即时反应引擎（关键词提取 / 颜色→hue / 信念解析）
│   │   └── ai.js           # 两次 AI 调用 + 超时/解析/fallback（输出 archetype/hue/energy/line/murmur）
│   └── three/
│       ├── shaders.js          # 自定义粒子着色器（vert+frag 字符串）
│       ├── form-generator.js   # 六大原型 3D 形态生成 + HSL 配色
│       ├── camera-rig.js       # 相机编排：漂移/推近/环绕/拉远 + 鼠标视差
│       ├── SceneManager.js     # 透视相机/renderer(ACES)/Bloom/resize/dispose
│       └── particles.js        # 主粒子云：涌入/汇聚/呼吸/消散 + ambient 星场 + tintHue 即时染色 + 留光余韵
├── worker/worker.js        # Cloudflare Worker 代理脚本（透明，无需改动）
└── README.md
```

## 改气质

| 想改什么 | 改哪里 |
|---------|--------|
| 世界观 / 台词 / 问题 | `src/lib/script.js` |
| 兜底揭晓形态库 | `src/lib/script.js` 的 `fallbackReveals`（archetype/hue/energy/line/murmur） |
| 伏笔 / 反转 / 结尾 | `src/lib/script.js` 的 `farewellBelief` / `farewellColor` / `farewell` |
| 分层低语时序 | `src/lib/script.js` 的 `murmurs` + `src/App.vue` 的 `act4Gather` 的 `slots` |
| 关键词提取规则 | `src/lib/keywords.js` 的 `extractKeyword` / 停用词表 |
| 颜色词 → hue 映射 | `src/lib/keywords.js` 的 `COLOR_MAP` |
| 信不信判定 | `src/lib/keywords.js` 的 `parseBelief` |
| 新增/调整形态算法 | `src/three/form-generator.js` 的 `GENERATORS` |
| 配色规则（HSL 抖动） | `src/three/form-generator.js` 的 `colorFor()` |
| 镜头运动节奏 | `src/three/camera-rig.js` 的 `setMode()` |
| 粒子软光/亮核 | `src/three/shaders.js`（vert 的 gl_PointSize、frag 的 smoothstep/core） |
| Bloom 辉光强度 | `src/three/SceneManager.js` 的 `BloomEffect` |
| 即时染色时长 | `src/three/particles.js` 的 `tintHue(dur)` |
| 粒子数量 | `src/App.vue` 的 `act4Gather` / `act5Reveal` 里 `n` |
| 汇聚速度 | `src/three/particles.js` 的 `formTo()` 里 `dur` |
| 打字机速度 | `src/App.vue` 各幕的 `Stage.say(...)` 参数 |
| 通义模型 | `src/lib/config.js` 的 `model` |
| AI 提示词 / 形态选项 | `src/lib/ai.js` 的 system 消息 |

## 健壮性

- AI 失败 → 走预设库，表演不中断
- JSON 解析失败 → 正则兜底提取 emoji + 文字
- emoji 像素采样失败 → 直接显示 emoji 文字
- 任何抛错 → 降级落幕台词，不黑屏
- resize/dispose 彻底清理 Three.js 资源

## 安全

- API Key 只存在 Cloudflare Worker 环境变量，绝不出现在前端代码 / GitHub 仓库
- `worker/worker.js` 可公开（不含 Key），Key 是部署时单独配的
- 切勿把 `sk-xxx` 写进 `src/` 任何文件提交到 GitHub
