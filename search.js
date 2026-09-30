/* =============================================================
 * search.js v2 — 课程知识库检索（轻量 RAG，离线可用，BM25 风格）
 * 改进：1)大块适配(B参数调优) 2)目录后过滤 3)概念级查询扩展 4)标题加权
 * 依赖：prototype/kb_index.json（由 build_kb_v2.py 生成）
 * 暴露全局：window.KB = { load, search, snippet, isReady }
 * ============================================================= */
(function (global) {
  'use strict';
  var K1 = 1.5, B = 0.4;  // B 降低：大块(600字)不需要过强的长度归一化
  var S = { ready: false, chunks: [], docs: [], df: {}, N: 0, avgdl: 0, toks: [] };

  // 中英文分词：ASCII 词（≥2）+ 中文二元文法
  function tokenize(text) {
    var toks = [];
    var m = String(text).toLowerCase().match(/[a-z0-9][a-z0-9\-]{1,}/g);
    if (m) for (var i = 0; i < m.length; i++) if (m[i].length >= 2) toks.push(m[i]);
    var cjk = String(text).match(/[一-鿿]+/g);
    if (cjk) for (var j = 0; j < cjk.length; j++) {
      var s = cjk[j];
      for (var k = 0; k < s.length - 1; k++) toks.push(s.substr(k, 2));
    }
    return toks;
  }

  // 中文术语 → 英文同义词桥接 + 概念级扩展
  var SYN = [
    // 控制策略
    ['串级', 'cascade'], ['级联', 'cascade'], ['串级控制', 'cascade control'],
    ['单回路', 'single loop'], ['单环', 'single loop'], ['单级', 'single loop'],
    ['前馈', 'feedforward'], ['反馈', 'feedback'], ['解耦', 'decoupling'], ['耦合', 'coupling'],
    ['闭环', 'closed loop'], ['开环', 'open loop'], ['开环', 'openloop'],
    // PID
    ['整定', 'tuning'], ['整定', 'tune'], ['整定', 'zieglernichols'], ['整定', 'critical'], ['整定', 'ultimate'], ['整定', 'relay'], ['整定', 'lambda'], ['整定', 'cohen'],
    ['临界比例度', 'zieglernichols'], ['临界比例度', 'ultimate'], ['临界比例度', 'critical'],
    ['衰减曲线', 'attenuation'], ['衰减曲线', 'decay'], ['衰减曲线', 'quarter'],
    ['试凑', 'trial'], ['试凑', 'trialerror'], ['试凑', 'error'],
    ['比例', 'proportional'], ['积分', 'integral'], ['微分', 'derivative'],
    ['比例度', 'proportional band'], ['比例带', 'proportional band'],
    // 焓/节能
    ['焓', 'enthalpy'], ['焓差', 'enthalpy'], ['焓差', 'economizer'], ['焓差控制', 'enthalpy control'],
    ['免费冷', 'free cooling'], ['经济器', 'economizer'], ['新风经济器', 'economizer'],
    ['变新风', 'economizer'], ['焓差', 'dry bulb'], ['焓差', 'wet bulb'],
    // 执行器/传感器
    ['变频', 'variable frequency'], ['变频', 'vfd'], ['变频', 'inverter'],
    ['恒压', 'constant pressure'], ['恒压', 'pressure'],
    ['传感器', 'sensor'], ['执行器', 'actuator'], ['阀门', 'valve'], ['阀', 'valve'],
    ['卡涩', 'stuck'], ['卡住', 'stuck'], ['卡涩', 'jam'], ['卡涩', 'binding'],
    // 给排水
    ['给排水', 'water supply'], ['供水', 'water supply'], ['排水', 'drainage'],
    // 节能/故障
    ['节能', 'energy saving'], ['节能', 'energy'], ['能耗', 'energy consumption'],
    ['露点', 'dew point'], ['防冻', 'freeze protection'], ['防冻', 'anti'], ['冻结', 'freeze'],
    ['振荡', 'oscillation'], ['超调', 'overshoot'], ['稳态', 'steady state'], ['稳态', 'steady'], ['扰动', 'disturbance'],
    ['诊断', 'diagnose'], ['诊断', 'diagnostic'], ['诊断', 'afdd'], ['故障', 'fault'], ['故障', 'fault'],
    // 精度/量程
    ['量程', 'range'], ['标定', 'calibration'], ['精度', 'accuracy'], ['精度', 'precision'],
    // 建筑设备
    ['供热', 'heating'], ['供暖', 'heating'], ['照明', 'lighting'],
    ['通信', 'communication'], ['通信', 'bacnet'], ['通信', 'modbus'],
    ['控制', 'control'], ['控制器', 'controller'], ['空调', 'air conditioning'], ['空调', 'hvac'], ['ahu', 'ahu'],
    ['新风', 'outdoor air'], ['新风', 'fresh air'], ['新风', 'economizer'], ['送风', 'supply air'],
    ['湿度', 'humidity'], ['温度', 'temperature'], ['回风', 'return air'], ['排风', 'exhaust air'],
    // 加湿/空气处理
    ['加湿', 'humidification'], ['加湿', 'humidifier'], ['加湿方法', 'humidification methods'],
    ['加湿', 'ultrasonic'], ['加湿', 'steam'], ['加湿', 'spray'], ['加湿', 'electrode'], ['加湿', 'infrared'],
    ['湿膜', 'wet media'], ['湿膜', 'wetted'], ['蒸汽加湿', 'steam humidification'],
    ['喷雾加湿', 'spray humidification'], ['电极加湿', 'electrode humidifier'], ['红外加湿', 'infrared humidifier'],
    ['超声波', 'ultrasonic'], ['高压喷雾', 'high pressure spray'],
    ['空气处理', 'air handling'], ['空气处理机组', 'air handling unit'], ['新风机组', 'air handling unit'],
    ['盘管', 'coil'], ['表冷器', 'cooling coil'], ['加热器', 'heating coil'], ['过滤器', 'filter'],
    ['相对湿度', 'relative humidity'], ['含湿量', 'humidity ratio'], ['加湿量', 'humidification capacity'],
    ['除湿', 'dehumidification'], ['除湿', 'dehumidifier'],
    // 控制理论
    ['一阶', 'first order'], ['一阶', 'first-order'], ['一阶系统', 'first order system'],
    ['二阶', 'second order'], ['二阶', 'second-order'],
    ['时间常数', 'time constant'], ['时间滞后', 'time lag'], ['时间延迟', 'time delay'],
    ['阶跃', 'step'], ['阶跃响应', 'step response'], ['传递函数', 'transfer function'],
    ['自衡', 'self regulating'], ['非自衡', 'non self regulating'],
    ['稳定性', 'stability'], ['稳定裕度', 'stability margin'], ['相位裕度', 'phase margin'],
    ['根轨迹', 'root locus'], ['频率响应', 'frequency response'], ['伯德图', 'bode'],
    ['拉普拉斯', 'laplace'], ['状态空间', 'state space'], ['可控性', 'controllability'],
    // 控制原理课件（新增，桥接原理类检索）
    ['拉氏变换', 'laplace'], ['拉氏变换', 'laplace transform'], ['拉普拉斯变换', 'laplace transform'],
    ['拉氏', 'laplace'], ['拉普拉斯', 'laplace transform'],
    ['被控对象', 'plant'], ['被控对象', 'controlled object'], ['对象特性', 'plant dynamics'], ['对象特性', 'object dynamics'],
    ['动态特性', 'dynamic characteristic'], ['动态特性', 'dynamics'], ['动态', 'dynamics'],
    ['数学模型', 'mathematical model'], ['建模', 'modeling'], ['理论建模', 'theoretical modeling'], ['实验建模', 'experimental modeling'],
    ['微分方程', 'differential equation'], ['微分方程组', 'differential equation'],
    ['典型环节', 'typical element'], ['典型环节', 'typical link'], ['环节', 'element'], ['环节', 'block'],
    ['单容对象', 'single capacity'], ['单容', 'single capacity'], ['多容对象', 'multi capacity'], ['多容', 'multi capacity'],
    ['容量系数', 'capacity coefficient'], ['容量', 'capacity'],
    ['阻力', 'resistance'], ['阻力系数', 'resistance'],
    ['控制规律', 'control law'], ['比例控制', 'proportional control'], ['积分控制', 'integral control'], ['微分控制', 'derivative control'],
    ['比例积分', 'pi'], ['比例微分', 'pd'], ['比例积分微分', 'pid'],
    ['稳态误差', 'steady state error'], ['稳态误差', 'steady error'],
    ['阻尼比', 'damping ratio'], ['阻尼', 'damping'], ['欠阻尼', 'underdamped'], ['过阻尼', 'overdamped'], ['临界阻尼', 'critical damping'],
    ['调节时间', 'settling time'], ['峰值时间', 'peak time'], ['上升时间', 'rise time'], ['超调量', 'percent overshoot'],
    ['衰减率', 'decay ratio'], ['衰减', 'decay'],
    ['主导极点', 'dominant pole'], ['闭环极点', 'closed loop pole'], ['闭环零点', 'closed loop zero'],
    ['频域', 'frequency domain'], ['时域', 'time domain'], ['频域分析', 'frequency domain analysis'],
    ['奈奎斯特', 'nyquist'], ['奈奎斯特图', 'nyquist plot'],
    ['相角裕度', 'phase margin'], ['幅值裕度', 'gain margin'], ['稳定判据', 'stability criterion'],
    ['劳斯', 'routh'], ['劳斯判据', 'routh hurwitz'], ['赫尔维茨', 'hurwitz'],
    ['单位负反馈', 'unity feedback'], ['误差传递函数', 'error transfer function'],
    ['系统分类', 'system classification'], ['定值控制', 'regulatory control'], ['随动控制', 'servo control'], ['程序控制', 'program control'],
    // 冷热源
    ['冷水机组', 'chiller'], ['冷水机', 'chiller'], ['冷却塔', 'cooling tower'],
    ['热泵', 'heat pump'], ['锅炉', 'boiler'], ['热交换器', 'heat exchanger'],
  ];

  function expandQuery(text) {
    var extra = [];
    var t = String(text);
    for (var i = 0; i < SYN.length; i++) {
      if (t.indexOf(SYN[i][0]) >= 0) {
        var parts = SYN[i][1].split(' ');
        for (var j = 0; j < parts.length; j++) if (parts[j].length >= 2) extra.push(parts[j]);
      }
    }
    return extra;
  }

  // 目录/噪声后过滤：检测检索结果中的目录条目、参考文献等
  function isTOCChunk(text) {
    var t = String(text);
    // 大量省略号/分隔点+页码（中英文目录）
    var dots = (t.match(/[\.·…·]{2,}/g) || []).length;
    if (dots >= 2) return true;
    // 连续编号+短文字+页码（如 "1 空气加湿的方法 1605"）
    var numberedLines = (t.match(/^\s*\d+\s+[一-鿿\w]{2,20}\s+\d{2,4}\s*$/gm) || []).length;
    if (numberedLines >= 3) return true;
    // 内联页码：文中出现3处以上"文字+3~4位数字"模式（OCR目录特征）
    var inlinePages = (t.match(/[一-鿿\w]\d{3,4}(?=\s|[一-鿿]|$)/g) || []).length;
    if (inlinePages >= 3) return true;
    // 高密度的短行（<30字）占整体比例
    var lines = t.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length >= 5) {
      var shortLines = lines.filter(function(l) { return l.trim().length < 30; }).length;
      if (shortLines / lines.length > 0.6) return true;
    }
    return false;
  }

  // 标题/章节加权：块开头若有章节标题特征，且标题包含查询词，加权
  function headingBoost(text, query) {
    var t = String(text).trim();
    var firstLine = t.split('\n')[0].trim();
    // 章节标题特征：第X章/X.X 标题/短行(≤40字)且不以句号结尾
    if (firstLine.length <= 40 && !/[。.！!?？]$/.test(firstLine)) {
      var qt = tokenize(query);
      for (var i = 0; i < qt.length; i++) {
        if (firstLine.toLowerCase().indexOf(qt[i]) >= 0) return 1.3; // 30% 加权
      }
    }
    return 1.0;
  }

  function load() {
    if (S.ready) return Promise.resolve(S.N);
    return fetch('kb_index.json').then(function (r) {
      if (!r.ok) throw new Error('kb_index.json ' + r.status);
      return r.json();
    }).then(function (idx) {
      S.docs = idx.docs || [];
      var chunks = idx.chunks || [];
      var df = {}, total = 0;
      S.toks = chunks.map(function (c) {
        var t = tokenize(c.t);
        for (var i = 0; i < t.length; i++) df[t[i]] = (df[t[i]] || 0) + 1;
        total += t.length;
        return t;
      });
      S.chunks = chunks; S.df = df; S.N = chunks.length;
      S.avgdl = total / Math.max(1, chunks.length);
      S.ready = true;
      return S.N;
    });
  }

  function search(query, k) {
    k = k || 3;
    if (!S.ready) return [];
    var qt = tokenize(query).concat(expandQuery(query));
    if (!qt.length) return [];
    var qf = {}; qt.forEach(function (w) { qf[w] = (qf[w] || 0) + 1; });
    var scored = [];
    for (var i = 0; i < S.chunks.length; i++) {
      var toks = S.toks[i];
      if (!toks.length) continue;
      var tf = {}; for (var j = 0; j < toks.length; j++) tf[toks[j]] = (tf[toks[j]] || 0) + 1;
      var score = 0;
      for (var w in qf) {
        var f = tf[w]; if (!f) continue;
        var dfw = S.df[w] || 0;
        var idf = Math.log(1 + (S.N - dfw + 0.5) / (dfw + 0.5));
        score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * toks.length / S.avgdl));
      }
      if (score > 0) {
        // 后处理：目录降权 + 标题加权
        var text = S.chunks[i].t || '';
        if (isTOCChunk(text)) score *= 0.15;           // 目录条目严重降权
        score *= headingBoost(text, query);               // 标题包含查询词加权
        scored.push({ i: i, score: score });
      }
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, k).map(function (s) {
      var c = S.chunks[s.i];
      var doc = S.docs[c.d] || { title: '?' };
      return { title: doc.title, page: c.p, text: c.t, score: s.score };
    });
  }

  // 查询词逆文档频率
  function idfOf(w) {
    var dfw = S.df[w] || 0;
    return Math.log(1 + (S.N - dfw + 0.5) / (dfw + 0.5));
  }
  function hasCJK(s) { return /[一-鿿]/.test(s); }

  // 噪声句过滤
  function isNoiseSentence(s) {
    if (/摘要|关键词|中图分类|文献标识|abstract|figure|fig\.|图\s*\d|表\s*\d|table\s*\d|doi|isbn|http|参考文献|references|equation|公式|（\d{4}）/.test(s)) return true;
    if (/^\s*[\d]+\s*[\.\)、]\s*[一-鿿]{0,4}$/.test(s)) return true;
    return false;
  }

  // 短语匹配加分
  function phraseBonus(s, query) {
    var b = 0, sl = s.toLowerCase();
    var en = String(query).toLowerCase().match(/[a-z0-9][a-z0-9\-]{3,}/g);
    if (en) en.forEach(function (w) { if (sl.indexOf(w) >= 0) b += 0.4; });
    var cjk = String(query).match(/[一-鿿]+/g);
    if (cjk) cjk.forEach(function (seg) {
      for (var i = 0; i < seg.length - 1; i++) { if (sl.indexOf(seg.substr(i, 2)) >= 0) b += 0.25; }
    });
    return b;
  }

  // 抽取式摘要（离线模式备用）
  function synthesizeAnswer(query, results, maxSentences) {
    maxSentences = maxSentences || 4;
    var qt = tokenize(query).concat(expandQuery(query));
    if (!qt.length || !results.length) return '';
    var qw = {};
    qt.forEach(function (w) { qw[w] = (qw[w] || 0) + idfOf(w); });
    var sentences = [];
    results.forEach(function (r) {
      var parts = String(r.text).split(/[。！？；\n]+|[.!?;\n]+/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length >= 14 && s.length <= 200 && !isNoiseSentence(s); });
      parts.forEach(function (s) {
        var sl = s.toLowerCase();
        var score = 0, hit = 0;
        for (var w in qw) { if (sl.indexOf(w) >= 0) { score += qw[w]; hit++; } }
        if (hit > 0) {
          if (hasCJK(s)) score *= 1.25;
          score += 1.6 * phraseBonus(s, query);
          sentences.push({ text: s, score: score, title: r.title, page: r.page });
        }
      });
    });
    if (!sentences.length) return '';
    sentences.sort(function (a, b) { return b.score - a.score; });
    var picked = [];
    for (var i = 0; i < sentences.length && picked.length < maxSentences; i++) {
      var s = sentences[i].text;
      var dup = false;
      for (var j = 0; j < picked.length; j++) {
        if (picked[j].text.substr(0, 15) === s.substr(0, 15)) { dup = true; break; }
      }
      if (!dup) picked.push(sentences[i]);
    }
    if (!picked.length) return '';
    var answer = picked.map(function (s) { return s.text; }).join('。');
    if (answer.charAt(answer.length - 1) !== '。') answer += '。';
    return answer;
  }

  // 生成带上下文的片段
  function snippet(text, query, len) {
    len = len || 300;
    var t = String(text);
    if (t.length <= len) return t;
    var q = tokenize(query).concat(expandQuery(query)).filter(function (w) { return w.length >= 2; });
    var pos = -1;
    for (var i = 0; i < q.length; i++) { var p = t.indexOf(q[i]); if (p >= 0) { pos = p; break; } }
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - Math.floor(len / 3));
    var s = t.substr(start, len);
    if (start > 0) s = '…' + s;
    if (start + len < t.length) s = s + '…';
    return s;
  }

  global.KB = {
    load: load, search: search, snippet: snippet, synthesizeAnswer: synthesizeAnswer,
    isReady: function () { return S.ready; },
    docCount: function () { return S.docs.length; },
    chunkCount: function () { return S.N; }
  };
})(window);
