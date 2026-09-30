/* 课程模块概览（美化版）与成绩评价：分学习阶段卡片网格 + 详情弹窗 */
(function (global) {
  'use strict';

  // 学习阶段分组（与课程模块 id 对应）
  var STAGES = [
    { key: 'basics', name: '控制原理基础', color: '#0ea5e9',
      ids: ['ctl_concept', 'laplace', 'typ_link', 'obj_char', 'pid_law', 'perf'] },
    { key: 'apply', name: '建筑设备应用', color: '#2563eb',
      ids: ['sensor', 'controller', 'actuator', 'airprocess', 'annual', 'fault'] },
    { key: 'adv', name: '系统类型进阶', color: '#0f766e',
      ids: ['vav', 'fcu'] }
  ];

  function scoreKey(id) { return 'bems_course_score_' + id + '_' + (localStorage.getItem('bems_active_user') || 'trial_user'); }
  function isDone(id) { return localStorage.getItem('bems_course_done_' + id) === '1'; }
  function doneCount(mods) { return mods.filter(function (m) { return isDone(m.id); }).length; }
  function sampleBank(bank, count) {
    var copy = bank.slice(), out = [];
    while (copy.length && out.length < count) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    return out;
  }

  function formatQuizStem(raw, index) {
    var text = String(raw || '').trim().replace(/[？?。]+$/, '');
    text = text
      .replace(/是什么$/, '是')
      .replace(/是指$/, '指')
      .replace(/属于哪一类系统$/, '所属系统类型为')
      .replace(/属于哪一类$/, '所属类别为')
      .replace(/属于哪一项$/, '所属项目为')
      .replace(/哪方面的特性$/, '的特性为');
    var types = ['概念填空', '工程情境', '关系匹配', '判断应用', '现场训练'];
    if (/（\s*）|\(\s*\)/.test(text)) return types[index % types.length] + '：' + text + '。';
    if (/(是|为|在|指|代表|宜|应|靠|由|用于|包括|依据|输出|输入|直接作用于|跟踪|保持|可|会|需)$/.test(text)) {
      return types[index % types.length] + '：' + text + '（    ）。';
    }
    var tails = ['（    ）。', '，应选（    ）。', '，对应项为（    ）。', '，最符合的是（    ）。', '，合理答案为（    ）。'];
    return types[index % types.length] + '：' + text + tails[index % tails.length];
  }

  function render() {
    var modules = global.COURSE_MODULES || [], nav = document.getElementById('courseModules');
    if (!nav || !modules.length) return;
    var byId = {}; modules.forEach(function (m) { byId[m.id] = m; });
    var summary = document.getElementById('courseSummary');

    nav.innerHTML = '';

    // —— 顶部进度条 ——
    var done = doneCount(modules);
    if (summary) summary.textContent = '课程模块进度：' + done + ' / ' + modules.length + '；建议先学控制原理基础，再按建筑设备应用、系统类型进阶顺序学习。';
    var pct = Math.round(done / modules.length * 100);
    var banner = document.createElement('div'); banner.className = 'course-progress';
    banner.innerHTML =
      '<div class="cp-num">' + done + '<span style="font-size:15px;color:#64748b"> / ' + modules.length + '</span></div>' +
      '<div class="cp-text"><div class="cp-label">已掌握课程模块</div>' +
      '<div class="cp-sub">完成模块学习并通过自测即可点亮 ✦ 建议顺序：控制原理基础 → 建筑设备应用 → 系统类型进阶</div></div>' +
      '<div class="cp-bar"><div class="cp-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="cp-pct">' + pct + '%</div>';
    nav.appendChild(banner);

    // —— 阶段分组卡片网格 ——
    var groups = document.createElement('div'); groups.className = 'course-groups';
    STAGES.forEach(function (st) {
      var sec = document.createElement('section'); sec.className = 'course-group';
      var h = document.createElement('div'); h.className = 'course-group-title';
      h.innerHTML = '<span class="dot" style="background:' + st.color + '"></span>' + st.name +
        ' <small style="color:#94a3b8;font-weight:400">（' + st.ids.length + ' 个模块）</small>';
      sec.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'course-grid';
      st.ids.forEach(function (id, i) {
        var m = byId[id]; if (!m) return;
        grid.appendChild(buildCard(m, i + 1, st.color));
      });
      sec.appendChild(grid); groups.appendChild(sec);
    });
    nav.appendChild(groups);

    // —— 详情弹窗 ——
    var backdrop = document.createElement('div'); backdrop.className = 'course-modal-backdrop'; backdrop.id = 'courseModal';
    var modal = document.createElement('div'); modal.className = 'course-modal';
    modal.innerHTML = '<button class="modal-close" aria-label="关闭">×</button><div class="course-modal-body"></div>';
    backdrop.appendChild(modal);
    nav.appendChild(backdrop);
    var body = modal.querySelector('.course-modal-body');
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    function openModule(id) {
      var m = byId[id]; if (!m) return;
      body.innerHTML = '';
      var head = document.createElement('div'); head.className = 'course-head';
      head.innerHTML = '<span class="course-icon" style="background:' + m.color + '">' + m.icon + '</span>' +
        '<div><h4>' + m.title + '</h4><span class="course-status">' +
        (isDone(m.id) ? '已完成 ✦' : '学习中') + '</span></div>';
      body.appendChild(head);
      var goal = document.createElement('p'); goal.className = 'course-goal'; goal.textContent = m.goal; body.appendChild(goal);
      var taskTitle = document.createElement('strong'); taskTitle.textContent = '学习任务'; body.appendChild(taskTitle);
      var ol = document.createElement('ol'); m.tasks.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }); body.appendChild(ol);
      var form = document.createElement('div'); form.className = 'course-quiz';
      var bank = sampleBank(m.quizzes || [], 5);
      bank.forEach(function (item, qi) {
        var q = document.createElement('p'); q.textContent = (qi + 1) + '. ' + formatQuizStem(item[0], qi); form.appendChild(q);
        item[1].forEach(function (opt, oi) {
          var label = document.createElement('label'); label.className = 'quiz-option';
          label.innerHTML = '<input type="radio" name="mquiz_' + m.id + '_' + qi + '" value="' + oi + '"> ' + opt; form.appendChild(label);
        });
      });
      var btn = document.createElement('button'); btn.className = 'btn-primary course-submit'; btn.textContent = '提交并生成成绩';
      var result = document.createElement('div'); result.className = 'course-result'; form.appendChild(btn); form.appendChild(result);
      var again = document.createElement('button'); again.className = 'btn course-again'; again.textContent = '再练练（随机5题）'; form.appendChild(again);
      var previous = localStorage.getItem(scoreKey(m.id));
      if (previous) result.textContent = '上次成绩：' + previous + ' 分';
      btn.addEventListener('click', function () {
        var correct = 0;
        for (var qi = 0; qi < bank.length; qi++) {
          var selected = form.querySelector('input[name="mquiz_' + m.id + '_' + qi + '"]:checked');
          if (!selected) { result.textContent = '请完成全部 ' + bank.length + ' 道题后提交'; return; }
          if (Number(selected.value) === bank[qi][2]) correct++;
        }
        var score = Math.round(correct / bank.length * 100);
        localStorage.setItem(scoreKey(m.id), String(score));
        if (score >= 60) localStorage.setItem('bems_course_done_' + m.id, '1');
        result.textContent = '本次成绩：' + score + ' 分（' + correct + '/' + bank.length + '）。' +
          (score >= 60 ? ' 模块已完成 ✦' : ' 未达60分，请复习后重做。');
        // 同步更新概览卡片状态 + 进度条
        var card = nav.querySelector('.mod-card[data-id="' + m.id + '"]');
        if (card) {
          var stEl = card.querySelector('.mod-state');
          if (stEl) { stEl.textContent = isDone(m.id) ? '已完成 ✦' : '学习中'; stEl.className = 'mod-state ' + (isDone(m.id) ? 'done' : 'todo'); }
        }
        refreshProgress();
      });
      again.addEventListener('click', function () { openModule(id); });
      body.appendChild(form);
      backdrop.classList.add('open');
    }
    function closeModal() { backdrop.classList.remove('open'); }
    function refreshProgress() {
      var d = doneCount(modules), p = Math.round(d / modules.length * 100);
      var fill = banner.querySelector('.cp-fill'); if (fill) fill.style.width = p + '%';
      var num = banner.querySelector('.cp-num'); if (num) num.innerHTML = d + '<span style="font-size:15px;color:#64748b"> / ' + modules.length + '</span>';
      var pctEl = banner.querySelector('.cp-pct'); if (pctEl) pctEl.textContent = p + '%';
      if (summary) summary.textContent = '课程模块进度：' + d + ' / ' + modules.length + '；建议先学控制原理基础，再按建筑设备应用、系统类型进阶顺序学习。';
    }

    // 卡片点击 → 弹窗
    groups.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.mod-card') : null;
      if (!card) return;
      openModule(card.getAttribute('data-id'));
    });

    // 知识图谱“前往练习”深链
    if (window.__KG_OPEN_MODULE) {
      var target = window.__KG_OPEN_MODULE; window.__KG_OPEN_MODULE = null;
      openModule(target);
    }
  }

  // 构建概览卡片
  function buildCard(m, idx, stageColor) {
    var card = document.createElement('button'); card.className = 'mod-card'; card.setAttribute('data-id', m.id);
    card.style.setProperty('--mc', m.color);
    var state = isDone(m.id) ? 'done' : 'todo';
    var stateText = isDone(m.id) ? '已完成 ✦' : '学习中';
    var quizN = (m.quizzes || []).length || (m.quiz ? 1 : 0);
    card.innerHTML =
      '<span class="mod-index">' + (idx < 10 ? '0' + idx : idx) + '</span>' +
      '<div class="mod-top"><span class="mod-icon" style="background:' + m.color + '">' + m.icon + '</span>' +
      '<h4 class="mod-title">' + m.title + '</h4></div>' +
      '<span class="mod-stage" style="background:' + hexA(stageColor, .12) + ';color:' + stageColor + '">查看详情 ›</span>' +
      '<p class="mod-goal">' + m.goal + '</p>' +
      '<div class="mod-foot"><span class="mod-state ' + state + '">' + stateText + '</span>' +
      '<span class="mod-meta">' + m.tasks.length + ' 任务 · ' + quizN + ' 题</span></div>';
    return card;
  }

  // 16进制颜色 + alpha → rgba
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})(window);
