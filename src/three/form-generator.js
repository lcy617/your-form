// 六大情绪原型 → 3D 粒子目标点云
// 每个生成器接收 (count, hue, energy) 返回 { positions: Float32Array(3n), colors: Float32Array(3n) }
// positions 在世界空间，原点居中；colors 已按 HSL→RGB 并做每粒子微抖动
//
// 原型：
//   nebula  体积星云     —— 沉思/静谧
//   vortex  双臂漩涡星系 —— 涌动/蜕变
//   bloom   曼陀罗绽放   —— 希望/生长
//   cascade 倾泻流瀑     —— 释怀/哀愁
//   crystal 几何晶格     —— 清明/决断
//   aurora  起伏光帘     —— 梦境/超脱

import * as THREE from "three";

// —— 合法原型白名单（ai.js 解析时也用同一份）—— //
export const ARCHETYPES = ["nebula", "vortex", "bloom", "cascade", "crystal", "aurora"];

// 每个原型的"舒适半径"——让形态在相机视野内大小协调
const BASE_R = 240;

// —— 工具：Box-Muller 高斯采样 —— //
function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// —— 工具：HSL→RGB，返回 [0~1] —— //
function hslToRgb(h, s, l) {
  // h: 0~360, s/l: 0~1
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

// —— 主色（hue）+ 能量派生饱和度/明度 + 每粒子抖动 —— //
function colorFor(hue, energy, i) {
  // energy 高 → 更饱和更亮；低 → 更柔更暗
  const baseS = 0.55 + energy * 0.35;
  const baseL = 0.52 + energy * 0.12;
  // 每粒子在主色相附近 ±10° 游走，饱和/明度 ±0.08
  const h = hue + (Math.random() - 0.5) * 22;
  const s = THREE.MathUtils.clamp(baseS + (Math.random() - 0.5) * 0.16, 0.2, 1);
  const l = THREE.MathUtils.clamp(baseL + (Math.random() - 0.5) * 0.18, 0.25, 0.85);
  return hslToRgb(h, s, l);
}

// ============== 六大原型 ============== //

// nebula：体积星云。三轴高斯，中心密外缘稀
function genNebula(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * (0.9 + energy * 0.4);
  for (let i = 0; i < count; i++) {
    // 高斯让中心更密
    let x = gaussian() * R * 0.5;
    let y = gaussian() * R * 0.5;
    let z = gaussian() * R * 0.5;
    // 中心区域额外加一层"核"
    const inCore = Math.random() < 0.25;
    if (inCore) {
      x *= 0.4; y *= 0.4; z *= 0.4;
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const [r, g, b] = colorFor(hue, energy, i);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return { positions, colors };
}

// vortex：双臂漩涡星系。盘面 y 压扁，极坐标螺旋
function genVortex(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * 1.15;
  const arms = 2;
  const turns = 1.5 + energy * 1.5;
  for (let i = 0; i < count; i++) {
    const t = Math.random(); // 0~1 从中心到外缘
    const arm = Math.floor(Math.random() * arms);
    const r = Math.pow(t, 0.7) * R; // 外缘更稀
    const baseAng = (arm / arms) * Math.PI * 2;
    const spiral = t * turns * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.5; // 臂的宽度
    const ang = baseAng + spiral + jitter;
    const yJitter = gaussian() * R * 0.15; // 盘厚（加厚让双臂在 3D 中更易辨）
    positions[i * 3] = Math.cos(ang) * r;
    positions[i * 3 + 1] = yJitter;
    positions[i * 3 + 2] = Math.sin(ang) * r;
    // 内核偏暖白，外缘偏主色
    const localHue = hue + (1 - t) * 30;
    const [r2, g2, b2] = colorFor(localHue, energy * 0.8 + 0.2, i);
    colors[i * 3] = r2 * (0.7 + t * 0.3);
    colors[i * 3 + 1] = g2 * (0.7 + t * 0.3);
    colors[i * 3 + 2] = b2 * (0.7 + t * 0.3);
  }
  return { positions, colors };
}

// bloom：曼陀罗绽放。球面坐标 + sin(θ·瓣数) 调制半径成花瓣
function genBloom(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * 1.0;
  const petals = 6;
  const depth = 0.35 + energy * 0.2;
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2; // 绕 y
    const phi = Math.acos(2 * Math.random() - 1); // 极角 0~π
    // 花瓣调制：在赤道附近(phi≈π/2)最强，两极收
    const petalMod = 0.55 + 0.45 * Math.abs(Math.sin(theta * petals) * Math.sin(phi));
    const r = R * petalMod * (0.85 + Math.random() * 0.15);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) * depth;
    const [r2, g2, b2] = colorFor(hue + (Math.random() - 0.5) * 18, energy, i);
    colors[i * 3] = r2;
    colors[i * 3 + 1] = g2;
    colors[i * 3 + 2] = b2;
  }
  return { positions, colors };
}

// cascade：倾泻流瀑。x 高斯、y 纵向流、z 高斯厚度
function genCascade(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * 1.1;
  const height = R * 1.8;
  const width = R * 0.7;
  for (let i = 0; i < count; i++) {
    // y 从顶部到底部线性分布（有流的感觉）
    const yT = Math.random();
    const y = (0.5 - yT) * height;
    // 越往下越散开（瀑布溅开）
    const spread = 0.5 + yT * 0.6;
    const x = gaussian() * width * 0.35 * spread;
    const z = gaussian() * width * 0.25 * spread;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    // 从上到下色相微移（顶部偏冷亮，底部偏暖沉）
    const localHue = hue + (0.5 - yT) * 30;
    const localEnergy = energy * (0.7 + yT * 0.4);
    const [r, g, b] = colorFor(localHue, localEnergy, i);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return { positions, colors };
}

// crystal：几何晶格。二十面体顶点 + 边细分成线框云
function genCrystal(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * 1.05;

  // 二十面体 12 个顶点（黄金比例）
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len * R, v[1] / len * R, v[2] / len * R];
  });

  // 找出所有边（顶点对距离 ≈ 边长）
  const edgeLen = 2 * R / Math.sqrt(t * t + 1) * 1.05;
  const edges = [];
  for (let a = 0; a < verts.length; a++) {
    for (let b = a + 1; b < verts.length; b++) {
      const d = Math.hypot(
        verts[a][0] - verts[b][0],
        verts[a][1] - verts[b][1],
        verts[a][2] - verts[b][2]
      );
      if (d < edgeLen) edges.push([a, b]);
    }
  }

  // 把粒子均分到各条边上，沿边随机分布 + 少量体心粒子
  const perEdge = Math.floor(count * 0.85 / edges.length);
  let idx = 0;
  for (const [a, b] of edges) {
    for (let k = 0; k < perEdge && idx < count; k++, idx++) {
      const s = Math.random();
      const jitter = () => gaussian() * R * 0.015;
      positions[idx * 3] = verts[a][0] + (verts[b][0] - verts[a][0]) * s + jitter();
      positions[idx * 3 + 1] = verts[a][1] + (verts[b][1] - verts[a][1]) * s + jitter();
      positions[idx * 3 + 2] = verts[a][2] + (verts[b][2] - verts[a][2]) * s + jitter();
      const [r, g, bb] = colorFor(hue, energy, idx);
      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = bb;
    }
  }
  // 剩余粒子放体心填充
  for (; idx < count; idx++) {
    const r = Math.random() * R * 0.4;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    positions[idx * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[idx * 3 + 1] = r * Math.cos(ph);
    positions[idx * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const [r2, g2, b2] = colorFor(hue, energy, idx);
    colors[idx * 3] = r2;
    colors[idx * 3 + 1] = g2;
    colors[idx * 3 + 2] = b2;
  }
  return { positions, colors };
}

// aurora：起伏光帘。x 横展、z=sin(x) 波浪、y 高斯薄层
function genAurora(count, hue, energy) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const R = BASE_R * 1.3;
  const waves = 1.5 + energy * 1.5;
  const amp = R * 0.35;
  for (let i = 0; i < count; i++) {
    const x = gaussian() * R * 0.55;
    const waveZ = Math.sin((x / R) * Math.PI * 2 * waves) * amp;
    const yJitter = gaussian() * R * 0.10; // 降低 y 抖动，别糊掉波浪
    const zJitter = gaussian() * R * 0.08;
    positions[i * 3] = x;
    positions[i * 3 + 1] = yJitter;
    positions[i * 3 + 2] = waveZ + zJitter;
    // 沿 x 轴色相流动，营造极光的多色带
    const localHue = hue + (x / R) * 40;
    const [r, g, b] = colorFor(localHue, energy, i);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return { positions, colors };
}

// —— 注册表 —— //
const GENERATORS = {
  nebula: genNebula,
  vortex: genVortex,
  bloom: genBloom,
  cascade: genCascade,
  crystal: genCrystal,
  aurora: genAurora,
};

/**
 * 生成一个情绪原型的 3D 粒子目标点云。
 * @param {string} archetype 原型名（非法时回退 nebula）
 * @param {number} count 粒子数
 * @param {number} hue [0,360] 主色相
 * @param {number} energy [0,1] 能量
 * @returns {{positions: Float32Array, colors: Float32Array}}
 */
export function generateForm(archetype, count, hue, energy) {
  const gen = GENERATORS[archetype] || genNebula;
  const h = THREE.MathUtils.clamp(Number(hue) || 200, 0, 360);
  const e = THREE.MathUtils.clamp(Number(energy) || 0.5, 0, 1);
  return gen(Math.max(1, count | 0), h, e);
}
