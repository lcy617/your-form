// 粒子系统 v4 —— teamLab 风格"活生态"
//
// 根治转变:从"六个静态原型点云，汇聚后呼吸(死)"→"curl noise 流场驱动的活生命体"
//   - 位置:curl noise 流场每帧 advect + 弱回归(围绕锚点)+ 鼠标局部排斥(teamLab 式响应人)
//   - 生灭:每粒子 life 周期(淡入→盛→淡出→重生),像萤火虫明灭 / 花开花谢
//   - 基因:连续参数(flowSpeed/density/stability/huePrimary/hueSecondary/growthBias)驱动流速/聚集/稳定/色场/生长
//           每个人独一无二;archetype 退化为气质标签,只微调基因偏置,不再驱动几何
//   - 鼠标:camera-rig 与本系统都从 lib/input.js 读,避免两套 window 监听
//
// 对外接口(保留,App.vue 依赖):spawn / formTo / tintHue / disperse / leaveOneBack / clear / update / hasParticles / dispose
import * as THREE from "three";
import gsap from "gsap";
import { PARTICLE_VERT, PARTICLE_FRAG } from "./shaders.js";
import { hslToRgb } from "../lib/color.js";
import { curl } from "../lib/noise.js";
import { Input } from "../lib/input.js";

// —— 默认基因(阶段 A:未接 AI 时用;B 阶段由 ai.js reveal 提供,C 阶段各 act 累积改变) —— //
const DEFAULT_GENES = {
  flowSpeed: 1.0,      // 流速倍率 0.3~2.0:快=激昂/焦虑,慢=沉静
  density: 0.55,       // 聚集度 0~1:高=致密团,低=稀疏散
  stability: 0.6,      // 稳定度 0~1:高=沉稳少飘,低=飘忽多变
  huePrimary: 210,     // 主色相
  hueSecondary: 280,   // 辅色相(主+辅做色彩层次,告别单色廉价感)
  saturation: 0.6,
  growthBias: 0,       // 生长偏向:<0 下沉,>0 上升
};

// archetype → 基因偏置(保留气质标签;不驱动几何,只让每种心境有不同生命感)
const ARCHETYPE_GENES = {
  nebula:  { flowSpeed: 0.7, density: 0.6,  stability: 0.7 },
  vortex:  { flowSpeed: 1.5, density: 0.5,  stability: 0.3 },
  bloom:   { flowSpeed: 0.9, density: 0.65, stability: 0.6 },
  cascade: { flowSpeed: 1.1, density: 0.4,  stability: 0.35 },
  crystal: { flowSpeed: 0.4, density: 0.7,  stability: 0.85 },
  aurora:  { flowSpeed: 1.3, density: 0.45, stability: 0.4 },
};

export class Particles {
  constructor(sceneMgr) {
    this.sm = sceneMgr;
    this.points = null;
    this.geo = null;
    this.mat = null;
    this.data = [];
    this.time = 0;
    this.mode = "idle";

    this.genes = { ...DEFAULT_GENES };
    this.anchor = new THREE.Vector3(0, 0, 0);
    this._formBlend = 0;            // 0=自由流场,1=围绕锚点致密成型
    this._formBlendTween = null;
    this._dispersing = false;

    this._mouseWorld = new THREE.Vector3();
    this._mouseActive = false;
    this._ambientTint = null;
    this._tmp = [0, 0, 0];

    this._spawnAmbient();
  }

  // —— ambient 星场(保留:常驻背景星点,对话期就有,不参与流场) —— //
  _spawnAmbient() {
    const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches;
    const n = isMobile ? 320 : 700;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const seeds = new Float32Array(n);
    const palette = [
      [0.85, 0.78, 0.55],
      [0.5, 0.65, 0.9],
      [0.85, 0.6, 0.6],
    ];
    for (let i = 0; i < n; i++) {
      const r = 400 + Math.random() * 1600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      sizes[i] = 4 + Math.random() * 10;
      alphas[i] = 0.15 + Math.random() * 0.45;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const mat = this._makeMaterial(0.5, 0.12);
    const pts = new THREE.Points(geo, mat);
    this.sm.scene.add(pts);
    this._ambient = { points: pts, geo, mat };
  }

  _makeMaterial(sizeScale, coreBoost) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uTime: { value: 0 },
        uSizeScale: { value: sizeScale },
        uCoreBoost: { value: coreBoost },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
  }

