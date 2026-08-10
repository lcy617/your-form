// 粒子系统（真 3D + 自定义 ShaderMaterial）
//
// v3 重写要点：
//   - 真 3D 位置（z 有深度），透视相机下有纵深感
//   - 自定义着色器：软圆点 + 亮核 + 透视尺寸衰减（取代 PointsMaterial + glowTexture）
//   - ambient 星场：对话期就有的多深度漂浮星点（解决"前几幕零粒子"的单调）
//   - 主粒子云：spawn(涌入) → formTo(螺旋编织汇聚到 3D 形态) → breathe(呼吸) → disperse(3D 消散)
//   - 鼠标视差交给 CameraRig，这里不再处理鼠标
//
// 数据契约：每粒子一条 data：{x,y,z, tx,ty,tz, bx,by,bz(呼吸锚点), sx,sy,sz(螺旋中间量), vx,vy,vz, alpha, targetAlpha, size, seed, color{r,g,b}, delay, formT}
import * as THREE from "three";
import gsap from "gsap";
import { PARTICLE_VERT, PARTICLE_FRAG } from "./shaders.js";

export class Particles {
  constructor(sceneMgr) {
    this.sm = sceneMgr;
    this.points = null; // 主粒子云 THREE.Points
    this.geo = null;
    this.mat = null;
    this.data = [];
    this.mode = "idle";
    this.time = 0;

    // ambient 星场（独立 Points，常驻）
    this._ambient = null;

    this._spawnAmbient();
  }

