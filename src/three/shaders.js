// 自定义粒子着色器
// —— 把"方块像素点"变成"电影级柔光圆点 + 发光核心"的核心
//
// 顶点着色器：透视尺寸衰减（越远越小），自定义 attribute（aSize/aAlpha/aSeed）
// 片元着色器：软圆 smoothstep + 亮核 boost，配合 AdditiveBlending + Bloom 出辉光

export const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;     // 每粒子随机种子，供片元做微小变化

  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uSizeScale;  // 全局尺寸倍率（汇聚/消散时可调）

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vSeed = aSeed;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // 透视尺寸衰减：距离越远越小（真 3D 纵深的核心）
    // -mvPosition.z 是相机空间的正距离（相机朝 -z 看）
    float dist = max(-mvPosition.z, 1.0);
    // 轻微呼吸：每粒子按 seed 错相，避免整体齐刷刷
    float pulse = 0.92 + 0.08 * sin(uTime * 1.6 + aSeed * 6.2831);
    gl_PointSize = aSize * uSizeScale * (300.0 / dist) * uPixelRatio * pulse;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const PARTICLE_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uCoreBoost; // 亮核强度（揭晓时调高）

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    // gl_PointCoord: 0~1 方块内坐标，(0.5,0.5) 为中心
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    // 方块外直接丢弃（保证圆形）
    if (d > 0.5) discard;

    // 软边：从中心 1.0 平滑衰减到边缘 0.0
    float soft = smoothstep(0.5, 0.0, d);
    // 亮核：中心一小圈更亮，模拟"光珠"质感
    float core = smoothstep(0.32, 0.0, d);

    vec3 col = vColor + core * uCoreBoost;
    float alpha = soft * vAlpha;

    gl_FragColor = vec4(col, alpha);
  }
`;
