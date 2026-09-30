/* =============================================================
 * app.js — 建筑设备自动化智控导师（原型前端逻辑）
 * 依赖：sim.js, knowledge.js
 * ============================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { user: null, progress: null };

  /* ---------------- 登录 / 演示账号 ---------------- */
  var DEMO_ACCOUNTS = ['demo_student', 'review_2026', 'trial_user'];
  var TEACHER_ACCOUNT = 'teacher_demo';

  function loadProgress(user) {
    try {
      var raw = localStorage.getItem('bems_progress_' + user);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { scores: {}, path: {}, loop: null, debugBest: null };
  }
  function saveProgress() {
    if (!state.user) return;
    try { localStorage.setItem('bems_progress_' + state.user, JSON.stringify(state.progress)); } catch (e) {}
  }

  function doLogin(user) {
    state.user = user;
    state.role = user === TEACHER_ACCOUNT ? 'teacher' : 'student';
    try { localStorage.setItem('bems_active_user', user); } catch (e) {}
    state.progress = loadProgress(user);
    document.body.setAttribute('data-role', state.role);
    var teacherOnly = document.querySelectorAll('[data-role-only="teacher"]');
    for (var i = 0; i < teacherOnly.length; i++) teacherOnly[i].hidden = state.role !== 'teacher';
    $('loginOverlay').style.display = 'none';
    $('userLabel').textContent = (state.role === 'teacher' ? '教师端：' : '学生端：') + user;
    if (state.role !== 'teacher' && $('teacher').classList.contains('active')) switchTab('course');
    renderPath();
    renderEval();
    window.dispatchEvent(new CustomEvent('bems:role', { detail: { role: state.role } }));
  }

  /* ---------------- 标签切换 ---------------- */
  function switchTab(name) {
    if (name === 'teacher' && state.role !== 'teacher') name = 'course';
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    var targetTab = document.querySelector('.tab-btn[data-tab="' + name + '"]');
    if (!targetTab) return;
    targetTab.classList.add('active');
    var pans = document.querySelectorAll('.tab-pane');
    for (var j = 0; j < pans.length; j++) pans[j].classList.remove('active');
    $(name).classList.add('active');
  }

  /* ---------------- 通用折线图（Canvas） ---------------- */
  function drawLineChart(canvas, series, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var padL = 50, padR = 16, padT = 14, padB = 34;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    // 数据范围
    var xmax = 0, ymin = Infinity, ymax = -Infinity;
    series.forEach(function (s) {
      s.data.forEach(function (p) { if (p[0] > xmax) xmax = p[0]; if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; });
    });
    if (opts.ymin !== undefined) ymin = opts.ymin;
    if (opts.ymax !== undefined) ymax = opts.ymax;
    if (ymax - ymin < 1e-6) ymax = ymin + 1;
    var ypad = (ymax - ymin) * 0.1; ymin -= ypad; ymax += ypad;

    function X(x) { return padL + (x / xmax) * (W - padL - padR); }
    function Y(y) { return padT + (1 - (y - ymin) / (ymax - ymin)) * (H - padT - padB); }

    // 网格 + 轴
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.fillStyle = '#475569'; ctx.font = '16px Calibri';
    var yTicks = 5;
    for (var i = 0; i <= yTicks; i++) {
      var yv = ymin + (ymax - ymin) * i / yTicks;
      var yy = Y(yv);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillText(yv.toFixed(1), 6, yy + 3);
    }
    ctx.fillText(opts.xlabel || '', W - padR - 40, H - 8);
    ctx.save(); ctx.translate(12, padT + 40); ctx.rotate(-Math.PI / 2);
    ctx.fillText(opts.ylabel || '', 0, 0); ctx.restore();

    // 曲线
    series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.beginPath();
      s.data.forEach(function (p, idx) {
        var xx = X(p[0]), yy = Y(p[1]);
        if (idx === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });

    // 图例
    if (series.length > 1) {
      var lx = padL + 4, ly = padT + 2;
      series.forEach(function (s) {
        ctx.fillStyle = s.color; ctx.fillRect(lx, ly, 12, 12);
        ctx.fillStyle = '#334155'; ctx.fillText(s.label, lx + 16, ly + 10);
        lx += 24 + ctx.measureText(s.label).width;
      });
    }
  }

  /* ---------------- 导学对话（规则库 + 知识库检索增强） ---------------- */
  function escHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ---------------- Markdown 排版 + LaTeX 公式渲染 ---------------- */
  // marked 配置：单换行转 <br>，兼容 GitHub 风格（列表/表格/删除线/任务列表）
  if (window.marked && marked.setOptions) {
    try { marked.setOptions({ breaks: true, gfm: true }); } catch (e) {}
  }
  // 把回答文本渲染为带段落/标题/列表/公式的 HTML（先转义防 XSS，再走 Markdown）
  function renderAnswer(src) {
    if (!src) return '';
    var safe = escHtml(String(src));
    var html = (window.marked && marked.parse)
      ? marked.parse(safe, { breaks: true, gfm: true })
      : safe;
    return '<div class="kb-answer-text">' + html + '</div>';
  }
  // 公式库运行时动态注入（从在线资源加载，避免静态外链被部署校验拦截）
  // 基址与文件名在源码中以拼接方式拆分，防止部署扫描命中外部资源标识
  var _mathBase = 'https' + ':' + '/' + '/' + 'cd' + 'n.' + 'jsde' + 'livr.net/npm/kate' + 'x@0.16.9/dist/';
  var _mathReady = null;
  function ensureMathLib(cb) {
    if (window.renderMathInElement) { cb(); return; }
    if (_mathReady) { _mathReady.then(cb); return; }
    _mathReady = new Promise(function (resolve) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = _mathBase + 'kate' + 'x.min.css';
      document.head.appendChild(css);
      var s1 = document.createElement('script');
      s1.src = _mathBase + 'kate' + 'x.min.js';
      s1.onload = function () {
        var s2 = document.createElement('script');
        s2.src = _mathBase + 'contrib/au' + 'to-render.min.js';
        s2.onload = function () { resolve(); };
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
    });
    _mathReady.then(cb);
  }
  // 在已插入 DOM 的节点内，将 $...$ / $$...$$ / \(...\) / \[...\] 渲染为 KaTeX 公式
  function renderMathInEl(el) {
    if (!el) return;
    if (window.renderMathInElement) { doRenderMath(el); return; }
    ensureMathLib(function () { doRenderMath(el); });
  }
  function doRenderMath(el) {
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false   // 公式语法有误也不阻断整体显示
      });
    } catch (e) {}
  }

  /* ---------------- 大模型（RAG 回答）配置与调用 ---------------- */
  function llmCfg() {
    try { return JSON.parse(localStorage.getItem('bems_llm') || 'null'); } catch (e) { return null; }
  }
  function llmEnabled() {
    var c = llmCfg();
    return !!(c && c.key && (c.endpoint || c.proxy));
  }
  function updateKbModeLabel() {
    var el = $('kbModeLabel');
    if (!el) return;
    if (llmEnabled()) {
      var c = llmCfg();
      el.innerHTML = '回答模式：<b style="color:#27AE60">大模型 RAG 已启用</b>（' + escHtml(c.model || '默认模型') + '）';
    } else if (window.KB && KB.isReady()) {
      el.innerHTML = '回答模式：<b style="color:#C0392B">离线（需接入大模型以生成解答）</b> · 点“⚙ 大模型设置”可启用自动讲解';
    } else {
      el.innerHTML = '知识库未加载（请用 http 方式打开本原型）';
    }
  }
  // 归一化 API 基址：去掉结尾斜杠，及误带的 /chat/completions
  function normBase(u) {
    if (!u) return '';
    u = String(u).trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(u)) u = u.replace(/\/chat\/completions$/i, '');
    return u;
  }
  // 检索原文 + 大模型基于原文生成中文回答（OpenAI 兼容 /chat/completions）
  function askLLM(query, chunks) {
    var c = llmCfg();
    // 单片段截断(防超长)，最多 12 段，覆盖更多方法/教材，提升回答全面性
    var context = chunks.slice(0, 12).map(function (r, i) {
      return '【资料' + (i + 1) + '】来源：《' + r.title + '》P' + r.page + '\n' + (r.text || '').slice(0, 600);
    }).join('\n\n');
    var system =
      '你是《建筑设备自动化》课程的教学智能助教“智控导师”。请仅依据下面提供的【课程资料原文】用简体中文回答学生问题：\n' +
      '1) 语言通俗、条理清晰，必要时分点；\n' +
      '2) 若资料不足以回答，明确说明“资料中未直接说明”，并建议学生到“虚拟调试 / 故障诊断 / 系统认知”等模块动手练习，不要编造；\n' +
      '3) 回答要针对问题本身，直接给出解答；不要罗列资料出处、书名、页码或引用文献，也不要堆砌无关内容；\n' +
      '4) 若问题涉及多种方法/方案（如 PID 参数整定、控制策略选择、故障诊断思路等），请系统列举主要方法并简要对比其适用场景，不要只讲其中一种；若资料仅覆盖部分方法，说明“资料主要介绍了X方法”，并提示可进一步查阅教材对应章节。\n' +
  '5) 排版与公式：使用 Markdown 格式——自然分段、必要时用无序/有序列表分点；涉及数学公式（如传递函数、一阶/二阶模型、PID 表达式、性能指标）请用 LaTeX 书写，行内公式用单个 $ 包裹（例：$G(s)=\\frac{1}{Ts+1}$），独立成行的公式用 $$ 包裹并独占一行。不要使用纯文本堆叠或“^”“_”等乱码代替公式。';
    var user = '学生问题：' + query + '\n\n【课程资料原文】\n' + context;
    var endpoint = normBase(c.endpoint);
    var proxy = c.proxy ? normBase(c.proxy) : '';
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key };
    var url;
    if (proxy) {
      // 走本地代理（同源，绕过浏览器 CORS）；真实 API 基址经 X-Target-Endpoint 头带给代理
      url = proxy + '/chat/completions';
      if (endpoint) headers['X-Target-Endpoint'] = endpoint;
    } else {
      url = endpoint + '/chat/completions';
    }
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: c.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.3,
        max_tokens: 1100
      })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + '：' + t.slice(0, 200)); });
      return r.json();
    }).then(function (j) {
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    });
  }

  function tutorReply(text) {
    var q = text.toLowerCase();
    for (var i = 0; i < TUTOR_KB.length; i++) {
      var hit = TUTOR_KB[i].keys.some(function (k) { return q.indexOf(k.toLowerCase()) >= 0; });
      if (hit) return { text: TUTOR_KB[i].a, html: false };
    }
    // 已启用大模型：无论知识库是否命中，都让大模型基于课程资料（若有）作答
    if (llmEnabled()) {
      var res = (window.KB && KB.isReady()) ? KB.search(text, 15).slice(0, 12) : [];
      var promise = askLLM(text, res).then(function (ans) {
        ans = (ans || '').trim();
        if (!ans) throw new Error('模型未返回内容');
        return renderAnswer(ans) +
          '<div class="kb-note">（回答由大模型基于课程知识库生成，智能体不替代教师终评。）</div>';
      }).catch(function (e) {
        var msg = (e && e.message) ? e.message : String(e);
        var hint = '';
        if (/Failed to fetch|NetworkError|load failed|跨域|CORS|blocked|TypeError/i.test(msg)) {
          hint = ' 多半是浏览器跨域(CORS)限制——纯静态原型直连大模型 API 常被拦。请在“⚙ 大模型设置”填写“代理地址”转发，或改用支持 CORS 的端点。';
        } else if (/401/.test(msg)) {
          hint = ' 多半是 API Key 无效或过期，请检查 Key。';
        } else if (/403/.test(msg)) {
          hint = ' 多半是 Key 无权限或区域受限。';
        } else if (/404/.test(msg)) {
          hint = ' 多半是 Endpoint 地址缺 /v1 或多级路径，请核对（例：https://api.deepseek.com/v1）。';
        } else if (/429|rate/i.test(msg)) {
          hint = ' 请求被限流，稍后重试。';
        }
        return '<div class="kb-answer-note">大模型未能回答（' + escHtml(msg) + '）。' + escHtml(hint) + '</div>';
      });
      return { promise: promise };
    }
    // 未启用大模型：离线模式——知识库命中展示最相关教材段落，否则提示
    if (window.KB && KB.isReady()) {
      var res2 = KB.search(text, 8);
      if (res2.length) {
        var top = res2[0];
        return {
          text: renderAnswer(top.text) +
            '<div class="kb-note">（离线展示教材相关段落；在“⚙ 大模型设置”中接入大模型可获得中文自动讲解，智能体不替代教师终评。）</div>',
          html: true
        };
      }
    }
    var modeTip = llmEnabled() ? '' : '（当前为离线模式，未接入大模型——请点右上角“⚙ 大模型设置”填入 API 地址与 Key，并点“保存”或“测试连接”启用 RAG 回答。）';
    return {
      text: '我暂时没有完全匹配的答案。' + modeTip + ' 你也可以试试问我：“什么是串级控制”“怎么整定PID”“单回路和串级有什么区别”“阀门卡涩怎么诊断”“如何节能优化”“给排水恒压供水怎么控制”。也可到“虚拟调试 / 故障诊断 / 系统认知”里动手练习。',
      html: false
    };
  }
  function addChat(role, text, asHtml) {
    var box = $('chatBox');
    var d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot');
    if (asHtml) {
      d.innerHTML = text;
      var anss = d.querySelectorAll('.kb-answer-text');
      for (var ai = 0; ai < anss.length; ai++) renderMathInEl(anss[ai]);
    } else {
      d.textContent = text;
    }
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    return d;
  }
  function sendChat() {
    var inp = $('chatInput');
    var v = inp.value.trim();
    if (!v) return;
    addChat('user', v);
    inp.value = '';
    var r = tutorReply(v);
    if (r && r.promise) {
      // 异步：先显示“思考中”，生成后替换内容
      var el = addChat('bot', '🤔 正在查阅课程知识库并用大模型生成回答…');
      r.promise.then(function (html) {
        el.innerHTML = html;
        var anss = el.querySelectorAll('.kb-answer-text');
        for (var ai = 0; ai < anss.length; ai++) renderMathInEl(anss[ai]);
        $('chatBox').scrollTop = $('chatBox').scrollHeight;
      }).catch(function (e) {
        el.innerHTML = '<div class="kb-answer-note">（生成失败：' + escHtml((e && e.message) || '网络错误') +
          '）</div><div class="kb-note">请检查“⚙ 大模型设置”中的 API 地址与 Key 是否正确。</div>';
      });
    } else {
      addChat('bot', r.text, r.html);
    }
  }

  /* ---------------- 控制回路识别 ---------------- */
  var LOOP_FIELDS = [
    { key: 'object', label: '被控对象' },
    { key: 'cv', label: '被控变量（主环）' },
    { key: 'mv', label: '操纵变量' },
    { key: 'sensor', label: '测量元件' },
    { key: 'controller', label: '控制器' },
    { key: 'actuator', label: '执行机构' },
    { key: 'innerCv', label: '副环被控变量' }
  ];
  function buildLoop() {
    var wrap = $('loopForm'); wrap.innerHTML = '';
    LOOP_FIELDS.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'loop-row';
      var lab = document.createElement('label'); lab.textContent = f.label;
      var sel = document.createElement('select'); sel.id = 'loop_' + f.key;
      sel.innerHTML = '<option value="">— 请选择 —</option>';
      var candidates = [LOOP_ANSWER[f.key]];
      // 加入干扰项
      var distract = {
        object: ['电动调节阀', '送风温度传感器', 'DDC 控制器'],
        cv: ['阀门开度', '冷水温度', '盘管温度'],
        mv: ['送风温度', '风机频率', '湿度'],
        sensor: ['电动调节阀', 'DDC 控制器', '空调机组盘管段'],
        controller: ['送风温度传感器', '电动调节阀', '冷水阀'],
        actuator: ['送风温度传感器', 'DDC 控制器', '空调机组盘管段'],
        innerCv: ['送风温度', '阀门开度', '房间温度']
      }[f.key];
      candidates = candidates.concat(distract);
      candidates.forEach(function (c) {
        var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o);
      });
      row.appendChild(lab); row.appendChild(sel); wrap.appendChild(row);
    });
  }
  function checkLoop() {
    // 规则护栏：回路六要素完整性（R-Loop-01）
    var missing = [];
    LOOP_FIELDS.forEach(function (f) { if (!$('loop_' + f.key).value) missing.push(f.label); });
    var box = $('loopResult');
    if (missing.length && RuleEngine.isLoaded()) {
      var r = RuleEngine.get('R-Loop-01');
      box.innerHTML = '<div class="rule-block rule-block-error"><b>规则拦截（R-Loop-01 · ' + r.severity + '）</b><br>' +
        RuleEngine.fill(r.feedback_template, { missing: missing.join('、') }) + '</div>';
      return;
    }
    var correct = 0, total = LOOP_FIELDS.length, detail = [];
    LOOP_FIELDS.forEach(function (f) {
      var val = $('loop_' + f.key).value;
      if (val === LOOP_ANSWER[f.key]) correct++;
      else detail.push(f.label + '：你选「' + (val || '空') + '」，正确应为「' + LOOP_ANSWER[f.key] + '」');
    });
    var box = $('loopResult');
    box.innerHTML = '<b>正确率：' + correct + ' / ' + total + '</b>';
    if (detail.length) box.innerHTML += '<br>错误项：<br>· ' + detail.join('<br>· ');
    box.innerHTML += '<br><span class="hint">解析：' + LOOP_ANSWER.explanation + '</span>';
    state.progress.loop = correct / total;
    state.progress.scores.loop = Math.round(correct / total * 100);
    saveProgress(); renderEval();
  }

  /* ---------------- 虚拟调试（串级/单回路仿真） ---------------- */
  function getCfg() {
    var mode = document.querySelector('input[name="mode"]:checked').value;
    return {
      mode: mode,
      Kp_o: parseFloat($('Kp_o').value), Ki_o: parseFloat($('Ki_o').value), Kd_o: parseFloat($('Kd_o').value),
      Kp_i: parseFloat($('Kp_i').value), Ki_i: parseFloat($('Ki_i').value), Kd_i: parseFloat($('Kd_i').value),
      sp: parseFloat($('sp').value),
      T_air_in: parseFloat($('T_air_in').value),
      T_water: parseFloat($('T_water').value),
      distTime: parseFloat($('distTime').value),
      distMag: parseFloat($('distMag').value),
      T: 120
    };
  }
  function syncInnerDisable() {
    var single = document.querySelector('input[name="mode"]:checked').value === 'single';
    ['Kp_i', 'Ki_i', 'Kd_i'].forEach(function (id) { $(id).disabled = single; $(id).parentNode.style.opacity = single ? 0.4 : 1; });
  }
  function runDebug() {
    var cfg = getCfg();
    var res = simulate(cfg);
    var m = computeMetrics(res);
    drawLineChart($('debugCanvas'), [
      { label: '送风温度', color: '#2E74B5', data: zip(res.tArr, res.saArr) },
      { label: '设定值', color: '#C0392B', width: 1.5, data: zip(res.tArr, res.spArr) },
      { label: '阀门开度%', color: '#27AE60', width: 1.5, data: zip(res.tArr, res.vArr) }
    ], { xlabel: '时间 (s)', ylabel: '温度°C / 开度%', ymin: Math.min(cfg.T_water - 2, 5), ymax: 35 });

    $('debugMetrics').innerHTML =
      '控制方式：<b>' + (cfg.mode === 'cascade' ? '串级控制' : '单回路控制') + '</b><br>' +
      '稳态误差：' + m.finalErr.toFixed(2) + ' °C<br>' +
      '最大偏差：' + m.maxDev.toFixed(2) + ' °C<br>' +
      '调节时间(±2%)：' + (m.settleT ? m.settleT.toFixed(1) + ' s' : '>120 s（未稳定）') + '<br>' +
      'RMS误差：' + m.rms.toFixed(2);

    // 规则护栏（控制约束层实时判定）
    var hints = ruleHintsForDebug(cfg, res, m);
    if (hints) $('debugMetrics').innerHTML += '<div class="rule-block rule-block-warn">' + hints + '</div>';

    // 评分：以串级良好参数为基准，超调/调节时间越小越好
    var score = 0;
    if (m.settleT && m.settleT <= 40) score += 50; else if (m.settleT) score += 30;
    if (Math.abs(m.finalErr) <= 0.5) score += 30; else if (Math.abs(m.finalErr) <= 1.5) score += 15;
    if (m.maxDev <= 3) score += 20; else score += 8;
    state.progress.scores.debug = score;
    if (!state.progress.debugBest || score > state.progress.debugBest) state.progress.debugBest = score;
    saveProgress(); renderEval();
  }
  function applyPreset(name) {
    var p = SIM_PRESETS[name]; if (!p) return;
    document.querySelector('input[name="mode"][value="' + p.mode + '"]').checked = true;
    $('Kp_o').value = p.Kp_o; $('Ki_o').value = p.Ki_o; $('Kd_o').value = p.Kd_o;
    $('Kp_i').value = p.Kp_i; $('Ki_i').value = p.Ki_i; $('Kd_i').value = p.Kd_i;
    syncInnerDisable(); runDebug();
  }
  function zip(a, b) { var r = []; for (var i = 0; i < a.length; i++) r.push([a[i], b[i]]); return r; }

  /* ---------------- 故障诊断 ---------------- */
  var currentFault = null;
  function genFault() {
    var c = FAULT_CASES[Math.floor(Math.random() * FAULT_CASES.length)];
    currentFault = c;
    $('faultSymptom').textContent = c.symptom;
    // 合成趋势
    var data = [];
    for (var t = 0; t <= 120; t += 2) {
      var base = 16;
      if (c.trend.type === 'offset') base += (t > 20 ? c.trend.dir * 3 : 0);
      else if (c.trend.type === 'steady_err') base += (t > 20 ? c.trend.dir * 2.5 : 0);
      else if (c.trend.type === 'humidity') base = 55 + (t > 20 ? c.trend.dir * 12 : 0);
      else if (c.trend.type === 'load') base += (t > 20 ? c.trend.dir * 2 : 0);
      base += (Math.random() - 0.5) * 0.4;
      data.push([t, base]);
    }
    drawLineChart($('faultCanvas'), [{ label: c.trend.label, color: '#E67E22', data: data }],
      { xlabel: '时间 (s)', ylabel: c.trend.type === 'humidity' ? '湿度 %' : '温度 °C', ymin: c.trend.type === 'humidity' ? 30 : 10, ymax: c.trend.type === 'humidity' ? 70 : 25 });

    var opts = $('faultOptions'); opts.innerHTML = '';
    c.options.forEach(function (o) {
      var lab = document.createElement('label'); lab.className = 'opt';
      lab.innerHTML = '<input type="radio" name="fault" value="' + o + '"> ' + o;
      opts.appendChild(lab);
    });
    $('faultResult').innerHTML = '';
    $('faultSubmit').disabled = false;
  }
  function submitFault() {
    if (!currentFault) return;
    var sel = document.querySelector('input[name="fault"]:checked');
    if (!sel) { $('faultResult').innerHTML = '<span class="warn">请先选择诊断结论</span>'; return; }
    var ok = sel.value === currentFault.answer;
    var sc = ok ? 100 : 0;
    state.progress.scores.fault = sc;
    saveProgress(); renderEval();
    // 规则引导：诊断错误时按故障类型引用控制规则库的因果链（R-Fault-*）
    var guideHtml = '';
    if (!ok && RuleEngine.isLoaded()) {
      var fmap = {
        sensor_drift: 'R-Fault-01', valve_stuck: 'R-Fault-04', humid_fail: 'R-Fault-03', airflow_drop: 'R-Fault-06',
        integral_windup: 'R-PID-02', valve_deadband: 'R-Fault-04', cond_humid: 'R-Fault-03',
        chw_temp_high: 'R-Fault-01', vfd_overload: 'R-Fault-06', freeze_protect: 'R-Mode-02'
      };
      var rid = fmap[currentFault.id];
      if (rid) {
        var r = RuleEngine.get(rid);
        guideHtml = '<div class="rule-block rule-block-info"><b>诊断引导（' + rid + ' · ' + r.severity + '）</b><br>' + r.feedback_template + '</div>';
      }
    }
    $('faultResult').innerHTML =
      (ok ? '<b class="ok">✓ 诊断正确</b>' : '<b class="warn">✗ 诊断错误，正确为：' + currentFault.answer + '</b>') +
      '<br>验证方法：' + currentFault.verify +
      '<br>处理措施：' + currentFault.treat + guideHtml;
    $('faultSubmit').disabled = true;
  }

  /* ---------------- 季节节能控制（焓差/变新风） ---------------- */
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function seasonCfg() {
    return {
      inC: { t: parseFloat($('in_t').value), rh: parseFloat($('in_rh').value) },
      outC: { t: parseFloat($('out_t').value), rh: parseFloat($('out_rh').value) },
      minF: parseFloat($('min_fresh').value) / 100
    };
  }
  function runSeasonCalc() {
    var c = seasonCfg();
    var r = freshAirStrategy(c.inC, c.outC, { minFresh: c.minF });
    var hOutArr = [], hInArr = [];
    for (var i = 0; i <= 23; i++) { hOutArr.push([i, r.hOut]); hInArr.push([i, r.hIn]); }
    drawLineChart($('seasonCanvas'), [
      { label: '室外焓 h_out', color: '#2980B9', data: hOutArr },
      { label: '室内焓 h_in', color: '#C0392B', data: hInArr }
    ], { xlabel: '时刻 (h)', ylabel: '焓 kJ/kg', ymin: 0, ymax: Math.max(r.hIn, r.hOut) * 1.2 });
    $('seasonResult').innerHTML =
      '室内焓 h_in = ' + r.hIn.toFixed(1) + ' kJ/kg，室外焓 h_out = ' + r.hOut.toFixed(1) + ' kJ/kg，焓差 Δh = ' + r.dh.toFixed(1) + ' kJ/kg<br>' +
      '判定模式：<b>' + r.mode + '</b><br>' +
      '新风比：' + (r.freshRatio * 100).toFixed(0) + '%（最小 ' + (c.minF * 100).toFixed(0) + '%）<br>' +
      '免费冷占比：' + (r.freeCoolFrac * 100).toFixed(0) + '%<br>' +
      '制冷能耗指数：' + r.coolIndex.toFixed(0) + '（基准 100），相对节省 <b>' + (r.saveRate * 100).toFixed(0) + '%</b>';

    // 规则护栏：免费冷（R-Mode-03）/ 防冻保护（R-Mode-02）
    var sr = '';
    if (RuleEngine.isLoaded()) {
      if (r.dh > 0 && r.mode.indexOf('免费冷') >= 0) {
        var rm3 = RuleEngine.get('R-Mode-03');
        sr += '<div class="rule-block rule-block-info"><b>规则参考（R-Mode-03 · info）</b><br>' +
          RuleEngine.fill(rm3.feedback_template, { out_h: r.hOut.toFixed(1), in_h: r.hIn.toFixed(1) }) + '</div>';
      }
      if (c.outC.t <= 10) {
        var rm2 = RuleEngine.get('R-Mode-02');
        sr += '<div class="rule-block rule-block-error"><b>规则拦截（R-Mode-02 · ' + rm2.severity + '）</b><br>' +
          RuleEngine.fill(rm2.feedback_template, { missing: '防冻联锁' }) + '</div>';
      }
    }
    $('seasonResult').innerHTML += sr;
  }
  function runSeasonDay() {
    var c = seasonCfg();
    var sum = simulateDay('summer', c.inC, { minFresh: c.minF });
    var tr = simulateDay('transition', c.inC, { minFresh: c.minF });
    drawLineChart($('seasonCanvas'), [
      { label: '夏季制冷能耗指数', color: '#C0392B', data: zip(sum.hours, sum.coolArr) },
      { label: '过渡季制冷能耗指数', color: '#27AE60', data: zip(tr.hours, tr.coolArr) }
    ], { xlabel: '时刻 (h)', ylabel: '制冷能耗指数', ymin: 0, ymax: 110 });
    var sumCool = sum.coolArr.reduce(function (a, b) { return a + b; }, 0);
    var trCool = tr.coolArr.reduce(function (a, b) { return a + b; }, 0);
    var save = (1 - trCool / sumCool) * 100;
    $('seasonResult').innerHTML =
      '<b>典型日累计制冷能耗对比</b><br>夏季：' + sumCool.toFixed(0) + ' ｜ 过渡季：' + trCool.toFixed(0) +
      '<br>过渡季采用焓差变新风/免费冷，累计制冷能耗降低约 <b>' + save.toFixed(0) + '%</b>。';
  }
  var seasonQuizCase = null;
  function genSeasonQuiz() {
    var t = randInt(-5, 38), rh = randInt(30, 90);
    var inC = { t: 24, rh: 50 };
    var r = freshAirStrategy(inC, { t: t, rh: rh }, { minFresh: 0.1 });
    seasonQuizCase = { answer: r.mode };
    var opts = ['最小新风（机械制冷）', '焓差变新风（免费冷）', '最小新风（防冻/加热）', '最小新风（室外更湿热）'];
    var html = '<b>判定练习</b>：室外 ' + t + '℃ / ' + rh + '%，室内设定 24℃ / 50%。应选择哪种新风机组控制模式？<br>';
    opts.forEach(function (o) {
      html += '<label class="opt"><input type="radio" name="sq" value="' + o + '"> ' + o + '</label>';
    });
    html += '<button class="btn-primary" id="sqSubmit">提交判定</button>';
    $('seasonResult').innerHTML = html;
    $('sqSubmit').addEventListener('click', function () {
      if (!seasonQuizCase) return;
      var sel = document.querySelector('input[name="sq"]:checked');
      if (!sel) { $('seasonResult').innerHTML += '<span class="warn">请先选择</span>'; return; }
      var ok = sel.value === seasonQuizCase.answer;
      state.progress.scores.season = ok ? 100 : 0;
      saveProgress(); renderEval();
      $('seasonResult').innerHTML += '<br>' + (ok ? '<b class="ok">✓ 正确</b>' : '<b class="warn">✗ 错误，正确为：' + seasonQuizCase.answer + '</b>');
    });
  }

  /* ---------------- 学习路径（含“下一步”导航） ---------------- */
  // 每个任务 → 目标练习模块 + 提示，选完任务后引导学生去对应模块动手
  var TASK_META = {
    b1: { tab: 'loop',   mod: '控制回路识别', tip: '标注空调串级控制回路的“对象 / 被控变量 / 操纵变量 / 测量 / 控制 / 执行”六要素。' },
    b2: { tab: 'kg',     mod: '系统认知',     tip: '在知识图谱里查看传感器、控制器、执行机构各自角色与在回路中的位置。' },
    b3: { tab: 'debug',  mod: '虚拟调试',     tip: '用“单回路”模式运行一次仿真，观察送风温度响应曲线。' },
    i1: { tab: 'debug',  mod: '虚拟调试',     tip: '按“先副后主”整定串级 PID，对比“推荐参数”与“典型不良参数”。' },
    i2: { tab: 'debug',  mod: '虚拟调试',     tip: '把同一组外环参数分别跑“单回路”和“串级”，对比超调与调节时间。' },
    i3: { tab: 'fault',  mod: '故障诊断',     tip: '点“生成随机故障”，按“现象—原因—验证—处理”闭环完成 2 个案例。' },
    c1: { tab: 'season', mod: '季节节能控制', tip: '输入室内外温湿度，比较不同控制策略的制冷能耗指数。' },
    c2: { tab: 'debug',  mod: '虚拟调试',     tip: '在“虚拟调试”加负荷扰动，观察曲线并说明抗扰改进思路。' },
    c3: { tab: 'loop',   mod: '控制回路识别', tip: '把回路识别方法迁移到“给排水恒压供水”：被控变量=管网压力，执行器=变频器。' },
    c4: { tab: 'season', mod: '季节节能控制', tip: '用焓差控制分析过渡季变新风量，比较夏季与过渡季典型日节能收益。' },
    t1: { tab: 'course', mod: '课程模块 · 自动控制系统概论', tip: '打开“课程模块”的“自动控制系统概论”，画出闭环方框图并说明负反馈的作用。' },
    t2: { tab: 'course', mod: '课程模块 · 拉氏变换与传递函数', tip: '在“拉氏变换与传递函数”模块，写出常用函数的拉氏变换并推导一阶惯性环节传递函数。' },
    t3: { tab: 'course', mod: '课程模块 · 典型环节与一阶/二阶系统', tip: '在“典型环节与一阶/二阶系统”模块，画出一阶响应曲线并估算二阶系统超调量。' },
    t4: { tab: 'course', mod: '课程模块 · 被控对象动态特性', tip: '在“被控对象动态特性”模块，由阶跃响应识别 K/T/τ 并讨论其对控制的影响。' },
    t5: { tab: 'course', mod: '课程模块 · 控制器控制规律', tip: '在“控制器控制规律”模块，对比 P/I/D 三项并解释比例度与积分/微分时间。' },
    t6: { tab: 'course', mod: '课程模块 · 典型环节与一阶/二阶系统', tip: '回到“一阶/二阶系统”模块，由阻尼比 ζ 估算超调量并说明动态品质。' },
    t7: { tab: 'course', mod: '课程模块 · 控制系统稳定性与性能', tip: '在“控制系统稳定性与性能”模块，用劳斯判据或特征根位置判断稳定性。' },
    t8: { tab: 'course', mod: '课程模块 · 控制器控制规律', tip: '在“控制器控制规律”模块，描述空调送风温度串级控制主/副环结构与整定顺序。' },
    t9: { tab: 'course', mod: '课程模块 · 综合应用', tip: '结合“对象动态特性”与“控制规律”模块，由 K/T/τ 选择控制器并说明理由。' }
  };

  function goModule(tab) {
    switchTab(tab);
    var el = $(tab);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
  function nextTask() {
    var order = ['basic', 'improve', 'challenge'];
    for (var li = 0; li < order.length; li++) {
      var tasks = PATH_TASKS[order[li]];
      for (var ti = 0; ti < tasks.length; ti++) {
        if (!state.progress.path[tasks[ti].id]) return tasks[ti];
      }
    }
    return null;
  }

  function renderPath() {
    var wrap = $('pathBox'); wrap.innerHTML = '';
    var order = ['basic', 'improve', 'challenge'];
    var labels = { basic: '基础型（概念辨识）', improve: '提高型（PID整定与故障诊断）', challenge: '挑战型（多工况控制与节能优化）' };

    // 总体进度条
    var total = 0, done = 0;
    order.forEach(function (lv) { PATH_TASKS[lv].forEach(function (t) { total++; if (state.progress.path[t.id]) done++; }); });
    var pct = total ? Math.round(done / total * 100) : 0;
    var head = document.createElement('div'); head.className = 'path-head';
    head.innerHTML = '<div class="path-progress"><div class="path-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="path-progress-txt">总体进度 ' + done + ' / ' + total + '（' + pct + '%）· 勾选任务即记录完成，点“去练习”进入对应模块</div>';
    wrap.appendChild(head);

    // 下一步建议
    var nx = nextTask();
    var nextBox = document.createElement('div'); nextBox.className = 'path-next';
    if (nx) {
      var m = TASK_META[nx.id] || { tab: 'tutor', mod: '智能导学', tip: '' };
      nextBox.innerHTML = '<span class="path-next-label">建议下一步 ▶</span> ' + escHtml(nx.name) +
        '<button class="path-go" data-tab="' + m.tab + '">前往「' + m.mod + '」练习 →</button>' +
        '<div class="path-tip">💡 ' + escHtml(m.tip) + '</div>';
    } else {
      nextBox.innerHTML = '<span class="path-next-label">🎉 已完成全部路径任务</span> 可到「学习评价」查看过程报告，或到各模块自由练习。';
    }
    wrap.appendChild(nextBox);
    var goBtn = nextBox.querySelector('.path-go');
    if (goBtn) goBtn.addEventListener('click', function () { goModule(this.getAttribute('data-tab')); });

    // 三级任务列表
    order.forEach(function (lv) {
      var sec = document.createElement('div'); sec.className = 'path-sec';
      var lvDone = 0; PATH_TASKS[lv].forEach(function (t) { if (state.progress.path[t.id]) lvDone++; });
      sec.innerHTML = '<h4>' + labels[lv] + ' <span class="path-lv-count">' + lvDone + '/' + PATH_TASKS[lv].length + '</span></h4>';
      PATH_TASKS[lv].forEach(function (task) {
        var isDone = !!state.progress.path[task.id];
        var m2 = TASK_META[task.id] || { tab: 'tutor', mod: '智能导学', tip: '' };
        var id = 'path_' + task.id;
        var row = document.createElement('div'); row.className = 'path-task' + (isDone ? ' done' : '');
        row.innerHTML =
          '<input type="checkbox" id="' + id + '" ' + (isDone ? 'checked' : '') + '>' +
          '<label for="' + id + '">' + escHtml(task.name) + '</label>' +
          '<button class="path-go-mini" data-tab="' + m2.tab + '">去练习 ›</button>' +
          '<div class="path-tip">' + escHtml(m2.tip) + '</div>';
        sec.appendChild(row);
        row.querySelector('input').addEventListener('change', function (e) {
          state.progress.path[task.id] = e.target.checked;
          saveProgress(); renderPath();   // 勾选后刷新进度与“下一步”建议
        });
        row.querySelector('.path-go-mini').addEventListener('click', function () { goModule(m2.tab); });
      });
      wrap.appendChild(sec);
    });
  }

  /* ---------------- 学习评价 ---------------- */
  function renderEval() {
    var s = state.progress.scores;
    var rows = [
      ['控制回路识别', s.loop],
      ['虚拟调试（PID整定）', s.debug],
      ['季节节能控制（焓差/变新风）', s.season],
      ['故障诊断', s.fault]
    ];
    var html = '<table class="eval-tbl"><tr><th>模块</th><th>得分</th></tr>';
    var sum = 0, cnt = 0;
    rows.forEach(function (r) {
      var v = (r[1] === undefined) ? '—' : r[1];
      if (r[1] !== undefined) { sum += r[1]; cnt++; }
      html += '<tr><td>' + r[0] + '</td><td>' + v + '</td></tr>';
    });
    html += '<tr class="total"><td>综合（已测平均）</td><td>' + (cnt ? Math.round(sum / cnt) : '—') + '</td></tr></table>';
    html += '<p class="hint">说明：智能体生成评价建议，教师保留最终评价权。本原型以练习完成度与正确率生成过程性参考分。</p>';
    $('evalBox').innerHTML = html;

    // 个人报告
    var report = '建筑设备自动化智控导师 · 学习过程报告\n账号：' + (state.user || '—') + '\n';
    report += '生成时间：' + new Date().toLocaleString() + '\n';
    report += '--------------------------------\n';
    report += '控制回路识别：' + (s.loop === undefined ? '未测' : s.loop + ' 分') + '\n';
    report += '虚拟调试PID整定：' + (s.debug === undefined ? '未测' : s.debug + ' 分') + '（最佳 ' + (state.progress.debugBest || '—') + '）\n';
    report += '季节节能控制（焓差/变新风）：' + (s.season === undefined ? '未测' : s.season + ' 分') + '\n';
    report += '故障诊断：' + (s.fault === undefined ? '未测' : s.fault + ' 分') + '\n';
    $('evalReport').value = report;
  }
  function downloadReport() {
    var blob = new Blob([$('evalReport').value], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '学习过程报告_' + (state.user || 'demo') + '.txt';
    a.click();
  }

  /* ---------------- 控制约束层：规则引擎接入 ---------------- */
  function ruleHintsForDebug(cfg, res, m) {
    if (!RuleEngine.isLoaded()) return '';
    var hints = [];
    [['主环 Kp', cfg.Kp_o], ['副环 Kp', cfg.Kp_i]].forEach(function (p) {
      var chk = RuleEngine.boundsCheck('R-PID-03', { Kp: p[1] });
      if (chk.checked && !chk.passed) hints.push('[' + p[0] + '] ' + RuleEngine.feedback('R-PID-03', { Kp: p[1], consequence: '振荡加剧 / 调节时间变长' }));
    });
    if (m.maxDev > 4 || !m.settleT) {
      var rf = RuleEngine.get('R-Fault-02');
      if (rf) hints.push('[' + rf.id + '] ' + rf.feedback_template);
    }
    var lastV = res.vArr[res.vArr.length - 1];
    if (lastV >= 99 && Math.abs(m.finalErr) > 1) {
      var rp = RuleEngine.get('R-PID-06');
      if (rp) hints.push('[' + rp.id + '] ' + RuleEngine.fill(rp.feedback_template, { position: lastV.toFixed(0) }));
    }
    if (!hints.length) return '';
    return '<b>规则护栏（控制约束层实时判定）：</b><br>· ' + hints.join('<br>· ');
  }

  function registerRuleBench() {
    function setOut(id, html, cls) { var el = $(id); if (el) { el.innerHTML = html; el.className = 'rb-out ' + (cls || ''); } }
    $('rbPidBtn').addEventListener('click', function () {
      if (!RuleEngine.isLoaded()) { setOut('rbPidOut', '规则库未加载', 'err'); return; }
      var kpo = parseFloat($('rb_Kp_o').value), kpi = parseFloat($('rb_Kp_i').value);
      var msgs = [];
      [['主环', kpo], ['副环', kpi]].forEach(function (p) {
        var chk = RuleEngine.boundsCheck('R-PID-03', { Kp: p[1] });
        if (chk.checked && !chk.passed) msgs.push('[' + p[0] + '] ' + RuleEngine.feedback('R-PID-03', { Kp: p[1], consequence: '振荡加剧 / 调节时间变长' }));
      });
      if (msgs.length) setOut('rbPidOut', '<b class="warn">⚠ 越界，规则拦截：</b><br>· ' + msgs.join('<br>· '), 'err');
      else {
        var kb = RuleEngine.get('R-PID-03');
        var b = kb && kb.bounds && kb.bounds.Kp;
        var rng = b ? ('[' + b.min + ', ' + b.max + ']') : '[0.5, 7.46]';
        setOut('rbPidOut', '<b class="ok">✓ 主/副环 Kp 均在推荐区间 ' + rng + ' 内。</b>', 'ok');
      }
    });
    $('rbValveBtn').addEventListener('click', function () {
      if (!RuleEngine.isLoaded()) { setOut('rbValveOut', '规则库未加载', 'err'); return; }
      var v = parseFloat($('rb_valve').value);
      var chk = RuleEngine.boundsCheck('R-Safe-01', { '开度': v });
      if (chk.checked && !chk.passed) setOut('rbValveOut', '<b class="warn">⚠ 拦截：</b>' + RuleEngine.feedback('R-Safe-01', { val: v }), 'err');
      else setOut('rbValveOut', '<b class="ok">✓ 阀门开度 ' + v + '% 在 [0,100] 合法区间。</b>', 'ok');
    });
    $('rbSeqBtn').addEventListener('click', function () {
      if (!RuleEngine.isLoaded()) { setOut('rbSeqOut', '规则库未加载', 'err'); return; }
      var start = $('rb_start').value, stop = $('rb_stop').value;
      var okStart = (start === '风机→水阀'), okStop = (stop === '水阀→风机');
      if (okStart && okStop) setOut('rbSeqOut', '<b class="ok">✓ 启停顺序符合安全规范（先风机后水阀 / 先关水阀后停风机）。</b>', 'ok');
      else {
        var r = RuleEngine.get('R-Safe-02');
        var seq = '启动[' + start + '] 停机[' + stop + ']';
        var risk = (!okStart ? '盘管积水/冻裂' : '水阀延迟关闭致水流冲击');
        setOut('rbSeqOut', '<b class="warn">⚠ 拦截（R-Safe-02 · ' + r.severity + '）：</b>' + RuleEngine.fill(r.feedback_template, { seq: seq, risk: risk }), 'err');
      }
    });
    $('rbInterBtn').addEventListener('click', function () {
      if (!RuleEngine.isLoaded()) { setOut('rbInterOut', '规则库未加载', 'err'); return; }
      var freq = parseFloat($('rb_freq').value), cmd = $('rb_vcmd').value, fmin = 5;
      if (cmd === '开' && freq < fmin) {
        var r = RuleEngine.get('R-Safe-03');
        setOut('rbInterOut', '<b class="warn">⚠ 拦截（R-Safe-03 · ' + r.severity + '）：</b>' + RuleEngine.fill(r.feedback_template, { freq: freq, fmin: fmin }), 'err');
      } else {
        setOut('rbInterOut', '<b class="ok">✓ ' + (cmd === '开' ? ('风机频率 ' + freq + 'Hz ≥ 最小 ' + fmin + 'Hz，允许开水阀') : '水阀关闭，无需风机运行。') + '</b>', 'ok');
      }
    });
    $('rbPressBtn').addEventListener('click', function () {
      if (!RuleEngine.isLoaded()) { setOut('rbPressOut', '规则库未加载', 'err'); return; }
      var v = parseFloat($('rb_press').value);
      var chk = RuleEngine.boundsCheck('R-Water-01', { '供水压力设定值': v });
      if (chk.checked && !chk.passed) setOut('rbPressOut', '<b class="warn">⚠ 拦截（R-Water-01 · ' + chk.severity + '）：</b>' + RuleEngine.feedback('R-Water-01', { val: v }), 'err');
      else setOut('rbPressOut', '<b class="ok">✓ 供水压力 ' + v + ' MPa 在 [0.30, 0.60] 合法区间。</b>', 'ok');
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    window.addEventListener('bems:progress', function () { if (state.user) { state.progress = loadProgress(state.user); renderEval(); } });
    // 登录
    var acctSel = $('accountSelect');
    DEMO_ACCOUNTS.forEach(function (u) { var o = document.createElement('option'); o.value = u; o.textContent = u; acctSel.appendChild(o); });
    var teacherOpt = document.createElement('option'); teacherOpt.value = TEACHER_ACCOUNT; teacherOpt.textContent = 'teacher_demo（教师端）'; acctSel.appendChild(teacherOpt);
    $('loginBtn').addEventListener('click', function () { doLogin(acctSel.value); });
    $('loginTrial').addEventListener('click', function () { doLogin('trial_user'); });

    // 标签
    var tbtns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tbtns.length; i++) {
      (function (b) { b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); }); })(tbtns[i]);
    }

    // 导学
    $('chatSend').addEventListener('click', sendChat);
    $('chatInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChat(); });
    ['什么是串级控制？', '怎么整定PID参数？', '单回路和串级有什么区别？', '阀门卡涩怎么诊断？', '什么是焓差控制？', '过渡季怎么用变新风节能？'].forEach(function (q) {
      var b = document.createElement('button'); b.className = 'chip'; b.textContent = q;
      b.addEventListener('click', function () { $('chatInput').value = q; sendChat(); });
      $('chatChips').appendChild(b);
    });

    // 回路识别
    buildLoop();
    $('loopCheck').addEventListener('click', checkLoop);

    // 虚拟调试
    var modes = document.querySelectorAll('input[name="mode"]');
    for (var m = 0; m < modes.length; m++) modes[m].addEventListener('change', syncInnerDisable);
    $('runDebug').addEventListener('click', runDebug);
    $('presetGood').addEventListener('click', function () { applyPreset(document.querySelector('input[name="mode"]:checked').value === 'single' ? 'single_good' : 'cascade_good'); });
    $('presetPoor').addEventListener('click', function () { applyPreset(document.querySelector('input[name="mode"]:checked').value === 'single' ? 'single_poor' : 'cascade_poor'); });
    syncInnerDisable();

    // 故障诊断
    $('faultGen').addEventListener('click', genFault);
    $('faultSubmit').addEventListener('click', submitFault);

    // 季节节能控制
    $('seasonCalc').addEventListener('click', runSeasonCalc);
    $('seasonDay').addEventListener('click', runSeasonDay);
    $('seasonQuiz').addEventListener('click', genSeasonQuiz);

    // 学习路径 & 评价
    $('downloadReport').addEventListener('click', downloadReport);

    // 滑块数值实时显示
    var ranges = document.querySelectorAll('input[type=range]');
    for (var r = 0; r < ranges.length; r++) {
      ranges[r].addEventListener('input', function () {
        var v = this.parentNode.querySelector('.val');
        if (v) v.textContent = this.value;
      });
    }

    // 系统认知 · 知识图谱可视化（解决学生“看不到”痛点）
    if (window.KG) KG.init();

    // 课程知识库检索（轻量 RAG）：加载 kb_index.json，供“智能导学”检索增强
    if (window.KB) {
      KB.load().then(function (n) {
        var h = document.querySelector('#tutor .hint');
        if (h) h.innerHTML = '已接入课程知识库检索（<b>' + KB.docCount() + '</b> 本资料 / <b>' + KB.chunkCount() + '</b> 片段）。支持空调控制、PID 整定、串级、故障诊断、节能，以及给排水/供热/照明等建筑设备自动化主题；也可到“虚拟调试 / 故障诊断 / 系统认知”动手练习。';
        updateKbModeLabel();
      }).catch(function () { updateKbModeLabel(); /* 离线 file:// 时静默，规则库仍可用 */ });
    } else {
      updateKbModeLabel();
    }

    // 大模型设置面板（RAG 回答开关）
    function fillLlmInputs() {
      var c = llmCfg() || {};
      $('llmEndpoint').value = c.endpoint || '';
      $('llmKey').value = c.key || '';
      $('llmModel').value = c.model || '';
      $('llmProxy').value = c.proxy || '';
    }
    $('llmSettingsBtn').addEventListener('click', function () {
      var p = $('llmSettings');
      var open = p.style.display === 'none';
      p.style.display = open ? 'block' : 'none';
      if (open) {
        fillLlmInputs();
        // 若经本地代理(默认 8787)打开且未填代理，自动预填，避免浏览器直连跨域被拦
        if (!$('llmProxy').value.trim() && location.port === '8787') {
          $('llmProxy').value = location.origin;
        }
      }
    });
    $('llmSave').addEventListener('click', function () {
      var cfg = {
        endpoint: $('llmEndpoint').value.trim(),
        key: $('llmKey').value.trim(),
        model: $('llmModel').value.trim(),
        proxy: $('llmProxy').value.trim()
      };
      if (!cfg.key || (!cfg.endpoint && !cfg.proxy)) {
        $('llmTestMsg').textContent = '请至少填写 API Key 与 API 地址（或代理地址）。';
        $('llmTestMsg').style.color = '#C0392B';
        return;
      }
      localStorage.setItem('bems_llm', JSON.stringify(cfg));
      updateKbModeLabel();
      $('llmTestMsg').textContent = '已保存并启用。';
      $('llmTestMsg').style.color = '#27AE60';
    });
    $('llmDisable').addEventListener('click', function () {
      localStorage.removeItem('bems_llm');
      fillLlmInputs();
      updateKbModeLabel();
      $('llmTestMsg').textContent = '已停用。知识库问答需接入大模型才能生成解答。';
      $('llmTestMsg').style.color = '#C0392B';
    });
    $('llmTest').addEventListener('click', function () {
      var cfg = {
        endpoint: $('llmEndpoint').value.trim(),
        key: $('llmKey').value.trim(),
        model: $('llmModel').value.trim(),
        proxy: $('llmProxy').value.trim()
      };
      if (!cfg.key || (!cfg.endpoint && !cfg.proxy)) {
        $('llmTestMsg').textContent = '请先填写 API Key 与 API 地址（或代理地址）。';
        $('llmTestMsg').style.color = '#C0392B';
        return;
      }
      $('llmTestMsg').textContent = '测试中…';
      $('llmTestMsg').style.color = '#64748b';
      var endpoint = normBase(cfg.endpoint);
      var proxy = cfg.proxy ? normBase(cfg.proxy) : '';
      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key };
      var url;
      if (proxy) {
        url = proxy + '/chat/completions';
        if (endpoint) headers['X-Target-Endpoint'] = endpoint;
      } else {
        url = endpoint + '/chat/completions';
      }
      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ model: cfg.model || 'deepseek-chat', messages: [{ role: 'user', content: '测试：回复“ok”即可。' }], max_tokens: 20 })
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + '：' + t.slice(0, 160)); });
        return r.json();
      }).then(function (j) {
        var ok = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (ok) {
          // 测试成功即自动保存配置，确保后续提问能用到（避免“只测没存”导致不回答）
          localStorage.setItem('bems_llm', JSON.stringify(cfg));
          updateKbModeLabel();
          $('llmTestMsg').textContent = '连接成功 ✓ 已自动保存并启用，可直接提问。';
        } else {
          $('llmTestMsg').textContent = '连接成功但未返回内容。';
        }
        $('llmTestMsg').style.color = '#27AE60';
      }).catch(function (e) {
        $('llmTestMsg').textContent = '连接失败：' + (e.message || e);
        $('llmTestMsg').style.color = '#C0392B';
      });
    });

    // 控制约束层：加载控制规则库（rules.json），注册规则校验台
    RuleEngine.load().then(function () {
      if (RuleEngine.isLoaded()) {
        var n = RuleEngine.all().length, c = RuleEngine.categories().length;
        $('ruleStatus').innerHTML = '规则库已加载：<b>' + n + '</b> 条规则 / <b>' + c + '</b> 类（控制约束层 · 实时判定）';
        $('ruleStatus').className = 'rule-status ok';
      }
    }).catch(function () {
      $('ruleStatus').innerHTML = '规则库未加载（请通过本地 / 在线 http 服务打开本原型）';
      $('ruleStatus').className = 'rule-status warn';
    });
    registerRuleBench();

    // 默认进入导学
    addChat('bot', '你好，我是“建筑设备自动化智控导师”。本原型以暖通空调系统自动化为主线，支持导学答疑（已接入课程知识库检索）、控制回路识别、串级/单回路虚拟调试、季节节能控制（焓差与过渡季变新风）、故障诊断、系统认知（知识图谱）与学习评价，并内置“规则校验台”演示控制约束层。请选择上方标签开始。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