  // —— ambient 星场：对话期就有的背景星点 —— //
  _spawnAmbient() {
    const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches;
    const n = isMobile ? 320 : 700;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const seeds = new Float32Array(n);

    // 暖金/冷蓝/暖红 三色微弱星点
    const palette = [
      [0.85, 0.78, 0.55],
      [0.5, 0.65, 0.9],
      [0.85, 0.6, 0.6],
    ];

    for (let i = 0; i < n; i++) {
      // 散布在很大的球壳内，制造多深度
      const r = 400 + Math.random() * 1600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];

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

  // —— 共享的自定义材质工厂 —— //
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

  // —— 生成 n 个主粒子（从远处球壳涌入）—— //
  spawn(n) {
    this._disposeMesh();
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const seeds = new Float32Array(n);
    this.data = [];

    for (let i = 0; i < n; i++) {
      // 从远处球壳涌入（多方向，z 有深度）
      const r = 1400 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // 临时中性色，formTo 时会被目标色覆盖
      colors[i * 3] = 0.7;
      colors[i * 3 + 1] = 0.7;
      colors[i * 3 + 2] = 0.7;

      sizes[i] = 7 + Math.random() * 16;
      alphas[i] = 0;
      seeds[i] = Math.random();

      this.data.push({
        x, y, z,
        tx: 0, ty: 0, tz: 0,     // 目标
        bx: 0, by: 0, bz: 0,     // 呼吸锚点
        vx: 0, vy: 0, vz: 0,     // 速度
        alpha: 0,
        targetAlpha: 0.65 + Math.random() * 0.35,
        size: sizes[i],
        seed: Math.random() * Math.PI * 2,
        color: { r: 0.7, g: 0.7, b: 0.7 },
        hasTarget: false,
        // 螺旋汇聚用
        delay: 0,
        formT: 0,            // 0→1 汇聚进度
        startAng: 0,
        targetAng: 0,
        startR: r,
        targetR: 0,
      });
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
    this.mode = "gather";

    // 涌入：alpha 渐显 + 向中心区域缓流
    for (const d of this.data) {
      gsap.to(d, { alpha: d.targetAlpha, duration: 1.8, ease: "power2.out", delay: Math.random() * 0.6 });
    }
  }

  // —— 螺旋编织式汇聚到目标形态 —— //
  // form 是 { positions: Float32Array(3n), colors: Float32Array(3n) }
  formTo(form) {
    const fpos = form.positions;
    const fcol = form.colors;
    const n = Math.min(this.data.length, fpos.length / 3);
    if (n === 0) return;

    // 收集目标点并按距原点排序，决定汇聚先后（外圈先动 / 内圈先动皆可，这里外圈先）
    const targets = [];
    for (let i = 0; i < n; i++) {
      targets.push({
        x: fpos[i * 3],
        y: fpos[i * 3 + 1],
        z: fpos[i * 3 + 2],
        r: Math.hypot(fpos[i * 3], fpos[i * 3 + 1], fpos[i * 3 + 2]),
        idx: i,
      });
    }

    // 把粒子按"当前距原点远近"与"目标距原点远近"做匹配：远的粒子去远的目标，制造有序感
    const orderedData = [...this.data].sort((a, b) => {
      const da = Math.hypot(a.x, a.y, a.z);
      const db = Math.hypot(b.x, b.y, b.z);
      return db - da; // 远的在前
    });
    targets.sort((a, b) => b.r - a.r);

    this._formStart = this.time;
    const dur = 3.0;

    for (let k = 0; k < n; k++) {
      const d = orderedData[k];
      const t = targets[k];
      d.tx = t.x; d.ty = t.y; d.tz = t.z;
      d.bx = t.x; d.by = t.y; d.bz = t.z;
      // 目标颜色
      const ci = t.idx;
      d.color.r = fcol[ci * 3];
      d.color.g = fcol[ci * 3 + 1];
      d.color.b = fcol[ci * 3 + 2];

      d.hasTarget = true;
      // 延迟按目标半径决定：内圈(半径小)晚到 → 外圈先编织，内核最后点亮
      d.delay = THREE.MathUtils.clamp(t.r / 260, 0, 1) * 0.9 + Math.random() * 0.25;
      d.formT = 0;

      // 用 GSAP 驱动 formT 0→1（这里是汇聚进度的主驱动）
      gsap.to(d, {
        formT: 1,
        duration: dur,
        ease: "power2.inOut",
        delay: d.delay,
      });

      // 同步 alpha 略增（汇聚时更亮）
      gsap.to(d, { alpha: Math.min(1, d.targetAlpha + 0.15), duration: dur, ease: "power2.out", delay: d.delay });
    }

    this.mode = "form";
  }

  // —— 消散（3D 向外飞散 + 淡出）—— //
  disperse() {
    this.mode = "disperse";
    for (const d of this.data) {
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      // 沿径向加速外飞，加随机扰动
      const ux = d.x / len, uy = d.y / len, uz = d.z / len;
      const sp = 250 + Math.random() * 500;
      gsap.to(d, {
        x: d.x + ux * sp + (Math.random() - 0.5) * 200,
        y: d.y + uy * sp + (Math.random() - 0.5) * 200,
        z: d.z + uz * sp + (Math.random() - 0.5) * 200,
        alpha: 0,
        duration: 2.4,
        ease: "power2.in",
        delay: Math.random() * 0.5,
      });
      d.hasTarget = false;
    }
  }

  clear() {
    this._disposeMesh();
    this.data = [];
    this.mode = "idle";
  }

  _disposeMesh() {
    gsap.killTweensOf(this.data);
    if (this.points) {
      this.sm.scene.remove(this.points);
      if (this.geo) this.geo.dispose();
      if (this.mat) this.mat.dispose();
      this.points = null;
      this.geo = null;
      this.mat = null;
    }
  }

  // —— 每帧更新 —— //
  update(dt) {
    this.time += dt;

    // ambient 星场：uniform 时间 + 轻微旋转
    if (this._ambient) {
      this._ambient.mat.uniforms.uTime.value = this.time;
      this._ambient.points.rotation.y += dt * 0.01;
      this._ambient.points.rotation.x += dt * 0.004;
    }

    if (!this.points) return;
    this.mat.uniforms.uTime.value = this.time;

    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const alp = this.geo.attributes.aAlpha.array;
    const m = this.mode;

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];

      if (m === "gather") {
        // 向中心缓流 + 球面噪声扰动
        const dist = Math.hypot(d.x, d.y, d.z) + 0.01;
        const pull = 60 * dt;
        d.vx += (-d.x / dist) * pull;
        d.vy += (-d.y / dist) * pull;
        d.vz += (-d.z / dist) * pull;
        d.vx *= 0.95; d.vy *= 0.95; d.vz *= 0.95;
        // 噪声扰动
        d.vx += Math.sin(this.time * 0.7 + d.seed) * 18 * dt;
        d.vy += Math.cos(this.time * 0.8 + d.seed) * 18 * dt;
        d.vz += Math.sin(this.time * 0.6 + d.seed * 1.3) * 18 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      } else if (m === "form") {
        if (d.hasTarget) {
          // 螺旋编织：用 formT 在"当前位置(螺旋弧)"与"目标"间插值
          // 起点用粒子当时位置，构造一条绕轴的弧线
          if (d.formT < 1) {
            const t = d.formT;
            const eased = t * t * (3 - 2 * t); // smoothstep
            // 螺旋中间量：从起点绕 Y 轴转半圈到目标方向，半径先大后小
            const ang = d.startAng + (d.targetAng - d.startAng) * eased;
            const rad = d.startR * (1 - eased) + Math.hypot(d.tx, d.ty, d.tz) * eased * 0.6 + 80 * Math.sin(eased * Math.PI);
            // 主体直接插值到目标，外加一个螺旋偏置（在垂直于行进方向上摆动）
            const spiralAmt = (1 - eased) * 90;
            const offX = Math.cos(ang * 3 + d.seed) * spiralAmt;
            const offZ = Math.sin(ang * 3 + d.seed) * spiralAmt;
            d.x = lerp(d.x, d.tx, Math.min(1, dt * 4)) + offX * dt * 2;
            d.y = lerp(d.y, d.ty, Math.min(1, dt * 4));
            d.z = lerp(d.z, d.tz, Math.min(1, dt * 4)) + offZ * dt * 2;
          } else {
            // 汇聚完成后：呼吸 + 微噪声，让形态"活着"
            const breathe = Math.sin(this.time * 1.1 + d.seed) * 3.5;
            const swirl = Math.sin(this.time * 0.4 + d.seed * 2) * 2.0;
            d.x = d.bx + Math.cos(d.seed) * breathe + swirl;
            d.y = d.by + Math.sin(d.seed * 1.3) * breathe;
            d.z = d.bz + Math.cos(d.seed * 0.7) * breathe;
          }
        }
      }
      // disperse：GSAP 直接驱动 x/y/z/alpha

      pos[i * 3] = d.x;
      pos[i * 3 + 1] = d.y;
      pos[i * 3 + 2] = d.z;

      // 颜色：随 alpha 调亮（消散时变暗），保持目标色
      const k = d.alpha;
      col[i * 3] = d.color.r * k;
      col[i * 3 + 1] = d.color.g * k;
      col[i * 3 + 2] = d.color.b * k;
      alp[i] = 1; // 用 vertexColor 乘 alpha 体现明暗；aAlpha 通道保持 1（颜色已含 k）
      // 说明：着色器里 vAlpha=aAlpha，这里把"亮度"塞进 color，aAlpha 维持 1，
      // 这样消散时是"变暗淡出"而非"整点消失"，更柔和。
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  hasParticles() {
    return this.points != null && this.data.length > 0;
  }

  dispose() {
    this._disposeMesh();
    if (this._ambient) {
      this.sm.scene.remove(this._ambient.points);
      this._ambient.geo.dispose();
      this._ambient.mat.dispose();
      this._ambient = null;
    }
  }
}

// —— 线性插值工具 —— //
function lerp(a, b, t) {
  return a + (b - a) * t;
}