  // —— 初始化主粒子云:散布在生态范围内 + life 错相淡入(萤火虫一只只亮起,而非从远涌入) —— //
  spawn(n) {
    this._disposeMesh();
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const seeds = new Float32Array(n);
    this.data = [];

    const R = 280;
    for (let i = 0; i < n; i++) {
      const r = Math.cbrt(Math.random()) * R;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      sizes[i] = 6 + Math.random() * 14;
      seeds[i] = Math.random();
      this.data.push({
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        size: sizes[i],
        seed: seeds[i] * Math.PI * 2,
        life: Math.random(),
        lifeSpeed: 0.18 + Math.random() * 0.14,
        maxAlpha: 0.5 + Math.random() * 0.5,
        color: { r: 0.7, g: 0.7, b: 0.7 },
        useSec: Math.random() < 0.3,        // 30% 用辅色,做色彩层次
        curlOffset: Math.random() * 100,    // 流场个体偏移,让每粒子轨迹不同
      });
      alphas[i] = 1;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    this.mat = this._makeMaterial(1.0, 0.25);
    this.points = new THREE.Points(this.geo, this.mat);
    this.sm.scene.add(this.points);
    this.mode = "alive";
    this._formBlend = 0;
    this._dispersing = false;
    this._applyColors();
  }

  // —— 按当前基因重算每粒子颜色(主/辅双色 + 抖动) —— //
  _applyColors() {
    if (!this.data.length) return;
    const g = this.genes;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      const hue = d.useSec ? g.hueSecondary : g.huePrimary;
      const h = hue + (Math.random() - 0.5) * 18;
      const s = Math.min(1, g.saturation * (0.8 + Math.random() * 0.3));
      const l = 0.5 + Math.random() * 0.2;
      const [r, gg, b] = hslToRgb(h, s, l);
      d.color.r = r; d.color.g = gg; d.color.b = b;
    }
  }

  // —— 设基因(B 阶段 AI 调,C 阶段各 act 累积调);色场变了自动重染 —— //
  setGenes(partial) {
    Object.assign(this.genes, partial);
    if (partial.huePrimary !== undefined || partial.hueSecondary !== undefined || partial.saturation !== undefined) {
      this._applyColors();
    }
  }

  // —— 即时染色(act3 颜色题兼容接口):ambient 渐染 + 主云改色场基因 —— //
  tintHue(hue, dur = 1.6) {
    if (typeof hue !== "number" || !isFinite(hue)) return;

    // ambient 星场染色(保留:单 tween 驱动进度,重入安全)
    if (this._ambient) {
      const colAttr = this._ambient.geo.attributes.color;
      const arr = colAttr.array;
      const n = arr.length / 3;
      if (this._ambientTint) { gsap.killTweensOf(this._ambientTint); this._ambientTint = null; }
      const from = new Float32Array(n * 3);
      const to = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        from[i * 3] = arr[i * 3]; from[i * 3 + 1] = arr[i * 3 + 1]; from[i * 3 + 2] = arr[i * 3 + 2];
        const h = hue + (Math.random() - 0.5) * 18;
        const s = 0.45 + Math.random() * 0.2;
        const l = 0.6 + Math.random() * 0.2;
        const [r, gg, b] = hslToRgb(h, s, l);
        to[i * 3] = r; to[i * 3 + 1] = gg; to[i * 3 + 2] = b;
      }
      const prog = { t: 0 };
      this._ambientTint = prog;
      gsap.to(prog, {
        t: 1, duration: dur, ease: "power2.out",
        onUpdate: () => { for (let j = 0; j < n * 3; j++) arr[j] = from[j] + (to[j] - from[j]) * prog.t; colAttr.needsUpdate = true; },
        onComplete: () => { this._ambientTint = null; },
      });
    }

