/* =============================================================
 * rules.js — 控制规则库前端引擎（控制约束层 / 规则引擎）
 * 依赖：rules.json（由构建脚本或手动同步，与 控制规则库_rule_samples.json 同源）
 * 暴露全局：RuleEngine
 * 设计要点：
 *   - 规则库是“控制约束层”的单一事实来源，与知识库(knowledge.js)、仿真(sim.js)解耦；
 *   - 规则引擎只做确定性判定（边界校验 / 结构匹配 / 反馈话术填充），
 *     判错、拦错、给依据由它完成，大模型只负责表达（本原型未接 LLM，表达即文本反馈）；
 *   - 数值边界来自 rules.json 的 bounds 字段，改 JSON 即改护栏，无需改代码。
 * ============================================================= */
(function (global) {
  'use strict';

  var state = { rules: null, byId: {}, loaded: false };

  /* 异步加载规则 JSON（需经 http 服务，file:// 不可用） */
  function load(url) {
    url = url || 'rules.json';
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        state.rules = data.rules || [];
        state.byId = {};
        state.rules.forEach(function (r) { state.byId[r.id] = r; });
        state.loaded = true;
        return data;
      })
      .catch(function (e) {
        console.warn('[RuleEngine] 规则库加载失败（需经 http 服务运行）：', e);
        /* 离线/路径异常时使用最小内置兜底，保证校验台仍可教学演示。 */
        var fallback = [
          {id:'R-PID-03', category:'PID参数', severity:'warn', bounds:{Kp:{min:0.5,max:7.46}}, feedback_template:'Kp={Kp} 超出推荐范围。'},
          {id:'R-Safe-01', category:'执行器安全', severity:'error', bounds:{开度:{min:0,max:100}}, feedback_template:'阀门开度 {val}% 超出 0–100% 范围。'},
          {id:'R-Safe-02', category:'启停顺序', severity:'error', feedback_template:'启停顺序 {seq} 存在风险：{risk}。'},
          {id:'R-Safe-03', category:'风机水阀联锁', severity:'error', feedback_template:'风机频率 {freq}Hz 低于开阀最小值 {fmin}Hz。'},
          {id:'R-Water-01', category:'供水压力', severity:'warn', bounds:{供水压力设定值:{min:0.3,max:0.6}}, feedback_template:'供水压力 {val} MPa 超出推荐范围。'},
          {id:'R-Loop-01', category:'控制回路', severity:'error', feedback_template:'控制回路缺少必要字段：{missing}。'},
          {id:'R-Mode-02', category:'防冻保护', severity:'error', feedback_template:'当前工况需要启用防冻联锁：{missing}。'},
          {id:'R-Mode-03', category:'焓差节能', severity:'info', feedback_template:'室外焓值 {out_h} 低于室内焓值 {in_h}，可考虑增加新风利用免费冷。'}
        ];
        state.rules = fallback; state.byId = {};
        fallback.forEach(function (r) { state.byId[r.id] = r; });
        state.loaded = true;
        return {rules:fallback, fallback:true};
      });
  }

  function get(id) { return state.byId[id] || null; }
  function all() { return state.rules || []; }
  function isLoaded() { return state.loaded; }

  /* 模板填充：把 {key} 替换为 vars[key]，未提供则保留原样 */
  function fill(tpl, vars) {
    vars = vars || {};
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] !== undefined ? vars[k] : m;
    });
  }

  /* 边界校验：values 形如 { 参数名(同 bounds 键): 数值 }
   * 返回 { checked, passed, violations:[{param,value,min,max,unit}], rule, severity }
   * 仅当规则带 bounds 时 checked=true；否则返回 checked=false（调用方改用其他判定）。 */
  function boundsCheck(ruleId, values) {
    var r = get(ruleId);
    if (!r || !r.bounds) return { checked: false, passed: true, rule: r };
    var viol = [];
    Object.keys(r.bounds).forEach(function (p) {
      if (values[p] === undefined || values[p] === null || values[p] === '') return;
      var b = r.bounds[p];
      var v = Number(values[p]);
      if (isNaN(v)) return;
      if (v < b.min || v > b.max) viol.push({ param: p, value: v, min: b.min, max: b.max, unit: b.unit });
    });
    return {
      checked: true,
      passed: viol.length === 0,
      violations: viol,
      rule: r,
      severity: r.severity
    };
  }

  /* 便捷：生成一条反馈话术（自动把 bounds 的 min/max 注入为 {参数_min}/{参数_max}） */
  function feedback(ruleId, vars) {
    var r = get(ruleId);
    if (!r) return '';
    vars = vars || {};
    if (r.bounds) {
      Object.keys(r.bounds).forEach(function (p) {
        vars[p + '_min'] = r.bounds[p].min;
        vars[p + '_max'] = r.bounds[p].max;
      });
    }
    return fill(r.feedback_template, vars);
  }

  /* 按类别取规则（用于规则校验台列出可演示规则） */
  function byCategory(cat) {
    return all().filter(function (r) { return r.category === cat; });
  }
  function categories() {
    var seen = [], out = [];
    all().forEach(function (r) {
      if (seen.indexOf(r.category) < 0) { seen.push(r.category); out.push(r.category); }
    });
    return out;
  }

  global.RuleEngine = {
    load: load,
    get: get,
    all: all,
    isLoaded: isLoaded,
    fill: fill,
    boundsCheck: boundsCheck,
    feedback: feedback,
    byCategory: byCategory,
    categories: categories
  };
})(window);
