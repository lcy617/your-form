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
    this.archetype = "nebula"; // 当前形态原型（formTo 时设置），驱动特征运动

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

  // —— 汇聚到目标形态（formT 驱动真插值，清掉旧的死代码螺旋）—— //
  // form 是 { positions: Float32Array(3n), colors: Float32Array(3n) }
  // archetype 用于 update() 的特征运动分发
  formTo(form, archetype) {
    const fpos = form.positions;
    const fcol = form.colors;
    const n = Math.min(this.data.length, fpos.length / 3);
    if (n === 0) return;
    this.archetype = archetype || "nebula";

    // 收集目标点并按距原点排序
    const targets = [];
    for (let i = 0; i < n; i++) {
      const tx = fpos[i * 3], ty = fpos[i * 3 + 1], tz = fpos[i * 3 + 2];
      targets.push({
        x: tx, y: ty, z: tz,
        r: Math.hypot(tx, ty, tz),
        idx: i,
      });
    }

    // 远粒子去远目标，制造有序汇聚
    const orderedData = [...this.data].sort((a, b) => {
      const da = Math.hypot(a.x, a.y, a.z);
      const db = Math.hypot(b.x, b.y, b.z);
      return db - da;
    });
    targets.sort((a, b) => b.r - a.r);

    this._formStart = this.time;
    const dur = 3.0;

    for (let k = 0; k < n; k++) {
      const d = orderedData[k];
      const t = targets[k];
      // 记录起点（汇聚插值用）
      d.sx = d.x; d.sy = d.y; d.sz = d.z;
      // 目标 = 呼吸锚点
      d.tx = t.x; d.ty = t.y; d.tz = t.z;
      d.bx = t.x; d.by = t.y; d.bz = t.z;
      // 存极坐标（特征运动用：旋转/花瓣/波浪需要）
      d.baseR = t.r;
      d.baseAng = Math.atan2(t.z, t.x);   // xz 平面角
      d.basePhi = Math.acos(THREE.MathUtils.clamp(t.y / (t.r || 1), -1, 1)); // 极角
      // 目标颜色
      const ci = t.idx;
      d.color.r = fcol[ci * 3];
      d.color.g = fcol[ci * 3 + 1];
      d.color.b = fcol[ci * 3 + 2];

      d.hasTarget = true;
      d.delay = THREE.MathUtils.clamp(t.r / 260, 0, 1) * 0.9 + Math.random() * 0.25;
      d.formT = 0;

      gsap.to(d, {
        formT: 1,
        duration: dur,
        ease: "power2.inOut",
        delay: d.delay,
      });
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
        // AI 延迟期间的"预演收缩"：粒子向中心缓慢聚拢（暗示"正在凝练"），不是无目的翻滚
        // 缓慢减速向心 + 旋转下沉，让等待变成表演的一部分
        const dist = Math.hypot(d.x, d.y, d.z) + 0.01;
        // 向心拉力随时间增强（越等越聚拢，制造期待）
        const pull = (40 + this.time * 4) * dt;
        d.vx += (-d.x / dist) * pull;
        d.vy += (-d.y / dist) * pull;
        d.vz += (-d.z / dist) * pull;
        d.vx *= 0.93; d.vy *= 0.93; d.vz *= 0.93;
        // 缓慢切向旋转（让粒子云有"搅拌"感，不是直愣愣往中心撞）
        d.vx += -d.z * 0.15 * dt;
        d.vz += d.x * 0.15 * dt;
        // 轻微噪声（保持有机感）
        d.vx += Math.sin(this.time * 0.7 + d.seed) * 12 * dt;
        d.vy += Math.cos(this.time * 0.8 + d.seed) * 12 * dt;
        d.vz += Math.sin(this.time * 0.6 + d.seed * 1.3) * 12 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      } else if (m === "form") {
        if (d.hasTarget) {
          if (d.formT < 1) {
            // 汇聚：用 formT 做 smoothstep 真插值（起点 sx/sy/sz → 目标 tx/ty/tz）
            const t = d.formT;
            const eased = t * t * (3 - 2 * t);
            // 弧线路径：加一个垂直于行进方向的摆动，制造"旋入"感
            const swing = (1 - eased) * 60 * Math.sin(eased * Math.PI);
            const swx = Math.cos(d.seed * 3) * swing;
            const swy = Math.sin(d.seed * 2.7) * swing;
            const swz = Math.sin(d.seed * 3.1) * swing;
            d.x = d.sx + (d.tx - d.sx) * eased + swx;
            d.y = d.sy + (d.ty - d.sy) * eased + swy;
            d.z = d.sz + (d.tz - d.sz) * eased + swz;
          } else {
            // 汇聚完成 → 按原型分发的特征运动（替代旧的 3.5 单位微抖）
            this._breatheByArchetype(d);
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

  // —— 六大原型各自的"活着"方式（替代旧的统一微抖）—— //
  // d.baseR / baseAng / basePhi 是 formTo 时存的极坐标；围绕锚点做特征运动
  _breatheByArchetype(d) {
    const t = this.time;
    switch (this.archetype) {
      case "vortex": {
        // 集体绕 Y 轴旋转（双臂真的转起来）：角度随时间推进，半径不变
        const ang = d.baseAng + t * 0.3;
        const r = d.baseR;
        const yJit = Math.sin(t * 0.8 + d.seed) * 4;
        d.x = r * Math.sin(d.basePhi) * Math.cos(ang);
        d.y = d.by + yJit;
        d.z = r * Math.sin(d.basePhi) * Math.sin(ang);
        break;
      }
      case "bloom": {
        // 花瓣开合：半径随"花瓣相位"呼吸（6 瓣张合）
        const petalPhase = Math.sin(d.baseAng * 6) * 0.18; // 瓣的位置调制
        const breatheR = d.baseR * (1 + petalPhase * Math.sin(t * 0.7));
        const ang = d.baseAng;
        const phi = d.basePhi;
        d.x = breatheR * Math.sin(phi) * Math.cos(ang);
        d.y = breatheR * Math.cos(phi);
        d.z = breatheR * Math.sin(phi) * Math.sin(ang);
        break;
      }
      case "cascade": {
        // 持续向下流：y 随时间递减，到底部循环回顶部（瀑布感）
        const flow = (t * 45 + d.seed * 80) % 180; // 流动距离周期
        const range = 420; // 形态纵向范围
        let yOff = (flow - 90); // -90 ~ +90
        // 映射到形态内：让粒子在 by 附近上下流动
        d.x = d.bx + Math.sin(t * 0.6 + d.seed) * 5;
        d.y = d.by + Math.sin(yOff * Math.PI / 180) * range * 0.4 - yOff * 0.3;
        d.z = d.bz + Math.cos(t * 0.5 + d.seed) * 4;
        break;
      }
      case "aurora": {
        // 波浪相位推进：sin 波随 time 沿 x 移动（光帘飘动）
        const wavePhase = d.bx * 0.02 + t * 0.8;
        const waveAmp = 70;
        d.x = d.bx + Math.sin(t * 0.4 + d.seed) * 3;
        d.y = d.by + Math.sin(t * 0.5 + d.seed) * 4;
        d.z = d.bz + Math.sin(wavePhase) * waveAmp - Math.sin(d.bx * 0.02) * waveAmp;
        break;
      }
      case "crystal": {
        // 几乎静止 + 极缓自转（展示棱角，强调锐利不糊）
        const ang = d.baseAng + t * 0.06;
        const r = d.baseR;
        d.x = r * Math.sin(d.basePhi) * Math.cos(ang);
        d.y = d.by; // y 不动，保持棱角清晰
        d.z = r * Math.sin(d.basePhi) * Math.sin(ang);
        break;
      }
      case "nebula":
      default: {
        // 星云：整体半径呼吸（±8%）+ 内部絮流
        const breathe = 1 + Math.sin(t * 0.5 + d.seed * 0.5) * 0.08;
        const r = d.baseR * breathe;
        const ang = d.baseAng + Math.sin(t * 0.2 + d.seed) * 0.15;
        const phi = d.basePhi + Math.cos(t * 0.25 + d.seed * 1.3) * 0.1;
        d.x = r * Math.sin(phi) * Math.cos(ang);
        d.y = r * Math.cos(phi);
        d.z = r * Math.sin(phi) * Math.sin(ang);
        break;
      }
    }
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
