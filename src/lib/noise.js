// 噪声工具 —— teamLab 风格"活生态"的核心：curl noise 流场
//
// 这是本项目"廉价/机械感"的根治：原代码注释里到处写"絮流""有机感"，
// 但实际用 sin/cos + 极坐标硬编了六原型运动，没有任何真实噪声。
// 这里基于 three 自带的 SimplexNoise 实现 curl noise（无散度流场），
// 让粒子像水流/烟雾一样永不重复地有机流动。
//
// 性能：每点 6 次 noise3d（中心差分求旋度）。~2500 粒子 ≈ 1.5 万次/帧，可接受。
//       若后续要扛更多粒子，再升级到 GPU（手写 GLSL snoise + FBO ping-pong）。
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";

// 单例噪声（固定 seed，流场稳定可复现）
const _noise = new SimplexNoise();

// 三个分量用不同 offset 区分，构成向量势 ψ = (ψx, ψy, ψz)
const OFF_Y = 19.1;
const OFF_Z = 83.7;
const EPS = 0.1;
const EPS2 = 2 * EPS;

const n = (x, y, z) => _noise.noise3d(x, y, z);

/**
 * curl noise —— 返回位置 (px,py,pz) 处的无散度流场速度（向量势的旋度）。
 * 无散度意味着粒子既不堆积也不空洞，像真正的流体。
 *
 * @param {number[]} out  复用的输出数组 [x,y,z]
 * @param {number} px,py,pz  采样世界位置
 * @param {number} scale  流场单元大小系数（越大越平滑；位置 × scale 作为噪声输入）
 * @returns {number[]} out
 */
export function curl(out, px, py, pz, scale) {
  if (scale === undefined) scale = 0.0028;
  const x = px * scale, y = py * scale, z = pz * scale;

  // ψx = n(x,y,z), ψy = n(x, y+OFF_Y, z), ψz = n(x, y, z+OFF_Z)
  // curl_x = dψz/dy - dψy/dz
  const dPsiZ_dy = (n(x, y + EPS, z + OFF_Z) - n(x, y - EPS, z + OFF_Z)) / EPS2;
  const dPsiY_dz = (n(x, y + OFF_Y, z + EPS) - n(x, y + OFF_Y, z - EPS)) / EPS2;
  out[0] = dPsiZ_dy - dPsiY_dz;

  // curl_y = dψx/dz - dψz/dx
  const dPsiX_dz = (n(x, y, z + EPS) - n(x, y, z - EPS)) / EPS2;
  const dPsiZ_dx = (n(x + EPS, y, z + OFF_Z) - n(x - EPS, y, z + OFF_Z)) / EPS2;
  out[1] = dPsiX_dz - dPsiZ_dx;

  // curl_z = dψy/dx - dψx/dy
  const dPsiY_dx = (n(x + EPS, y + OFF_Y, z) - n(x - EPS, y + OFF_Y, z)) / EPS2;
  const dPsiX_dy = (n(x, y + EPS, z) - n(x, y - EPS, z)) / EPS2;
  out[2] = dPsiY_dx - dPsiX_dy;

  return out;
}