    // 主云:改色场基因(主色=用户颜色,辅色 +60° 做层次,告别单色廉价)
    this.genes.huePrimary = hue;
    this.genes.hueSecondary = (hue + 60) % 360;
    this._applyColors();
  }

  // —— 成型(act5):接收完整 reveal,AI 生长基因优先 + archetype 偏置兜底 + 渐进致密成型 —— //
  formTo(reveal) {
    const ag = ARCHETYPE_GENES[reveal.archetype] || ARCHETYPE_GENES.nebula;
    this.setGenes({
      flowSpeed: reveal.flowSpeed ?? ag.flowSpeed,
      density: reveal.density ?? ag.density,
      stability: reveal.stability ?? ag.stability,
      huePrimary: reveal.huePrimary ?? this.genes.huePrimary,
      hueSecondary: reveal.hueSecondary ?? this.genes.hueSecondary,
      growthBias: reveal.growthBias ?? 0,
      saturation: reveal.saturation ?? this.genes.saturation,
    });
    this.anchor.set(0, 0, 0);
    this._dispersing = false;
    if (this._formBlendTween) gsap.killTweensOf(this);
    this._formBlendTween = gsap.to(this, { _formBlend: 1, duration: 3, ease: "power2.inOut" });
    this.mode = "form";
  }

  // —— 消散(act6):关回归 + 离心外飘 + life 加速 + maxAlpha 衰减(有机凋落,非死板飞散) —— //
  disperse() {
    this.mode = "disperse";
    this._dispersing = true;
    if (this._formBlendTween) gsap.killTweensOf(this);
    this._formBlendTween = gsap.to(this, { _formBlend: 0, duration: 1, ease: "power2.out" });
  }

  clear() {
    this._disposeMesh();
    this._clearLeftBehind();
    this.data = [];
    this.mode = "idle";
    this._formBlend = 0;
    this._dispersing = false;
    if (this._formBlendTween) { gsap.killTweensOf(this); this._formBlendTween = null; }
  }

  // —— 余韵:告别时留一小簇在原地缓慢闪烁(保留;呼应"他留下了什么") —— //
  leaveOneBack(hue) {
    this._clearLeftBehind();
    const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches;
    let px = 0, py = 30, pz = 0;
    if (this.data.length > 0) {
      const d = this.data[0];
      px = d.x * 0.3; py = d.y * 0.3 + 20; pz = d.z * 0.3;
    }
    const h = (typeof hue === "number" && isFinite(hue)) ? hue : 210;
    const [r, g, b] = hslToRgb(h, 0.6, 0.7);
    const n = isMobile ? 6 : 10;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const spread = 18;
      positions[i * 3] = px + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = py + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = pz + (Math.random() - 0.5) * spread;
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      sizes[i] = 10 + Math.random() * 8;
      alphas[i] = 0.7 + Math.random() * 0.3;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const mat = this._makeMaterial(1.0, 0.4);
    const pts = new THREE.Points(geo, mat);
    this.sm.scene.add(pts);
    this._leftBehind = { points: pts, geo, mat, baseHue: h };
    this._leftBehindPhase = 0;
  }

  _clearLeftBehind() {
    if (this._leftBehind) {
      gsap.killTweensOf(this._leftBehind);
      this.sm.scene.remove(this._leftBehind.points);
      this._leftBehind.geo.dispose();
      this._leftBehind.mat.dispose();
      this._leftBehind = null;
    }
  }

  _disposeMesh() {
    gsap.killTweensOf(this.data);
    gsap.killTweensOf(this);
    this._formBlendTween = null;
    if (this.points) {
      this.sm.scene.remove(this.points);
      if (this.geo) this.geo.dispose();
      if (this.mat) this.mat.dispose();
      this.points = null;
      this.geo = null;
      this.mat = null;
    }
  }

  // —— 每帧:curl 流场 + 生命周期生灭 + 鼠标局部排斥 + 基因调制 —— //
  update(dt) {
    this.time += dt;

    // ambient 星场:uniform 时间 + 轻微旋转(保留)
    if (this._ambient) {
      this._ambient.mat.uniforms.uTime.value = this.time;
      this._ambient.points.rotation.y += dt * 0.01;
      this._ambient.points.rotation.x += dt * 0.004;
    }

    // 余韵粒子:缓慢闪烁(保留)
    if (this._leftBehind) {
      this._leftBehind.mat.uniforms.uTime.value = this.time;
      this._leftBehindPhase += dt;
      const pts = this._leftBehind.points;
      pts.rotation.y += dt * 0.05;
      const breath = 0.65 + Math.sin(this._leftBehindPhase * 1.2) * 0.35;
      const colAttr = this._leftBehind.geo.attributes.color;
      const arr = colAttr.array;
      const [br, bg, bb] = hslToRgb(this._leftBehind.baseHue, 0.6, 0.7);
      const n = arr.length / 3;
      for (let i = 0; i < n; i++) {
        arr[i * 3] = br * breath;
        arr[i * 3 + 1] = bg * breath;
        arr[i * 3 + 2] = bb * breath;
      }
      colAttr.needsUpdate = true;
    }

    if (!this.points) return;
    this.mat.uniforms.uTime.value = this.time;

    const g = this.genes;
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const alp = this.geo.attributes.aAlpha.array;

    // 基因调制出的全局参数
    const flowK = g.flowSpeed * 26;
    const regStrong = this._formBlend * (0.25 + g.density * 0.5);
    const regFree = 0.05 * (1 - g.density * 0.4);
    const regK = regStrong + regFree;
    const damp = 0.88 + g.stability * 0.10;   // 0.88~0.98:稳定度高=速度衰减快=沉稳
    const growthY = g.growthBias * 12;

    // 鼠标世界点(每帧 unproject 一次)
    this._updateMouseWorld();
    const mw = this._mouseWorld;
    const mouseOn = this._mouseActive;
    const M_RADIUS = 190, M_RADIUS2 = M_RADIUS * M_RADIUS, M_FORCE = 180;

    const dispersing = this._dispersing;
    const lifeDecay = dispersing ? 2.2 : 1.0;  // 消散时生命加速
    const ax = this.anchor.x, ay = this.anchor.y, az = this.anchor.z;

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];

      // 1. curl 流场速度(每粒子加 curlOffset 让轨迹各异)
      curl(this._tmp, d.x, d.y + d.curlOffset, d.z, 0.0028);
      const cvx = this._tmp[0] * flowK;
      const cvy = this._tmp[1] * flowK;
      const cvz = this._tmp[2] * flowK;

      // 2. 弱回归(围绕锚点;成型时强,自由时弱;防飘散到无穷远)
      const rx = (ax - d.x) * regK;
      const ry = (ay - d.y) * regK + growthY;
      const rz = (az - d.z) * regK;

      // 3. 鼠标局部排斥(teamLab 式:手过处粒子被拨开)
      let mfx = 0, mfy = 0, mfz = 0;
      if (mouseOn) {
        const dx = d.x - mw.x, dy = d.y - mw.y, dz = d.z - mw.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < M_RADIUS2 && d2 > 0.01) {
          const dist = Math.sqrt(d2);
          const f = (1 - dist / M_RADIUS) * M_FORCE;
          const inv = 1 / dist;
          mfx = dx * inv * f; mfy = dy * inv * f; mfz = dz * inv * f;
        }
      }

      // 4. 积分(速度 → 位置,带阻尼)
      d.vx = (d.vx + (cvx + rx + mfx) * dt) * damp;
      d.vy = (d.vy + (cvy + ry + mfy) * dt) * damp;
      d.vz = (d.vz + (cvz + rz + mfz) * dt) * damp;

      // 消散:额外离心外飘
      if (dispersing) {
        const dl = Math.hypot(d.x, d.y, d.z) || 1;
        const inv = 1 / dl;
        d.vx += d.x * inv * 40 * dt;
        d.vy += d.y * inv * 40 * dt;
        d.vz += d.z * inv * 40 * dt;
      }

      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;

      // 5. 生命周期(生灭):淡入→盛→淡出→重生 / 消散时停在末端 + maxAlpha 衰减
      d.life += d.lifeSpeed * dt * lifeDecay;
      let lm;
      if (d.life >= 1) {
        if (dispersing) { d.life = 1; d.maxAlpha *= 0.965; lm = 0; }
        else { d.life = 0; d.curlOffset = Math.random() * 100; lm = 0; }
      } else {
        lm = d.life < 0.2 ? d.life / 0.2 : d.life > 0.8 ? 1 - (d.life - 0.8) / 0.2 : 1;
      }
      const a = lm * d.maxAlpha;

      // 6. 写 buffer(亮度走 color,aAlpha 保持 1——沿用原约定,不动 frag shader)
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      col[i * 3] = d.color.r * a;
      col[i * 3 + 1] = d.color.g * a;
      col[i * 3 + 2] = d.color.b * a;
      alp[i] = 1;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  // 鼠标 NDC → 世界点(unproject 到相机前方中间深度 ≈ 粒子云)。y 翻转适配 WebGL NDC。
  _updateMouseWorld() {
    if (!Input.hasMoved) { this._mouseActive = false; return; }
    this._mouseActive = true;
    this._mouseWorld.set(Input.x, -Input.y, 0.5).unproject(this.sm.camera);
  }

  hasParticles() {
    return this.points != null && this.data.length > 0;
  }

  dispose() {
    this._disposeMesh();
    this._clearLeftBehind();
    if (this._ambientTint) { gsap.killTweensOf(this._ambientTint); this._ambientTint = null; }
    if (this._ambient) {
      this.sm.scene.remove(this._ambient.points);
      this._ambient.geo.dispose();
      this._ambient.mat.dispose();
      this._ambient = null;
    }
  }
}
