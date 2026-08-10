// SceneManager —— 场景/透视相机/渲染器/Bloom 的初始化、resize、dispose
//
// v3 重写要点：
//   - 正交相机 → 透视相机（真 3D 纵深）
//   - 接入 CameraRig 做镜头编排
//   - 移除 glowTexture（自定义着色器内嵌柔光）
//   - 保留 ACES 色调映射 + Bloom 辉光 + resize/dispose 契约
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";
import { CameraRig } from "./camera-rig.js";

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.rig = null;
    this._init();
  }

  _init() {
    const W = this.W, H = this.H;

    // 场景
    this.scene = new THREE.Scene();
    this.scene.background = null; // 透明，露出 CSS 背景层

    // 透视相机：FOV 60，近/远裁面给足空间容下形态半径 ~300
    this.camera = new THREE.PerspectiveCamera(60, W / H, 1, 4000);
    this.camera.position.set(0, 0, 950);
    this.camera.lookAt(0, 0, 0);

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0); // 透明，露 aura
    this.container.appendChild(this.renderer.domElement);

    // Bloom 后期辉光
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({
          intensity: 1.15,
          luminanceThreshold: 0.18,
          luminanceSmoothing: 0.14,
          mipmapBlur: true,
        })
      )
    );

    // 相机编排器
    this.rig = new CameraRig(this.camera);

    this.clock = new THREE.Clock();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
  }

  // 镜头模式切换（透传给 rig）
  setCameraMode(mode) {
    if (this.rig) this.rig.setMode(mode);
  }

  resize() {
    const W = (this.W = window.innerWidth);
    const H = (this.H = window.innerHeight);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
    this.composer.setSize(W, H);
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.rig) this.rig.update(dt);
    this.composer.render(dt);
    return dt;
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (this.rig) this.rig.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
