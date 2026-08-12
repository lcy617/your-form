// 相机编排 —— 让镜头"活"起来，制造真 3D 纵深与电影感
//
// 状态机：intro(对话期漂移) → gather(推进) → reveal(环绕展示) → farewell(后拉)
// 用 lerp 平滑趋近目标位置/朝向，每帧由 SceneManager.render 链调用 update(dt)
//
// 设计：相机始终看向原点(0,0,0)（粒子形态中心），自身在球面上运动。
// 每个状态定义目标距离/高度/角速度，update 里用阻尼趋近 + 持续环绕。

import * as THREE from "three";
import gsap from "gsap";
import { Input } from "../lib/input.js";

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this._target = new THREE.Vector3(0, 0, 0);

    // 当前相机在球面坐标（绕原点）
    this.dist = 950;
    this.height = 0;
    this.angle = 0;          // 水平角
    this.angleSpeed = 0;     // 角速度（弧度/秒）

    // 目标值（lerp 趋近用）
    this._tDist = 950;
    this._tHeight = 0;
    this._tAngleSpeed = 0.02;

    // mouse parallax（轻量视差）—— 鼠标源改用共享 lib/input.js
    // (粒子也读它做 teamLab 式响应;避免 camera-rig 与 particles 各挂一套 window 监听)
    this._mx = 0;
    this._my = 0;
    this._tmx = 0;
    this._tmy = 0;

    this._sync();
  }

  // 切换状态：用 GSAP 做距离/高度的过渡，角速度直接设
  // reveal 模式可传 archetype，按原型差异化镜头（展示各自最有辨识度的角度）
  setMode(mode, archetype) {
    switch (mode) {
      case "intro":
        // 对话期：稍远，极缓漂移
        gsap.to(this, { _tDist: 950, _tHeight: 40, duration: 2.5, ease: "power2.inOut" });
        this._tAngleSpeed = 0.025;
        break;
      case "gather":
        // 汇聚期：推进到中近距离
        gsap.to(this, { _tDist: 720, _tHeight: 30, duration: 3.2, ease: "power2.inOut" });
        this._tAngleSpeed = 0.05;
        break;
      case "reveal": {
        // 揭晓期：按原型调相机，展示各自最有辨识度的角度
        let dist = 600, height = 50, speed = 0.12;
        switch (archetype) {
          case "cascade":
            // 瀑布纵向：拉远 + 略低视角，展示高度落差
            dist = 780; height = -40; speed = 0.06;
            break;
          case "aurora":
            // 极光波浪：俯视，展示 z 方向的波浪起伏
            dist = 700; height = 280; speed = 0.07;
            break;
          case "crystal":
            // 晶格：加速旋转，绕一圈展示所有棱角
            dist = 640; height = 30; speed = 0.22;
            break;
          case "vortex":
            // 漩涡：侧斜俯视，看双臂螺旋
            dist = 680; height = 180; speed = 0.1;
            break;
          case "bloom":
            // 绽放：正视稍俯，看花瓣开合
            dist = 620; height = 120; speed = 0.09;
            break;
          case "nebula":
          default:
            // 星云：标准环绕
            dist = 600; height = 50; speed = 0.12;
            break;
        }
        gsap.to(this, { _tDist: dist, _tHeight: height, duration: 2.2, ease: "power2.out" });
        this._tAngleSpeed = speed;
        break;
      }
      case "farewell":
        // 落幕期：后拉
        gsap.to(this, { _tDist: 1200, _tHeight: 0, duration: 2.4, ease: "power2.inOut" });
        this._tAngleSpeed = 0.03;
        break;
    }
  }

  update(dt) {
    // 平滑趋近目标距离/高度
    this.dist += (this._tDist - this.dist) * Math.min(1, dt * 1.6);
    this.height += (this._tHeight - this.height) * Math.min(1, dt * 1.6);
    this.angleSpeed += (this._tAngleSpeed - this.angleSpeed) * Math.min(1, dt * 1.2);

    // 鼠标源从共享 Input 读(particles 也读它)
    this._tmx = Input.x;
    this._tmy = Input.y;
    // 鼠标视差平滑
    this._mx += (this._tmx - this._mx) * Math.min(1, dt * 2.5);
    this._my += (this._tmy - this._my) * Math.min(1, dt * 2.5);

    // 持续环绕
    this.angle += this.angleSpeed * dt;

    // 视差叠加在角度/高度上（小幅度）
    const ang = this.angle + this._mx * 0.18;
    const h = this.height + this._my * 50;

    this.camera.position.x = Math.sin(ang) * this.dist;
    this.camera.position.z = Math.cos(ang) * this.dist;
    this.camera.position.y = h;
    this.camera.lookAt(this._target);
  }

  dispose() {
    // 鼠标监听已移到 lib/input.js,由 App.vue 统一 start/stop,这里不再解绑
    gsap.killTweensOf(this);
  }

  _sync() {
    this.camera.position.set(0, this.height, this.dist);
    this.camera.lookAt(this._target);
  }
}
