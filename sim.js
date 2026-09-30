/* =============================================================
 * sim.js — 空调机组串级/单回路控制虚拟调试仿真引擎
 * 纯前端离散仿真，输出真实动态响应曲线与控制指标。
 * 暴露全局：PID、simulate、computeMetrics、clamp
 * ============================================================= */
(function (global) {
  'use strict';

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // 位置式离散 PID（带条件积分抗饱和）
  function PID(Kp, Ki, Kd, dt) {
    this.Kp = Kp; this.Ki = Ki; this.Kd = Kd; this.dt = dt;
    this.integral = 0; this.prevErr = 0; this.first = true;
  }
  PID.prototype.reset = function () { this.integral = 0; this.prevErr = 0; this.first = true; };
  PID.prototype.step = function (err, outMin, outMax) {
    var deriv = this.first ? 0 : (err - this.prevErr) / this.dt;
    this.first = false;
    var u_unsat = this.Kp * err + this.Ki * this.integral + this.Kd * deriv;
    var u = u_unsat;
    if (u > outMax) u = outMax;
    if (u < outMin) u = outMin;
    // 条件积分：仅在未朝饱和方向继续累积时积分，避免积分饱和
    var saturated = (u_unsat > outMax && err > 0) || (u_unsat < outMin && err < 0);
    if (!saturated) this.integral += err * this.dt;
    this.prevErr = err;
    return u;
  };

  /*
   * simulate(cfg) 空调机组送风温度控制仿真
   * cfg:
   *   mode:   'cascade' | 'single'
   *   Kp_o,Ki_o,Kd_o : 外环(送风温度)参数
   *   Kp_i,Ki_i,Kd_i : 内环(盘管/阀后温度)参数（仅 cascade 使用）
   *   sp:     送风温度设定值 (°C)
   *   T_air_in: 进风温度 (°C)
   *   T_water: 冷水温度 (°C)
   *   distTime: 负荷扰动发生时间 (s)
   *   distMag:  负荷扰动幅值 (°C, 进风温度阶跃)
   *   T:      总仿真时间 (s)
   * 返回 {tArr, saArr, spArr, vArr, coilArr}
   */
  function simulate(cfg) {
    var dt = 0.2;
    var T = cfg.T || 120;
    var steps = Math.round(T / dt);
    var tau_in = 2.0;   // 盘管(内环)时间常数，较快
    var tau_out = 6.0;  // 送风温度(外环)时间常数，较慢

    var Tcoil = cfg.T_air_in;
    var Tsa = cfg.T_air_in;

    var pidOut = new PID(cfg.Kp_o, cfg.Ki_o, cfg.Kd_o, dt);
    var pidIn = new PID(cfg.Kp_i, cfg.Ki_i, cfg.Kd_i, dt);

    var tArr = [], saArr = [], spArr = [], vArr = [], coilArr = [];

    for (var k = 0; k <= steps; k++) {
      var t = k * dt;
      var TairIn = cfg.T_air_in + ((t >= cfg.distTime && cfg.distMag) ? cfg.distMag : 0);

      var v;
      if (cfg.mode === 'cascade') {
        var eo = cfg.sp - Tsa; // 外环：直接作用（Tcoil_sp 越高→Tsa 越热）
        var Tcoil_sp = pidOut.step(eo, cfg.T_water, TairIn + 5);
        Tcoil_sp = clamp(Tcoil_sp, cfg.T_water, TairIn + 5);
        var ei = Tcoil - Tcoil_sp; // 内环：反作用（阀门开度越大→盘管越冷）
        v = pidIn.step(ei, 0, 100);
      } else {
        var eo2 = Tsa - cfg.sp; // 单回路：反作用
        v = pidOut.step(eo2, 0, 100);
      }
      v = clamp(v, 0, 100);

      // 被控对象：阀门开度 -> 盘管目标温度 -> 送风温度
      var TcoilTarget = TairIn - (TairIn - cfg.T_water) * (v / 100);
      Tcoil += (dt / tau_in) * (TcoilTarget - Tcoil);
      var TsaTarget = Tcoil; // 空气经过盘管被冷却至接近盘管温度
      Tsa += (dt / tau_out) * (TsaTarget - Tsa);

      tArr.push(t);
      spArr.push(cfg.sp);
      saArr.push(Tsa);
      vArr.push(v);
      coilArr.push(Tcoil);
    }

    return { tArr: tArr, saArr: saArr, spArr: spArr, vArr: vArr, coilArr: coilArr, cfg: cfg };
  }

  // 计算控制指标
  function computeMetrics(res) {
    var sp = res.spArr[0];
    var sa = res.saArr;
    var n = sa.length;
    var finalErr = sp - sa[n - 1];

    // 最大偏差（瞬态过程中与设定值的最大绝对偏差）
    var maxDev = 0;
    for (var i = 0; i < n; i++) {
      var d = Math.abs(sa[i] - sp);
      if (d > maxDev) maxDev = d;
    }

    // 调节时间：首次进入并保持在 ±2% band 内的时刻
    var band = 0.02 * Math.abs(sp) + 0.1;
    var settleT = null;
    var settledFrom = -1;
    for (var j = 0; j < n; j++) {
      if (Math.abs(sa[j] - sp) <= band) {
        if (settledFrom < 0) settledFrom = j;
      } else {
        settledFrom = -1;
      }
      if (settledFrom >= 0 && (j - settledFrom) * 0.2 >= 4) { // 持续4秒
        settleT = res.tArr[j];
        break;
      }
    }

    // RMS 误差
    var sse = 0;
    for (var m = 0; m < n; m++) sse += Math.pow(sa[m] - sp, 2);
    var rms = Math.sqrt(sse / n);

    return {
      finalErr: finalErr,
      maxDev: maxDev,
      settleT: settleT,
      rms: rms
    };
  }

  // 推荐参数预设
  var PRESETS = {
    cascade_good: { mode: 'cascade', Kp_o: 1.2, Ki_o: 0.15, Kd_o: 0, Kp_i: 2.5, Ki_i: 0.6, Kd_i: 0 },
    cascade_poor: { mode: 'cascade', Kp_o: 4.0, Ki_o: 1.2, Kd_o: 0, Kp_i: 6.0, Ki_i: 2.0, Kd_i: 0 },
    single_good: { mode: 'single', Kp_o: 0.9, Ki_o: 0.10, Kd_o: 0, Kp_i: 0, Ki_i: 0, Kd_i: 0 },
    single_poor: { mode: 'single', Kp_o: 3.0, Ki_o: 0.8, Kd_o: 0, Kp_i: 0, Ki_i: 0, Kd_i: 0 }
  };

  /* =============================================================
   * 焓差控制 / 过渡季变新风量控制仿真
   * ============================================================= */

  // 饱和水蒸气分压 (kPa)，Magnus 公式
  function pws(t) { return 0.61078 * Math.exp(17.27 * t / (t + 237.3)); }

  // 湿空气物性：给定干球温度 t(℃)、相对湿度 rh(%)
  // 返回 {pw: 水蒸气分压 kPa, d: 含湿量 kg/kg干空气, h: 焓 kJ/kg干空气}
  function psychrometrics(t, rh) {
    var pw = pws(t) * (rh / 100);
    var P = 101.325;
    var d = 0.622 * pw / (P - pw);
    var h = 1.005 * t + d * (2500 + 1.86 * t);
    return { pw: pw, d: d, h: h };
  }

  /*
   * freshAirStrategy(inC, outC, opts)
   *   inC : {t, rh} 室内设计/回风条件
   *   outC: {t, rh} 室外气象条件
   * 控制逻辑（教学简化、清晰）：
   *   1) 室外比室内热(out.t >= in.t+2)        -> 最小新风，机械制冷为主
   *   2) 冬季偏冷(out.t <= 10)                -> 最小新风，防冻/加热
   *   3) 室外焓低于室内(dh>0) 且温度适宜      -> 焓差变新风，免费冷
   *   4) 其余(室外更湿热)                     -> 最小新风
   * 返回 {mode, freshRatio, freeCoolFrac, coolIndex, saveRate, hIn, hOut, dh}
   */
  function freshAirStrategy(inC, outC, opts) {
    opts = opts || {};
    var minF = opts.minFresh != null ? opts.minFresh : 0.10;
    var pin = psychrometrics(inC.t, inC.rh);
    var pout = psychrometrics(outC.t, outC.rh);
    var hIn = pin.h, hOut = pout.h, dh = hIn - hOut;
    var mode, fresh, freeCool = 0;
    if (outC.t >= inC.t + 2) {
      mode = '最小新风（机械制冷）'; fresh = minF;
    } else if (outC.t <= 10) {
      mode = '最小新风（防冻/加热）'; fresh = minF;
    } else if (dh > 0) {
      mode = '焓差变新风（免费冷）';
      fresh = clamp(minF + (dh / Math.max(hIn, 1)) * (0.9 - minF), minF, 0.95);
      freeCool = clamp(dh / Math.max(hIn, 1), 0, 1);
    } else {
      mode = '最小新风（室外更湿热）'; fresh = minF;
    }
    // 制冷能耗指数（相对，基准 100 = 最小新风机械制冷）
    var coolIndex = 100 * (1 - 0.8 * freeCool);
    var saveRate = (100 - coolIndex) / 100;
    return { mode: mode, freshRatio: fresh, freeCoolFrac: freeCool, coolIndex: coolIndex, saveRate: saveRate, hIn: hIn, hOut: hOut, dh: dh };
  }

  // 典型日室外气象（24 点 [温度℃, 湿度%]）
  function dayProfile(season) {
    if (season === 'summer') {
      // 夏季：炎热潮湿，室外焓全天高于室内
      return [[28,68],[29,67],[30,66],[32,65],[34,63],[35,62],[36,61],[36,61],[35,62],[34,63],[33,64],[31,65],
              [30,66],[30,65],[31,64],[32,63],[33,62],[34,61],[35,60],[35,60],[34,61],[32,62],[30,64],[29,66]];
    }
    // transition 过渡季：温湿度适宜，室外焓多数时间低于室内
    return [[12,52],[11,53],[11,52],[12,51],[14,50],[16,49],[18,48],[19,47],[20,46],[20,47],[19,48],[18,49],
            [17,50],[16,51],[16,50],[15,50],[14,51],[14,50],[13,51],[13,50],[12,51],[12,50],[12,52],[12,51]];
  }

  /*
   * simulateDay(season, inC, opts) 典型日逐时仿真
   * 返回 {hours, freshArr(%), coolArr, modeArr, hOutArr, hIn}
   */
  function simulateDay(season, inC, opts) {
    opts = opts || {};
    var prof = dayProfile(season);
    var hours = [], freshArr = [], coolArr = [], modeArr = [], hOutArr = [];
    var hIn = psychrometrics(inC.t, inC.rh).h;
    for (var i = 0; i < prof.length; i++) {
      var outC = { t: prof[i][0], rh: prof[i][1] };
      var r = freshAirStrategy(inC, outC, opts);
      hours.push(i); freshArr.push(r.freshRatio * 100); coolArr.push(r.coolIndex); modeArr.push(r.mode); hOutArr.push(r.hOut);
    }
    return { hours: hours, freshArr: freshArr, coolArr: coolArr, modeArr: modeArr, hOutArr: hOutArr, hIn: hIn, season: season };
  }

  global.PID = PID;
  global.simulate = simulate;
  global.computeMetrics = computeMetrics;
  global.clamp = clamp;
  global.SIM_PRESETS = PRESETS;
  global.psychrometrics = psychrometrics;
  global.freshAirStrategy = freshAirStrategy;
  global.dayProfile = dayProfile;
  global.simulateDay = simulateDay;
})(window);
