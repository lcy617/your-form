// 共享鼠标/触摸输入 —— camera-rig 与 particles 都从这里读，避免两套 window 监听
//
// 动机：teamLab 化后粒子也要响应鼠标（局部排斥），加上相机视差，
//        若各自挂 mousemove 会有两个监听 + 两套平滑。统一到本模块。
//
// 约定：x,y ∈ [-1,1]，原点(0,0)在屏幕中心。
//       x: 右正；y: 屏幕坐标方向（下正，与 clientY 一致，camera-rig 原约定）。
//       消费方若需 WebGL NDC（上正），自行取 -y。
let _x = 0, _y = 0;     // 当前值（原始，未平滑——平滑交给消费方，各自需要不同时间常数）
let _started = false;

function _onMove(e) {
  const t = e.touches ? e.touches[0] : e;
  _x = (t.clientX / window.innerWidth - 0.5) * 2;
  _y = (t.clientY / window.innerHeight - 0.5) * 2;
}

export const Input = {
  start() {
    if (_started) return;
    _started = true;
    window.addEventListener("mousemove", _onMove, { passive: true });
    window.addEventListener("touchmove", _onMove, { passive: true });
  },
  stop() {
    if (!_started) return;
    _started = false;
    window.removeEventListener("mousemove", _onMove);
    window.removeEventListener("touchmove", _onMove);
  },
  /** 当前鼠标 NDC（屏幕坐标方向，下正）。 */
  get x() { return _x; },
  get y() { return _y; },
  /** 鼠标是否曾移动过（用于粒子决定要不要做鼠标排斥）。 */
  get hasMoved() { return _x !== 0 || _y !== 0; },
};
