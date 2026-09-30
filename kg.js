/* =============================================================
 * kg.js — 系统认知 · 知识图谱可视化（教学智能体原型）
 * 解决学生“看不到系统 / 知识串不起来”痛点。
 * 纯前端、零依赖、可离线运行；点击节点查看角色与关联练习。
 * 暴露全局：window.KG = { init }
 * ============================================================= */
(function (global) {
  'use strict';

  var COLOR = {
    proc: '#5B8DB8',   // 空气处理段
    sensor: '#27AE60', // 传感器
    act: '#E67E22',    // 执行器
    ctrl: '#8E44AD',   // 控制器
    domain: '#34495E', // 课程知识域
    loop: '#C0392B',   // 控制回路要素
    leaf: '#16A085',   // 扩展能力（诊断/节能）
    coursecore: '#B45309' // 课程图谱中心核心（琥珀，呼应控制原理核心）
  };

  /* ---------------- 空调机组系统结构（实物剖视图坐标） ---------------- */
  var AHU_Y = 150, AHU_H = 120, AHU_CY = 210; // AHU 外壳 Y / 高度 / 中心 Y
  var SYS_BOXES = [
    { id: 'mix', x: 129, w: 42, label: '混合段', type: 'proc', desc: '新风与回风汇合后先进入混合段，再经过过滤段。新风阀与回风阀由 DDC 协调调节新风比。', module: 'season' },
    { id: 'filter', x: 187, w: 75, label: '过滤段', type: 'proc', desc: '过滤新风/回风中的颗粒物，保护后续盘管并满足洁净度要求。堵塞会导致风量不足、风机过载。', module: 'fault' },
    { id: 'coil', x: 362, w: 76, label: '表冷段', type: 'proc', desc: '通冷冻水（7℃），对空气冷却并除湿；由冷水阀调节冷量。是送风温度串级控制的核心被控对象。', module: 'debug' },
    { id: 'heat', x: 270, w: 76, label: '加热段', type: 'proc', desc: '通热水/蒸汽，对空气再热，用于除湿后控温（再热）或冬季加热。', module: 'debug' },
    { id: 'hum', x: 457, w: 95, label: '加湿段', type: 'proc', desc: '对空气加湿（蒸汽/高压喷雾），满足送风湿度要求；失效会造成湿度失控。', module: 'fault' },
    { id: 'fan', x: 592, w: 170, label: '送风机', type: 'proc', desc: '变频驱动，把处理好的空气送往房间；频率决定风量。未运行禁止开水阀（风机-水阀联锁）。', module: 'debug' }
  ];
  var SYS_SENSORS = [
    { id: 's_out', x: 80, y: 102, dir: 'down', label: '新风温湿度', type: 'sensor', desc: '测室外新风温湿度，用于焓差判定与免费冷策略。', module: 'season' },
    { id: 's_filter_dp', x: 188, y: 112, dir: 'down', label: '过滤器压差', type: 'sensor', desc: '分别从过滤器前后取压，压差传感器将差压信号接入 DDC；压差过大时提示过滤器堵塞并产生维护报警。', module: 'fault' },
    { id: 's_freeze', x: 318, y: 122, dir: 'down', label: '低温防冻开关', type: 'sensor', desc: '安装在加热段后，检测低温危险并向 DDC 发出开关量报警；触发后执行关小新风阀、开大热水阀等防冻联锁。', module: 'fault' },
    { id: 's_sup', x: 660, y: 175, dir: 'down', label: '送风温湿度', type: 'sensor', desc: '测送风温度/湿度，构成主环（外环）被控变量反馈。', module: 'debug' },
    { id: 's_ret', x: 620, y: 305, dir: 'up', label: '回风温湿度', type: 'sensor', desc: '测回风温湿度，间接反映房间负荷与舒适度。', module: 'season' }
  ];
  var SYS_ACTS = [
    { id: 'a_oav', x: 80, y: 140, label: '新风阀', type: 'act', desc: '由 DDC 调节新风量；低温防冻开关动作时联动关小至防冻安全位。', module: 'season' },
    { id: 'a_rav', x: 80, y: 280, label: '回风阀', type: 'act', desc: '由 DDC 调节回风量，并与新风阀协调动作以维持总风量和新风比。', module: 'season' },
    { id: 'a_cold', x: 362, y: 350, label: '冷水阀', type: 'act', desc: '调节冷水流量控制冷却量；受 DDC 输出驱动，卡涩会致稳态误差。', module: 'debug' },
    { id: 'a_heat', x: 270, y: 350, label: '加热阀', type: 'act', desc: '调节热水/蒸汽流量控制再热量。', module: 'debug' },
    { id: 'a_hum', x: 457, y: 350, label: '加湿阀', type: 'act', desc: '调节加湿量；失效是湿度失控的典型原因。', module: 'fault' },
    { id: 'a_fan', x: 592, y: 350, label: '风机变频', type: 'act', desc: '调节风机频率/风量；未运行禁止开水阀（风机-水阀联锁）。', module: 'debug' }
  ];
  var DDC = { x: 296, y: 388, w: 128, h: 42, label: 'DDC 控制器', type: 'ctrl', desc: '读取传感器信号，按控制算法运算，输出指令驱动执行器。是全系统的"大脑"。' };

  /* ---------------- 课程知识图谱（下篇·楼宇自动化） ---------------- */
  // 依据《自控原理与楼宇自动化—知识图谱1.xlsx》的 11 个一级模块构建环形图。
  var KG_DOMAIN = [
    { id:'d_overview', label:'暖通空调系统\n自动化概述', type:'domain', desc:'暖通空调与自动化的关系；自动化的意义；系统组成、分类、控制网络及发展趋势。', module:'' },
    { id:'d_sensor', label:'常用传感器', type:'domain', desc:'传感器性能参数与变送器；温度、湿度、压力、流量、空气质量传感器；能源计量与抗干扰接地。', module:'sensor' },
    { id:'d_act', label:'常用执行器', type:'domain', desc:'两位/连续调节阀、流量特性与选型；电动风量阀、文丘里阀、电气执行器与变频器。', module:'actuator' },
    { id:'d_controller', label:'常用控制器', type:'domain', desc:'简单控制器、数字控制器、PLC 与智能网络控制器，涵盖组成、工作原理和典型应用。', module:'controller' },
    { id:'d_network', label:'计算机网络\n控制系统', type:'domain', desc:'计算机控制、DCS、现场总线、工业以太网、物联网架构、组态软件与网络安全。', module:'' },
    { id:'d_equipment', label:'常用设备\n控制方法', type:'domain', desc:'水泵、风机、电动机、电加热器、加湿器、锅炉、冷水机组和换热器的控制方法。', module:'' },
    { id:'d_water', label:'空调水输配\n系统控制', type:'domain', desc:'冷热源与管网；定流量/变流量系统；泵组、冷水机组、冷却塔及换热站控制。', module:'' },
    { id:'d_heating', label:'供热系统\n调节与控制', type:'domain', desc:'末端室温调控、热力入口与管网调节、换热站监控、热源优化和智慧供热。', module:'' },
    { id:'d_vent', label:'通风系统\n自动控制', type:'domain', desc:'一般通风、地下车库、防排烟及电子洁净厂房通风系统的自动控制。', module:'' },
    { id:'d_central', label:'中央空调系统\n自动控制', type:'domain', desc:'全年运行、新风系统、全空气定风量、风机盘管、VAV、VRV 与蓄能空调系统控制。', module:'annual' },
    { id:'d_smart', label:'智能建筑与\n能耗监测', type:'domain', desc:'智能建筑、BAS、安全防范、火灾报警、建筑能耗监测与智慧建筑案例。', module:'' }
  ];
  var KG_LOOP = [
    { id: 'l_obj', x: 360, y: 130, label: '被控对象', type: 'loop', desc: '如空调机组盘管段（空气处理段），要被控制的物理设备。', module: 'loop' },
    { id: 'l_cv', x: 470, y: 195, label: '被控变量', type: 'loop', desc: '如送风温度/湿度，希望稳定的输出量。', module: 'debug' },
    { id: 'l_meas', x: 470, y: 315, label: '测量元件', type: 'loop', desc: '如送风温度传感器，把被控变量反馈给控制器。', module: 'loop' },
    { id: 'l_ctrl', x: 360, y: 380, label: '控制器', type: 'loop', desc: '如 DDC，比较设定值与被控变量，输出校正指令。', module: 'loop' },
    { id: 'l_act', x: 250, y: 315, label: '执行机构', type: 'loop', desc: '如电动调节阀，接收控制器指令改变操纵变量。', module: 'debug' },
    { id: 'l_mv', x: 250, y: 195, label: '操纵变量', type: 'loop', desc: '如冷水阀开度，直接作用于被控对象改变其状态。', module: 'debug' }
  ];
  // 闭环连线顺序（负反馈）
  var LOOP_ORDER = ['l_obj', 'l_cv', 'l_meas', 'l_ctrl', 'l_act', 'l_mv'];
  // 知识域 → 回路要素 的关联（让碎片化知识“串起来”）
  var KG_CROSS = [
    ['d_hvac', 'l_obj'], ['d_ctrl', 'l_ctrl'], ['d_ddc', 'l_ctrl'],
    ['d_sensor', 'l_meas'], ['d_act', 'l_act'],
    ['d_fault', 'l_act'], ['d_energy', 'l_mv'],
    ['d_vav', 'l_ctrl'], ['d_fcu', 'l_obj'], ['d_enthalpy', 'l_mv'],
    ['d_freeze', 'l_act'], ['d_sequence', 'l_ctrl'],
    ['d_vent', 'l_obj'], ['d_heat', 'l_obj']
  ];
  // 闭环边上的简短标注
  var LOOP_LABELS = { 'l_obj->l_cv': '控', 'l_cv->l_meas': '测', 'l_meas->l_ctrl': '比', 'l_ctrl->l_act': '驱', 'l_act->l_mv': '调', 'l_mv->l_obj': '作用' };

  /* ---------------- SVG 基础工具 ---------------- */
  var DEFS = '<defs>' +
    '<marker id="kgArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">' +
    '<path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8"/></marker>' +
    '<marker id="kgArrowR" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">' +
    '<path d="M0,0 L8,3 L0,6 Z" fill="#C0392B"/></marker>' +
    '<marker id="kgArrowP" markerWidth="11" markerHeight="11" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">' +
    '<path d="M0,0 L8,3 L0,6 Z" fill="#7C3AED"/></marker>' +
    '<radialGradient id="kgCoreGrad" cx="50%" cy="34%" r="75%">' +
    '<stop offset="0%" stop-color="#FBBF24"/><stop offset="55%" stop-color="#D97706"/><stop offset="100%" stop-color="#B45309"/></radialGradient>' +
    '<linearGradient id="kgTheoryGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient>' +
    '<linearGradient id="kgEdgeGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient>' +
    '<radialGradient id="kgBgGlow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ede9fe" stop-opacity="0.95"/><stop offset="65%" stop-color="#ede9fe" stop-opacity="0.3"/><stop offset="100%" stop-color="#ede9fe" stop-opacity="0"/></radialGradient>' +
    '<filter id="kgGlow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#B45309" flood-opacity="0.5"/></filter>' +
    '<filter id="kgSoft" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="3" flood-color="#4c1d95" flood-opacity="0.3"/></filter>' +
    '<style>@keyframes kgCorePulse{0%{opacity:.18}50%{opacity:.55}100%{opacity:.18}}' +
    '.kg-core-ring{animation:kgCorePulse 3.2s ease-in-out infinite}' +
    '.kg-tnode rect,.kg-core rect{transition:filter .15s ease}' +
    '.kg-tnode:hover rect,.kg-core:hover rect{filter:brightness(1.08)}</style>' +
    '</defs>';

  /* 控制原理图谱专用 defs：使用唯一 ID（th 前缀），避免与课程图谱/系统图的
     全局 DEFS 发生 id 冲突（重复 id 会导致 url(#...) 引用解析到其它 SVG 中
     处于 display:none 的渐变定义，从而矩形透明、白字“消失”）。 */
  var TH_DEFS = '<defs>' +
    '<marker id="thArrowP" markerWidth="11" markerHeight="11" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">' +
    '<path d="M0,0 L8,3 L0,6 Z" fill="#7C3AED"/></marker>' +
    '<radialGradient id="thCoreGrad" cx="50%" cy="34%" r="75%">' +
    '<stop offset="0%" stop-color="#FBBF24"/><stop offset="55%" stop-color="#D97706"/><stop offset="100%" stop-color="#B45309"/></radialGradient>' +
    '<linearGradient id="thModGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient>' +
    '<linearGradient id="thEdgeGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient>' +
    '<radialGradient id="thBgGlow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ede9fe" stop-opacity="0.95"/><stop offset="65%" stop-color="#ede9fe" stop-opacity="0.3"/><stop offset="100%" stop-color="#ede9fe" stop-opacity="0"/></radialGradient>' +
    '<filter id="thGlow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#B45309" flood-opacity="0.5"/></filter>' +
    '<filter id="thSoft" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="3" flood-color="#4c1d95" flood-opacity="0.3"/></filter>' +
    '<style>@keyframes kgCorePulse{0%{opacity:.18}50%{opacity:.55}100%{opacity:.18}}' +
    '.kg-core-ring{animation:kgCorePulse 3.2s ease-in-out infinite}' +
    '.kg-tnode rect,.kg-core rect{transition:filter .15s ease}' +
    '.kg-tnode:hover rect,.kg-core:hover rect{filter:brightness(1.08)}</style>' +
    '</defs>';

  /* 课程知识图谱专用 defs：唯一 gr 前缀 id，避免与理论图 TH_DEFS / 系统图 defs 冲突。
     配色呼应控制原理图：课程域=紫、扩展能力=青、回路要素=红、中心核心=琥珀。 */
  var GR_DEFS = '<defs>' +
    '<marker id="grArrowR" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">' +
    '<path d="M0,0 L8,3 L0,6 Z" fill="#C0392B"/></marker>' +
    '<linearGradient id="grDomainGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient>' +
    '<linearGradient id="grLeafGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2DD4BF"/><stop offset="100%" stop-color="#0D9488"/></linearGradient>' +
    '<linearGradient id="grLoopGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#F87171"/><stop offset="100%" stop-color="#B91C1C"/></linearGradient>' +
    '<linearGradient id="grEdgeGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient>' +
    '<radialGradient id="grCenterGrad" cx="50%" cy="34%" r="75%">' +
    '<stop offset="0%" stop-color="#FBBF24"/><stop offset="55%" stop-color="#D97706"/><stop offset="100%" stop-color="#B45309"/></radialGradient>' +
    '<radialGradient id="grBgGlow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ede9fe" stop-opacity="0.9"/><stop offset="65%" stop-color="#ede9fe" stop-opacity="0.25"/><stop offset="100%" stop-color="#ede9fe" stop-opacity="0"/></radialGradient>' +
    '<filter id="grGlow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#B45309" flood-opacity="0.5"/></filter>' +
    '<filter id="grSoft" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="3" flood-color="#4c1d95" flood-opacity="0.3"/></filter>' +
    '<style>@keyframes kgCorePulse{0%{opacity:.18}50%{opacity:.55}100%{opacity:.18}}' +
    '.kg-core-ring{animation:kgCorePulse 3.2s ease-in-out infinite}' +
    '.kg-cnode rect,.kg-core rect{transition:filter .15s ease}' +
    '.kg-cnode:hover rect,.kg-core:hover rect{filter:brightness(1.08)}</style>' +
    '</defs>';

  function rect(x, y, w, h, fill) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + fill + '" opacity="0.94"/>';
  }
  function txt(x, y, label, color, size) {
    var lines = String(label).split('\n');
    var t = '';
    lines.forEach(function (ln, i) {
      var dy = (i - (lines.length - 1) / 2) * 13;
      t += '<text x="' + x + '" y="' + (y + dy) + '" fill="' + (color || '#fff') + '" font-size="' + (size || 12) +
        '" text-anchor="middle" dominant-baseline="middle">' + ln + '</text>';
    });
    return t;
  }
  function nodeG(n, w, h, fill) {
    var desc = n.desc || '';
    var mod = n.module || '';
    return '<g class="kg-node" data-label="' + esc(n.label) + '" data-type="' + n.type + '" data-desc="' + esc(desc) +
      '" data-module="' + mod + '" style="cursor:pointer">' +
      rect(n.x - w / 2, n.y - h / 2, w, h, fill) +
      txt(n.x, n.y, n.label, '#fff', 12) + '</g>';
  }
  // 课程图谱节点：纯色兜底 + 渐变层(class=kg-fill) + 柔和阴影 + 顶部高光 + 白字
  function courseNode(n, w, h, gradId, solid, stroke) {
    var x = n.x - w / 2, y = n.y - h / 2;
    var html = '<g class="kg-node kg-cnode" data-label="' + esc(n.label) + '" data-type="' + n.type +
      '" data-desc="' + esc(n.desc || '') + '" data-module="' + (n.module || '') + '" style="cursor:pointer">';
    html += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="13" fill="' + solid + '"/>';
    html += '<rect class="kg-fill" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="13" fill="url(#' + gradId + ')" stroke="' + stroke + '" stroke-width="1.4" filter="url(#grSoft)"/>';
    html += '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="' + (w - 8) + '" height="7" rx="3.5" fill="#ffffff" opacity="0.20"/>';
    html += txt(n.x, n.y, n.label, '#fff', 12);
    html += '</g>';
    return html;
  }
  // 课程图谱中心核心：琥珀径向渐变 + 外发光 + 内描边（呼应控制原理核心）
  function courseCore(x, y) {
    var w = 158, h = 48, x0 = x - w / 2, y0 = y - h / 2;
    var html = '<g class="kg-node kg-core" data-label="' + esc('下篇·楼宇自动化') + '" data-type="coursecore' +
      '" data-desc="' + esc('依据课程知识图谱 Excel 的下篇结构，统领暖通空调自动化、感知与执行、控制器与网络、设备与系统控制、智能建筑与能耗监测等 11 个一级模块。') +
      '" data-module="" style="cursor:pointer">';
    html += '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="16" fill="#B45309"/>';
    html += '<rect class="kg-fill" x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="16" fill="url(#grCenterGrad)" stroke="#92400e" stroke-width="2" filter="url(#grGlow)"/>';
    html += '<rect x="' + (x0 + 5) + '" y="' + (y0 + 5) + '" width="' + (w - 10) + '" height="' + (h - 10) + '" rx="11" fill="none" stroke="#FDE68A" stroke-width="1.3" opacity="0.85"/>';
    html += txt(x, y, '下篇\n楼宇自动化', '#fff', 14);
    html += '</g>';
    return html;
  }
  // 闭环边上的动作徽标：浅红底 + 深红字 + 红边（浅色芯片，干净且对比清晰）
  function loopBadge(x, y, label) {
    var single = label.length <= 1;
    var rx = single ? 15 : 21, ry = 15;
    var fill = '#FEE2E2', stroke = '#DC2626', textCol = '#B91C1C';
    var html = '<g class="kg-loop-badge">';
    if (single) {
      html += '<circle cx="' + x + '" cy="' + y + '" r="' + rx + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
    } else {
      html += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
    }
    html += '<text x="' + x + '" y="' + y + '" fill="' + textCol + '" font-size="12.5" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + esc(label) + '</text>';
    html += '</g>';
    return html;
  }
  function arrow(x1, y1, x2, y2, color, dash, marker) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (color || '#94a3b8') +
      '" stroke-width="2" ' + (dash ? 'stroke-dasharray="5 4" ' : '') + 'marker-end="url(#' + (marker || 'kgArrow') + ')"/>';
  }
  function esc(s) { return String(s).replace(/"/g, '&quot;'); }

  /* ---------------- 实物风格组件绘制辅助 ---------------- */
  // 画盘管（管排 + 翅片 + 联箱弯头）
  function drawCoil(x, y, w, h, tubeColor, finColor) {
    var s = '', rows = 5, sp = h / (rows + 1);
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" stroke="#94A3B8" stroke-width="1" rx="3"/>';
    for (var r = 1; r <= rows; r++)
      s += '<line x1="' + (x + 5) + '" y1="' + (y + sp * r) + '" x2="' + (x + w - 5) + '" y2="' + (y + sp * r) + '" stroke="' + tubeColor + '" stroke-width="3" stroke-linecap="round"/>';
    for (var f = x + 8; f < x + w - 4; f += 6)
      s += '<line x1="' + f + '" y1="' + (y + 4) + '" x2="' + f + '" y2="' + (y + h - 4) + '" stroke="' + finColor + '" stroke-width="0.6"/>';
    s += '<path d="M' + (x + 5) + ',' + (y + sp) + ' L' + (x - 3) + ',' + (y + sp) + ' L' + (x - 3) + ',' + (y + sp * 2) + '" fill="none" stroke="' + tubeColor + '" stroke-width="2.5"/>';
    s += '<path d="M' + (x + 5) + ',' + (y + sp * 3) + ' L' + (x - 3) + ',' + (y + sp * 3) + ' L' + (x - 3) + ',' + (y + sp * 4) + '" fill="none" stroke="' + tubeColor + '" stroke-width="2.5"/>';
    s += '<path d="M' + (x + w - 5) + ',' + (y + sp * 2) + ' L' + (x + w + 3) + ',' + (y + sp * 2) + ' L' + (x + w + 3) + ',' + (y + sp * 3) + '" fill="none" stroke="' + tubeColor + '" stroke-width="2.5"/>';
    s += '<path d="M' + (x + w - 5) + ',' + (y + sp * 4) + ' L' + (x + w + 3) + ',' + (y + sp * 4) + ' L' + (x + w + 3) + ',' + (y + sp * 5) + '" fill="none" stroke="' + tubeColor + '" stroke-width="2.5"/>';
    return s;
  }
  // 画阀门（蝴蝶阀体 + 执行器方块）
  function drawValve(cx, cy) {
    var sz = 7, s = '';
    s += '<polygon points="' + (cx - sz) + ',' + (cy - sz) + ' ' + (cx - sz) + ',' + (cy + sz) + ' ' + cx + ',' + cy + '" fill="' + COLOR.act + '" fill-opacity="0.25" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<polygon points="' + (cx + sz) + ',' + (cy - sz) + ' ' + (cx + sz) + ',' + (cy + sz) + ' ' + cx + ',' + cy + '" fill="' + COLOR.act + '" fill-opacity="0.25" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<rect x="' + (cx - 4) + '" y="' + (cy - sz - 7) + '" width="8" height="7" rx="1" fill="' + COLOR.act + '"/>';
    return s;
  }
  // 画传感器探头（圆头 + 探杆）
  function drawSensor(cx, cy, dir) {
    var s = '';
    if (dir === 'up') s += '<line x1="' + cx + '" y1="' + (cy - 7) + '" x2="' + cx + '" y2="' + (cy - 22) + '" stroke="' + COLOR.sensor + '" stroke-width="2"/>';
    else s += '<line x1="' + cx + '" y1="' + (cy + 7) + '" x2="' + cx + '" y2="' + (cy + 22) + '" stroke="' + COLOR.sensor + '" stroke-width="2"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="rgba(39,174,96,0.12)" stroke="' + COLOR.sensor + '" stroke-width="2"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="2.5" fill="' + COLOR.sensor + '"/>';
    return s;
  }

  /* ---------------- 渲染：系统结构图（实物剖视图） ---------------- */
  function renderSystem() {
    var W = 720, H = 440, s = '';

    // ---- DEFS ----
    s += '<defs>' +
      '<marker id="kgArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8"/></marker>' +
      '<marker id="kgArrowR" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="#C0392B"/></marker>' +
      '<marker id="kgArrowB" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="#5B8DB8"/></marker>' +
      '<marker id="kgArrowG" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="#7f8c8d"/></marker>' +
      '<linearGradient id="ahuG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F0F4F8"/><stop offset="100%" stop-color="#D5DDE6"/></linearGradient>' +
      '<pattern id="fPat" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#5B8DB8" stroke-width="1.2"/></pattern>' +
      '<style>@keyframes kgFanSpin{to{transform:rotate(360deg)}} .kg-fan-spin{transform-box:fill-box;transform-origin:center;animation:kgFanSpin 1.8s linear infinite}</style>' +
      '</defs>';

    // ---- AHU 外壳 ----
    s += '<rect x="30" y="' + AHU_Y + '" width="650" height="' + AHU_H + '" rx="6" fill="url(#ahuG)" stroke="#5B8DB8" stroke-width="2.5"/>';
    [150, 225, 315, 410, 505].forEach(function (dx) {
      s += '<line x1="' + dx + '" y1="' + AHU_Y + '" x2="' + dx + '" y2="' + (AHU_Y + AHU_H) + '" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4,3"/>';
    });
    // 混合段左边界
    s += '<line x1="108" y1="' + AHU_Y + '" x2="108" y2="' + (AHU_Y + AHU_H) + '" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4,3"/>';

    // ---- ① 混合段：新风/回风百叶风门 ----
    var mx = 52, mw = 56;
    s += '<rect x="' + mx + '" y="' + (AHU_Y - 20) + '" width="' + mw + '" height="20" fill="url(#ahuG)" stroke="#5B8DB8" stroke-width="2"/>';
    for (var d = 0; d < 4; d++)
      s += '<line x1="' + (mx + 6 + d * 12) + '" y1="' + (AHU_Y - 17) + '" x2="' + (mx + 14 + d * 12) + '" y2="' + (AHU_Y - 3) + '" stroke="#5B8DB8" stroke-width="2"/>';
    s += '<text x="' + (mx + mw / 2) + '" y="' + (AHU_Y - 26) + '" fill="#5B8DB8" font-size="10" text-anchor="middle" font-weight="600">新风</text>';
    s += '<path d="M' + (mx + mw / 2) + ',' + (AHU_Y - 38) + ' L' + (mx + mw / 2) + ',' + (AHU_Y - 22) + '" stroke="#5B8DB8" stroke-width="1.5" marker-end="url(#kgArrowB)"/>';
    s += '<rect x="' + mx + '" y="' + (AHU_Y + AHU_H) + '" width="' + mw + '" height="20" fill="url(#ahuG)" stroke="#7f8c8d" stroke-width="2"/>';
    for (var d2 = 0; d2 < 4; d2++)
      s += '<line x1="' + (mx + 6 + d2 * 12) + '" y1="' + (AHU_Y + AHU_H + 3) + '" x2="' + (mx + 14 + d2 * 12) + '" y2="' + (AHU_Y + AHU_H + 17) + '" stroke="#7f8c8d" stroke-width="2"/>';
    // 两只混合风阀的电动执行器标识
    s += '<rect x="110" y="132" width="18" height="16" rx="3" fill="#FFF7ED" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<line x1="108" y1="140" x2="110" y2="140" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<text x="137" y="143" fill="' + COLOR.act + '" font-size="9">新风阀</text>';
    s += '<rect x="110" y="272" width="18" height="16" rx="3" fill="#FFF7ED" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<line x1="108" y1="280" x2="110" y2="280" stroke="' + COLOR.act + '" stroke-width="1.5"/>';
    s += '<text x="137" y="283" fill="' + COLOR.act + '" font-size="9">回风阀</text>';
    s += '<text x="80" y="313" fill="#7f8c8d" font-size="10" text-anchor="middle" font-weight="600">回风</text>';

    // ---- ② 过滤段：斜线滤网 ----
    s += '<rect x="158" y="' + (AHU_Y + 8) + '" width="60" height="' + (AHU_H - 16) + '" rx="3" fill="url(#fPat)" stroke="#5B8DB8" stroke-width="1.5"/>';
    s += '<rect x="156" y="' + (AHU_Y + 6) + '" width="64" height="' + (AHU_H - 12) + '" rx="4" fill="none" stroke="#5B8DB8" stroke-width="1" opacity="0.4"/>';
    // 过滤器前后取压点与压差传感器
    s += '<circle cx="156" cy="' + (AHU_Y + 8) + '" r="2.5" fill="' + COLOR.sensor + '"/>';
    s += '<circle cx="220" cy="' + (AHU_Y + 8) + '" r="2.5" fill="' + COLOR.sensor + '"/>';
    s += '<path d="M156,' + (AHU_Y + 8) + ' L156,112 L177,112 M220,' + (AHU_Y + 8) + ' L220,112 L199,112" stroke="' + COLOR.sensor + '" stroke-width="1.5" fill="none"/>';
    s += '<circle cx="188" cy="112" r="11" fill="#F0FFF4" stroke="' + COLOR.sensor + '" stroke-width="1.8"/>';
    s += '<text x="188" y="116" fill="' + COLOR.sensor + '" font-size="9" text-anchor="middle" font-weight="700">ΔP</text>';
    s += '<text x="188" y="94" fill="' + COLOR.sensor + '" font-size="9" text-anchor="middle">过滤器压差</text>';

    // ---- ③ 表冷段：冷却盘管 + 冷冻水管 ----
    s += drawCoil(324, AHU_Y + 8, 76, AHU_H - 16, '#3498DB', '#A8C8E0');
    s += '<line x1="362" y1="' + (AHU_Y + AHU_H) + '" x2="362" y2="350" stroke="#3498DB" stroke-width="2.5"/>';
    s += '<text x="340" y="320" fill="#3498DB" font-size="9" text-anchor="end">冷冻水</text>';

    // ---- ④ 加热段：加热盘管 + 热水管 ----
    s += drawCoil(232, AHU_Y + 8, 76, AHU_H - 16, '#E74C3C', '#F5B7B1');
    s += '<line x1="270" y1="' + (AHU_Y + AHU_H) + '" x2="270" y2="350" stroke="#E74C3C" stroke-width="2.5"/>';
    s += '<text x="248" y="320" fill="#E74C3C" font-size="9" text-anchor="end">热水</text>';

    // ---- ⑤ 加湿段：喷嘴 + 水滴 + 加湿管 ----
    s += '<line x1="420" y1="' + (AHU_Y + 12) + '" x2="495" y2="' + (AHU_Y + 12) + '" stroke="#16A085" stroke-width="2.5"/>';
    [432, 450, 468, 486].forEach(function (nx) {
      s += '<polygon points="' + nx + ',' + (AHU_Y + 12) + ' ' + (nx - 4) + ',' + (AHU_Y + 20) + ' ' + (nx + 4) + ',' + (AHU_Y + 20) + '" fill="#16A085"/>';
      s += '<circle cx="' + nx + '" cy="' + (AHU_Y + 28) + '" r="1.5" fill="#16A085" opacity="0.5"/>';
      s += '<circle cx="' + (nx - 2) + '" cy="' + (AHU_Y + 40) + '" r="1.2" fill="#16A085" opacity="0.4"/>';
      s += '<circle cx="' + (nx + 3) + '" cy="' + (AHU_Y + 36) + '" r="1" fill="#16A085" opacity="0.3"/>';
    });
    s += '<line x1="457" y1="' + (AHU_Y + AHU_H) + '" x2="457" y2="350" stroke="#16A085" stroke-width="2.5"/>';
    s += '<text x="482" y="320" fill="#16A085" font-size="9">加湿管</text>';

    // ---- ⑥ 送风机：蜗壳 + 叶片 + 轮毂 + 电机 + 出风口 ----
    var fCX = 575, fCY = AHU_CY, fR = 38;
    s += '<circle cx="' + fCX + '" cy="' + fCY + '" r="' + fR + '" fill="rgba(91,141,184,0.06)" stroke="#5B8DB8" stroke-width="2"/>';
    s += '<g class="kg-fan-spin">';
    for (var b = 0; b < 6; b++) {
      var a1 = (b / 6) * Math.PI * 2, a2 = ((b + 1) / 6) * Math.PI * 2;
      var ri = fR * 0.25, ro = fR * 0.82;
      var ix = fCX + Math.cos(a1) * ri, iy = fCY + Math.sin(a1) * ri;
      var bx = fCX + Math.cos((a1 + a2) / 2 + 0.35) * ro, by = fCY + Math.sin((a1 + a2) / 2 + 0.35) * ro;
      var ox = fCX + Math.cos(a2) * ri, oy = fCY + Math.sin(a2) * ri;
      s += '<path d="M' + ix + ',' + iy + ' Q' + bx + ',' + by + ' ' + ox + ',' + oy + '" fill="none" stroke="#5B8DB8" stroke-width="2" opacity="0.5"/>';
    }
    s += '</g>';
    s += '<circle cx="' + fCX + '" cy="' + fCY + '" r="6" fill="#5B8DB8"/>';
    s += '<rect x="' + (fCX + fR - 2) + '" y="' + (fCY - 11) + '" width="22" height="22" rx="3" fill="#34495E"/>';
    s += '<text x="' + (fCX + fR + 9) + '" y="' + (fCY + 4) + '" fill="#fff" font-size="9" text-anchor="middle" font-weight="700">M</text>';
    s += '<rect x="' + (fCX + fR + 20) + '" y="' + (fCY - 18) + '" width="30" height="36" fill="url(#ahuG)" stroke="#5B8DB8" stroke-width="2"/>';
    s += '<path d="M' + (fCX + fR + 24) + ',' + fCY + ' L' + (fCX + fR + 44) + ',' + fCY + '" stroke="#5B8DB8" stroke-width="2" marker-end="url(#kgArrowB)"/>';
    s += '<text x="' + (fCX + fR + 35) + '" y="' + (fCY - 22) + '" fill="#5B8DB8" font-size="9" text-anchor="middle">送风</text>';

    // ---- 气流箭头（段间空隙） ----
    [130, 268, 358, 402, 508].forEach(function (ax) {
      s += '<path d="M' + ax + ',' + AHU_CY + ' L' + (ax + 18) + ',' + AHU_CY + '" stroke="#5B8DB8" stroke-width="1.5" marker-end="url(#kgArrowB)" opacity="0.3"/>';
    });

    // ---- 段标签 ----
    SYS_BOXES.forEach(function (n) {
      var labelY = n.id === 'mix' ? (AHU_Y + 20) : (AHU_Y - 12);
      s += '<text x="' + n.x + '" y="' + labelY + '" fill="' + COLOR[n.type] + '" font-size="11" text-anchor="middle" font-weight="600">' + esc(n.label) + '</text>';
    });

    // ---- 阀门 + 标签 ----
    SYS_ACTS.forEach(function (n) {
      if (n.id === 'a_oav' || n.id === 'a_rav') return;
      s += drawValve(n.x, n.y);
      s += '<text x="' + n.x + '" y="' + (n.y + 20) + '" fill="' + COLOR[n.type] + '" font-size="9" text-anchor="middle">' + esc(n.label) + '</text>';
    });

    // ---- 回风路径 ----
    s += '<path d="M680 298 L80 298" stroke="#7f8c8d" stroke-width="1.5" fill="none" stroke-dasharray="6,4" marker-end="url(#kgArrowG)"/>';
    s += '<text x="380" y="293" fill="#7f8c8d" font-size="10" text-anchor="middle">← 回风</text>';

    // ---- 传感器 + 标签 ----
    SYS_SENSORS.forEach(function (n) {
      if (n.id === 's_filter_dp') return;
      s += drawSensor(n.x, n.y, n.dir);
      var ly = n.dir === 'up' ? n.y + 20 : n.y - 14;
      s += '<text x="' + n.x + '" y="' + ly + '" fill="' + COLOR[n.type] + '" font-size="9" text-anchor="middle">' + esc(n.label) + '</text>';
    });

    // ---- DDC 控制器 ----
    s += '<rect x="' + DDC.x + '" y="' + DDC.y + '" width="' + DDC.w + '" height="' + DDC.h + '" rx="5" fill="rgba(142,68,173,0.08)" stroke="#8E44AD" stroke-width="2"/>';
    s += '<circle cx="' + (DDC.x + 14) + '" cy="' + (DDC.y + 13) + '" r="3" fill="#2ECC71"/>';
    s += '<circle cx="' + (DDC.x + 25) + '" cy="' + (DDC.y + 13) + '" r="3" fill="#F39C12"/>';
    s += '<circle cx="' + (DDC.x + 36) + '" cy="' + (DDC.y + 13) + '" r="3" fill="#8E44AD" opacity="0.3"/>';
    for (var t = 0; t < 9; t++)
      s += '<rect x="' + (DDC.x + 12 + t * 12) + '" y="' + (DDC.y + DDC.h - 9) + '" width="8" height="4" rx="1" fill="#8E44AD" opacity="0.3"/>';
    s += '<text x="' + (DDC.x + DDC.w / 2) + '" y="' + (DDC.y + 24) + '" fill="#8E44AD" font-size="12" text-anchor="middle" font-weight="700">' + esc(DDC.label) + '</text>';

    // ---- 信号线（DDC ↔ 传感器 / 执行器） ----
    var ddcX = DDC.x + DDC.w / 2;
    SYS_SENSORS.forEach(function (n) {
      var ey = n.dir === 'up' ? n.y + 8 : n.y - 10;
      s += '<path d="M' + ddcX + ',' + DDC.y + ' L' + ddcX + ',' + (DDC.y - 8) + ' L' + n.x + ',' + (DDC.y - 8) + ' L' + n.x + ',' + ey + '" stroke="' + COLOR.sensor + '" stroke-width="1" fill="none" stroke-dasharray="3,3" opacity="0.4"/>';
    });
    SYS_ACTS.forEach(function (n) {
      if (n.id === 'a_oav' || n.id === 'a_rav') return;
      s += '<path d="M' + ddcX + ',' + (DDC.y + DDC.h) + ' L' + ddcX + ',' + (DDC.y + DDC.h + 6) + ' L' + n.x + ',' + (DDC.y + DDC.h + 6) + ' L' + n.x + ',' + (n.y + 10) + '" stroke="' + COLOR.act + '" stroke-width="1" fill="none" stroke-dasharray="3,3" opacity="0.4"/>';
    });
    // 新风阀、回风阀由 DDC 模拟量输出控制
    s += '<path d="M' + DDC.x + ',' + (DDC.y + 10) + ' L210,' + (DDC.y + 10) + ' L210,140 L128,140" stroke="' + COLOR.act + '" stroke-width="1.2" fill="none" stroke-dasharray="3,3" opacity="0.55"/>';
    s += '<path d="M' + DDC.x + ',' + (DDC.y + 22) + ' L220,' + (DDC.y + 22) + ' L220,280 L128,280" stroke="' + COLOR.act + '" stroke-width="1.2" fill="none" stroke-dasharray="3,3" opacity="0.55"/>';

    // ---- 可点击覆盖层 ----
    SYS_BOXES.forEach(function (n) {
      s += '<g class="kg-node" data-label="' + esc(n.label) + '" data-type="' + n.type + '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">' +
        '<rect x="' + (n.x - n.w / 2 + 4) + '" y="' + (AHU_Y + 4) + '" width="' + (n.w - 8) + '" height="' + (AHU_H - 8) + '" fill="transparent" stroke="none" rx="4"/></g>';
    });
    SYS_ACTS.slice(0, 2).forEach(function (n) {
      s += '<g class="kg-node" data-label="' + esc(n.label) + '" data-type="' + n.type + '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">' +
        '<rect x="' + (n.x - 30) + '" y="' + (n.y - 14) + '" width="92" height="28" fill="transparent" stroke="none" rx="4"/></g>';
    });
    SYS_ACTS.forEach(function (n) {
      if (n.id === 'a_oav' || n.id === 'a_rav') return;
      s += '<g class="kg-node" data-label="' + esc(n.label) + '" data-type="' + n.type + '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">' +
        '<rect x="' + (n.x - 25) + '" y="' + (n.y - 18) + '" width="50" height="40" fill="transparent" stroke="none" rx="4"/></g>';
    });
    SYS_SENSORS.forEach(function (n) {
      s += '<g class="kg-node" data-label="' + esc(n.label) + '" data-type="' + n.type + '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">' +
        '<rect x="' + (n.x - (n.id === 's_filter_dp' ? 42 : 25)) + '" y="' + (n.y - 22) + '" width="' + (n.id === 's_filter_dp' ? 84 : 50) + '" height="48" fill="transparent" stroke="none" rx="4"/></g>';
    });
    s += '<g class="kg-node" data-label="' + esc(DDC.label) + '" data-type="' + DDC.type + '" data-desc="' + esc(DDC.desc) + '" data-module="" style="cursor:pointer">' +
      '<rect x="' + DDC.x + '" y="' + DDC.y + '" width="' + DDC.w + '" height="' + DDC.h + '" fill="transparent" stroke="none" rx="5"/></g>';

    // ---- 图例 ----
    s += legend(W - 215, 8, [
      ['#5B8DB8', '空气处理段'], ['#27AE60', '传感器'], ['#E67E22', '执行器/阀门'], ['#8E44AD', 'DDC 控制器']
    ]);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="kg-svg" preserveAspectRatio="xMidYMid meet">' + s + '</svg>';
    var host = document.getElementById('kgSystem');
    if (host) host.innerHTML = svg;
  }

  /* ---------------- 渲染：知识图谱 ---------------- */
  function renderGraph() {
    var W = 880, H = 650, inner = '';
    var cx = 440, cy = 325, radius = 255;
    KG_DOMAIN.forEach(function (n, i) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / KG_DOMAIN.length;
      n.x = cx + Math.cos(a) * radius;
      n.y = cy + Math.sin(a) * radius;
    });
    // 背景柔光
    inner += '<circle cx="' + cx + '" cy="' + cy + '" r="268" fill="url(#grBgGlow)"/>';
    inner += '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#c4b5fd" stroke-width="2.2" stroke-dasharray="3 7"/>';
    KG_DOMAIN.forEach(function (n) {
      var dx=n.x-cx, dy=n.y-cy, L=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/L, uy=dy/L;
      var s=boxEdge(cx,cy,158,48,ux,uy), e=boxEdge(n.x,n.y,150,50,-ux,-uy);
      inner += '<line x1="'+s[0]+'" y1="'+s[1]+'" x2="'+e[0]+'" y2="'+e[1]+'" stroke="url(#grEdgeGrad)" stroke-width="2" opacity=".78"/>';
    });
    // 核心脉动光环
    inner += '<circle class="kg-core-ring" cx="' + cx + '" cy="' + cy + '" r="94" fill="none" stroke="#D97706" stroke-width="2.5" stroke-dasharray="6 7"/>';
    // 中心核心节点
    inner += courseCore(cx, cy);
    // 领域节点（扩展能力用青色，其余用紫色）
    KG_DOMAIN.forEach(function (n) {
      inner += courseNode(n, 150, 50, 'grDomainGrad', '#6D28D9', '#5b21b6');
    });
    // 图例
    inner += legend(W - 250, 8, [
      ['#6D28D9', '下篇一级模块'], ['#B45309', '下篇·楼宇自动化'], ['#c4b5fd', '课程知识环']
    ]);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="kg-svg" preserveAspectRatio="xMidYMid meet">' + GR_DEFS + inner + '</svg>';
    var host = document.getElementById('kgGraph');
    if (host) host.innerHTML = svg;
  }

  /* ---------------- 渲染：控制原理知识图谱（新增） ---------------- */
  COLOR.theory = '#7C3AED';
  COLOR.focus = '#6D28D9';
  COLOR.core = '#B45309';   // 控制理论（核心）
  // 控制原理知识图谱：依据 Excel 上篇结构，以“自动控制原理”为核心，七个一级主题成环。
  var TH_NODES = [
    { id:'th_theory', label:'上篇\n自动控制原理', type:'core', big:true,
      desc:'课程知识图谱上篇的中心主题，依次涵盖基本概念、调节过程、品质指标、传递函数、典型环节、被控对象和控制规律。', module:'' },
    { id:'th_basic', label:'基本概念', type:'theory', desc:'建立自动控制、反馈、设定值、偏差、控制器、执行器和被控对象等基础概念。', module:'ctl_concept' },
    { id:'th_process', label:'调节过程', type:'theory', desc:'理解系统受设定值或扰动作用后，从动态变化到新稳态的调节过程。', module:'ctl_concept' },
    { id:'th_quality', label:'品质指标', type:'theory', desc:'用稳态误差、超调量、调节时间等指标评价控制系统的准确性、快速性和稳定性。', module:'perf' },
    { id:'th_transfer', label:'传递函数', type:'theory', desc:'在零初始条件下，用输出与输入的拉氏变换之比描述线性定常系统动态特性。', module:'laplace' },
    { id:'th_link', label:'典型环节', type:'theory', desc:'比例、积分、惯性、微分、延时和振荡环节是构成复杂控制系统的基本单元。', module:'typ_link' },
    { id:'th_obj', label:'被控对象', type:'theory', desc:'涵盖单容/双容对象、结构性质、自平衡，以及放大系数、容量系数和延迟时间。', module:'obj_char' },
    { id:'th_control', label:'控制规律', type:'theory', desc:'涵盖 P、I、D、PI、PD、PID、数字 PID、串级、前馈、Smith 补偿、改进算法及稳定性分析。', module:'pid_law' }
  ];
  // 径向连线：核心“控制理论” → 五大模块（知识环由渲染时另绘五边形轮廓连接）
  var TH_EDGES = TH_NODES.slice(1).map(function (n) { return ['th_theory', n.id]; });
  // 射线与方框交点：从中心沿单位方向 (ux,uy) 求方框边界点
  function boxEdge(mx, my, w, h, ux, uy) {
    var hw = w / 2, hh = h / 2;
    var sx = ux !== 0 ? hw / Math.abs(ux) : 1e9;
    var sy = uy !== 0 ? hh / Math.abs(uy) : 1e9;
    var t = Math.min(sx, sy);
    return [mx + ux * t, my + uy * t];
  }
  // 模块节点：圆角渐变 + 柔和阴影 + 顶部高光（先画纯色兜底，再叠渐变，确保文字必可见）
  function theoryModule(n) {
    var w = 152, h = 46, x = n.x - w / 2, y = n.y - h / 2;
    var html = '<g class="kg-node kg-tnode" data-label="' + esc(n.label) + '" data-type="' + n.type +
      '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">';
    html += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="13" fill="#6D28D9"/>';
    html += '<rect class="kg-fill" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="13" fill="url(#thModGrad)" stroke="#5b21b6" stroke-width="1.4" filter="url(#thSoft)"/>';
    html += '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="' + (w - 8) + '" height="7" rx="3.5" fill="#ffffff" opacity="0.20"/>';
    html += txt(n.x, n.y, n.label, '#fff', 12.5);
    html += '</g>';
    return html;
  }
  // 核心节点：径向渐变 + 外发光 + 内描边 + “核心”徽标（先画纯色兜底）
  function theoryCore(n) {
    var w = 180, h = 66, x = n.x - w / 2, y = n.y - h / 2;
    var html = '<g class="kg-node kg-core" data-label="' + esc(n.label) + '" data-type="' + n.type +
      '" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">';
    html += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="17" fill="#B45309"/>';
    html += '<rect class="kg-fill" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="17" fill="url(#thCoreGrad)" stroke="#92400e" stroke-width="2" filter="url(#thGlow)"/>';
    html += '<rect x="' + (x + 5) + '" y="' + (y + 5) + '" width="' + (w - 10) + '" height="' + (h - 10) + '" rx="12" fill="none" stroke="#FDE68A" stroke-width="1.4" opacity="0.85"/>';
    html += '<g transform="translate(' + n.x + ',' + y + ')"><rect x="-28" y="-11" width="56" height="20" rx="10" fill="#fff7ed" stroke="#B45309" stroke-width="1.2"/>' +
      '<text x="0" y="1" fill="#B45309" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="middle">★ 核心</text></g>';
    html += '<text x="' + n.x + '" y="' + (n.y + 21) + '" fill="#fff" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="middle">自动控制原理</text>';
    html += '</g>';
    return html;
  }
  function renderTheory() {
    var W = 820, H = 560, inner = '';
    var cx = 410, cy = 280, radius = 205;
    TH_NODES[0].x=cx; TH_NODES[0].y=cy;
    TH_NODES.slice(1).forEach(function (n, i) {
      var a=-Math.PI/2+i*Math.PI*2/(TH_NODES.length-1);
      n.x=cx+Math.cos(a)*radius; n.y=cy+Math.sin(a)*radius;
    });
    // 背景柔光
    inner += '<circle cx="' + cx + '" cy="' + cy + '" r="230" fill="url(#thBgGlow)"/>';
    // 七边形知识环（连接七个一级主题）
    var ring = TH_NODES.filter(function (n) { return n.id !== 'th_theory'; })
      .map(function (n) { return n.x + ',' + n.y; }).join(' ');
    inner += '<polygon points="' + ring + '" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="2 6" stroke-linejoin="round" opacity="0.85"/>';
    // 径向连线（核心 → 各模块），渐变描边 + 紫色箭头
    TH_EDGES.forEach(function (p) {
      var a = find(TH_NODES, p[0]), b = find(TH_NODES, p[1]);
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / L, uy = dy / L;
      var s = boxEdge(a.x, a.y, 180, 66, ux, uy);
      var e = boxEdge(b.x, b.y, 152, 46, -ux, -uy);
      inner += '<line x1="' + s[0] + '" y1="' + s[1] + '" x2="' + e[0] + '" y2="' + e[1] +
        '" stroke="url(#thEdgeGrad)" stroke-width="2.6" marker-end="url(#thArrowP)"/>';
    });
    // 核心脉动光环
    inner += '<circle class="kg-core-ring" cx="' + cx + '" cy="' + cy + '" r="96" fill="none" stroke="#D97706" stroke-width="2.5" stroke-dasharray="6 7"/>';
    // 模块节点
    TH_NODES.forEach(function (n) {
      if (n.id !== 'th_theory') inner += theoryModule(n);
    });
    // 核心节点
    inner += theoryCore(find(TH_NODES, 'th_theory'));
    // 图例
    inner += legend(W - 268, 8, [['#7C3AED', '上篇一级主题'], ['#B45309', '自动控制原理'], ['#c4b5fd', '知识关联环']]);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="kg-svg" preserveAspectRatio="xMidYMid meet">' + TH_DEFS + inner + '</svg>';
    var host = document.getElementById('kgTheory');
    if (host) host.innerHTML = svg;
  }

  /* ---------------- 渲染：细分知识面板（课程 / 控制原理 两套，按子视图切换） ---------------- */
  // 课程的细分知识：与“② 课程知识图谱”对应，恢复原课程（建筑设备自动化）的八大模块内容。
  var KG_COURSE_FOCUS = [
    { id: 'c_sensor', label: '传感器技术', module: 'sensor',
      desc: '测量温度/湿度/压力/流量/CO₂ 等参数，是控制系统的“感觉器官”；信号制式与精度选型直接影响控制效果。',
      topics: ['温湿度/露点测量', '压力与静压测量', '流量传感器选型', 'CO₂ 测量', '4–20mA / 0–10V 信号', 'RS485 通信', '传感器校准', '测点故障判断'] },
    { id: 'c_ctrl', label: '控制器 DDC / PLC', module: 'controller',
      desc: '运行控制算法的工业控制器，对接传感器与执行器，完成 PID、串级、联锁与报警；控制周期影响实时性。',
      topics: ['DDC 输入输出', 'PLC 控制器', '简单温控器', 'PID 比例/积分/微分环节', '串级控制结构', '联锁逻辑', '报警与复位', '控制周期'] },
    { id: 'c_act', label: '执行器', module: 'actuator',
      desc: '把控制器输出变为物理动作：风阀/水阀调节开度、变频器调节转速、继电器通断设备。',
      topics: ['风阀执行器', '水阀执行器', '变频器', '继电器输出', '阀门正反作用', '位置反馈', '失效位', '风机启停/水阀顺序', '执行器卡滞'] },
    { id: 'c_air', label: '空气处理过程', module: 'airprocess',
      desc: '在空调机组内对空气进行混合、加热、冷却、除湿、加湿、再热等处理，由焓湿图描述其状态变化。',
      topics: ['空气混合', '加热过程', '冷却过程', '除湿过程', '加湿过程', '再热过程', '焓湿图状态点', '露点判断', '热回收', 'AHU 启动顺序'] },
    { id: 'c_annual', label: '全年运行与节能', module: 'annual',
      desc: '随室外工况切换夏/冬/过渡季运行模式，通过焓差经济器、新风量控制、静压复位与变频实现节能。',
      topics: ['夏季运行模式', '冬季运行模式', '过渡季运行', '焓差经济器', '新风量控制', 'VAV 静压复位', '冷水温度重设', '风机变频节能', '设备群控', '模式切换'] },
    { id: 'c_fault', label: '故障诊断', module: 'fault',
      desc: '按“现象→原因→验证→处理→复测”闭环定位传感器漂移、阀卡、风量不足、通信中断等故障。',
      topics: ['温度传感器漂移', '湿度传感器失准', '压力测点异常', '流量不足', '水阀卡滞', '风阀反馈异常', '变频过载', '通信中断', '盘管防冻', '复测闭环'] },
    { id: 'c_vav', label: '变风量系统 VAV', module: 'vav',
      desc: '末端按区域温度调节风阀，主风机按最不利末端静压变频；变风量较定风量显著节约风机能耗。',
      topics: ['VAV 末端组成', '区域温度控制', '风量测量', '最小风量', '主风管静压', '静压复位', '风阀反馈', '风机频率', '多区域协调', 'VAV 节能'] },
    { id: 'c_fcu', label: '风机盘管 + 新风', module: 'fcu',
      desc: '风机盘管承担房间显热、新风机组承担新风与湿负荷；房间温控器构成单回路控制。',
      topics: ['风机盘管组成', '房间温控器', '二通水阀', '风机三速', '独立新风', 'CO₂ 控制', '盘管结露', '显热与潜热', '冬季防冻', '单回路控制'] }
  ];
  // 控制原理的细分知识：与“③ 控制原理图谱”对应，以“控制理论”为核心的五大模块。
  var KG_FOCUS = [
    { id: 'f_theory', label: '控制理论（核心）', module: '', core: true,
      desc: '控制理论（自动控制原理）是整门课的理论主线：把建筑设备（被控对象）与 DDC/PLC 控制器联系起来，回答“如何设计控制器使系统稳定、准确、快速且抗扰节能”。其下贯穿五大模块，建议按①→⑤的顺序学习。',
      topics: ['① 自动控制概念/品质/分类', '② 拉氏变换与传递函数', '③ 典型环节与一阶二阶系统', '④ 被控对象动态特性', '⑤ PID 控制规律与系统稳定性'] },
    { id: 'f_basic', label: '① 自动控制的概念、品质指标与分类', module: 'ctl_concept',
      desc: '建立闭环控制与负反馈框架，理解系统组成、品质指标与分类方式。',
      topics: ['开环控制 vs 闭环控制', '负反馈原理 e=r−y', '系统品质指标（稳态误差/超调量/调节时间）', '系统分类（恒值/随动/程序；连续/离散）', '扰动及其抑制'] },
    { id: 'f_math', label: '② 拉氏变换和传递函数', module: 'laplace',
      desc: '用拉普拉斯变换与传递函数把时域问题化为复频域代数问题，是分析与设计的基础语言。',
      topics: ['拉普拉斯变换定义与性质', '传递函数（零初值、物理意义）', '典型环节传递函数', '方框图等效化简（串联/并联/反馈）'] },
    { id: 'f_link', label: '③ 典型环节及其连接', module: 'typ_link',
      desc: '将复杂系统分解为基本环节，分析其一阶、二阶阶跃响应特征与环节连接方式。',
      topics: ['六大典型环节（比例/惯性/积分/微分/振荡/纯滞后）', '环节串联、并联与反馈连接', '一阶系统（T、调节时间、无超调）', '二阶系统（ζ、ωn、超调量）', '主导极点近似'] },
    { id: 'f_obj', label: '④ 被控对象（动态特性）', module: 'obj_char',
      desc: '用 K、T、τ 定量刻画对象动态；分为一阶/二阶，以及有自平衡能力、无自平衡能力对象。控制器围绕它设计。',
      topics: ['一阶系统对象', '二阶系统对象', '有自平衡能力对象', '无自平衡能力对象', '放大系数 K / 时间常数 T / 滞后 τ', '对象参数辨识'] },
    { id: 'f_pid', label: '⑤ 控制规律（PID）/数字PID算法与系统稳定性', module: 'pid_law',
      desc: '剖析比例/积分/微分作用，掌握数字PID算法及改进，并从时域与频域判定稳定性与性能。',
      topics: ['比例 P / 积分 I / 微分 D 作用', '数字 PID 算法（位置式/增量式）', 'PID 改进（积分分离/抗饱和/微分先行）', '串级控制（主环/副环）', '稳定性判定（劳斯判据/稳定裕度）', '稳态误差与型别'] }
  ];
  // 细分卡片与 Excel 的一级模块同步；topics 展示每个模块的代表性二级节点。
  KG_COURSE_FOCUS = [
    {label:'暖通空调系统自动化概述',module:'',desc:'认识自动化的意义、系统组成、层级与发展趋势。',topics:['暖通空调与自动化的关系','运行安全与经济性','现场级/控制级/管理级','控制网络与通信协议','智能化与数据保护']},
    {label:'暖通空调自动控制常用传感器',module:'sensor',desc:'掌握测量原理、性能参数、信号连接与工程选型。',topics:['温度/湿度传感器','压力/流量传感器','空气质量传感器','能源计量仪表','抗干扰与接地']},
    {label:'暖通空调自动控制常用执行器',module:'actuator',desc:'理解调节阀、风阀、电气执行器与变频器。',topics:['两位/连续调节阀','流量特性与阀权度','阀门选型','风量调节阀/文丘里阀','继电器/变频器']},
    {label:'暖通空调自动控制常用控制器',module:'controller',desc:'比较简单控制器、数字控制器、PLC 与网络控制器。',topics:['双位控制器','数字控制器','PLC 组成与扫描','S7-200 SMART','智能网络控制器']},
    {label:'计算机网络控制系统',module:'',desc:'建立从计算机控制到 DCS、现场总线、工业以太网与物联网的网络化控制框架。',topics:['DDC/SCC/DCS','网络拓扑与协议','BACnet/Modbus','工业以太网/OPC','物联网与组态软件']},
    {label:'暖通空调常用设备控制方法',module:'',desc:'面向泵、风机、加热加湿设备及冷热源建立设备级控制。',topics:['水泵和风机','电动机启停与调速','电加热器/加湿器','锅炉与冷水机组','换热器控制']},
    {label:'空调水输配系统控制',module:'',desc:'围绕冷热源、管网和泵组实施流量、压差与台数控制。',topics:['冷/热源与管网','定流量/变流量','泵组控制','冷水机组/冷却塔','换热站控制']},
    {label:'供热系统的调节与控制',module:'',desc:'从末端、热力入口、管网、换热站到热源形成供热调控链。',topics:['末端室温调控','热力入口调节','供热管网调节','换热站监控','智慧供热']},
    {label:'通风系统的自动控制',module:'',desc:'覆盖一般通风、车库、防排烟及洁净通风控制。',topics:['地下车库通风','防排烟控制','火灾烟气控制','机械防排烟程序','洁净厂房通风']},
    {label:'中央空调系统的自动控制',module:'annual',desc:'分析全年运行、新风、末端与典型空调系统控制。',topics:['全年运行调节','新风系统控制','全空气定风量','风机盘管/VAV/VRV','蓄能空调']},
    {label:'智能建筑与建筑能耗监测系统',module:'',desc:'把 BAS、安全、消防和能耗监测纳入智能建筑整体架构。',topics:['智能建筑构成','BAS 软硬件','安全防范','火灾自动报警','能耗监测与智慧建筑']}
  ];
  KG_FOCUS = [
    {label:'上篇·自动控制原理',module:'',core:true,desc:'课程上篇中心主题，形成从基本概念到控制规律与稳定性分析的理论主线。',topics:['基本概念','调节过程','品质指标','传递函数','典型环节','被控对象','控制规律']},
    {label:'基本概念',module:'ctl_concept',desc:'理解自动控制系统的基本术语、组成与反馈思想。',topics:['自动控制','反馈','设定值与偏差','控制器','执行器','被控对象']},
    {label:'调节过程',module:'ctl_concept',desc:'分析系统从扰动或设定值变化到重新稳定的动态过程。',topics:['动态响应','过渡过程','稳态过程','扰动响应']},
    {label:'品质指标',module:'perf',desc:'从准确性、快速性与稳定性评价控制效果。',topics:['稳态误差','超调量','调节时间','峰值时间']},
    {label:'传递函数',module:'laplace',desc:'用复频域模型表达输入、输出和系统动态关系。',topics:['拉氏变换','传递函数','方框图','闭环传递函数']},
    {label:'典型环节',module:'typ_link',desc:'用六类基本环节分解和认识复杂系统。',topics:['比例环节','积分环节','惯性环节','微分环节','延时环节','振荡环节']},
    {label:'被控对象',module:'obj_char',desc:'辨识对象结构与关键动态参数。',topics:['单容/双容对象','自平衡','结构性质','放大系数','容量系数','延迟时间']},
    {label:'控制规律',module:'pid_law',desc:'从基本 PID 到复合控制、补偿与稳定性分析。',topics:['P/I/D/PI/PD/PID','数字 PID','串级/前馈','Smith 补偿','改进算法','稳定性分析']}
  ];

  function renderFocus(kind) {
    var host = document.getElementById('kgFocusMap');
    if (!host) return;
    var grid = host.querySelector('.kg-focus-grid');
    if (!grid) return;
    var isCourse = (kind === 'course');
    var data = isCourse ? KG_COURSE_FOCUS : KG_FOCUS;
    // 同步更新标题与学习主线提示
    var titleSpan = host.querySelector('.kg-focus-title span');
    var titleSmall = host.querySelector('.kg-focus-title small');
    var hint = host.querySelector('.hint');
    var path = host.querySelector('.kg-focus-path');
    if (isCourse) {
      if (titleSpan) titleSpan.textContent = '课程知识图谱（下篇）细分知识';
      if (titleSmall) titleSmall.textContent = '楼宇自动化 · 11 个一级模块';
      if (hint) hint.innerHTML = '依据 Excel 下篇结构，从<b>自动化概述</b>出发，经传感器、执行器、控制器与网络控制，进入设备、水系统、供热、通风和中央空调控制，最终延伸到智能建筑与能耗监测。';
      if (path) path.innerHTML = '<span>系统概述</span><b>→</b><span>感知/执行/控制</span><b>→</b><span>网络控制</span><b>→</b><span>设备与系统控制</span><b>→</b><span>智能建筑/能耗</span>';
    } else {
      if (titleSpan) titleSpan.textContent = '控制原理（上篇）细分知识';
      if (titleSmall) titleSmall.textContent = '自动控制原理 · 7 个一级主题';
      if (hint) hint.innerHTML = '上篇按 Excel 结构组织为<b>基本概念、调节过程、品质指标、传递函数、典型环节、被控对象、控制规律</b>七个主题。';
      if (path) path.innerHTML = '<span>基本概念</span><b>→</b><span>调节过程/品质</span><b>→</b><span>传递函数/典型环节</span><b>→</b><span>被控对象</span><b>→</b><span>控制规律/稳定性</span>';
    }
    var html = '';
    data.forEach(function (n) {
      var tags = (n.topics || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
      var cardCls = 'kg-focus-card focus kg-node' + (n.core ? ' core' : '');
      html += '<div class="' + cardCls + '" data-label="' + esc(n.label) + '" data-type="focus" data-desc="' + esc(n.desc) + '" data-module="' + (n.module || '') + '" style="cursor:pointer">' +
        '<h4>' + esc(n.label) + '</h4>' +
        '<div class="kg-focus-tags">' + tags + '</div>' +
        '<small>' + esc(n.desc) + '</small></div>';
    });
    grid.innerHTML = html;
  }

  function legend(x, y, items) {
    var s = '<g>';
    items.forEach(function (it, i) {
      var ly = y + i * 18;
      s += '<rect x="' + x + '" y="' + ly + '" width="12" height="12" rx="3" fill="' + it[0] + '"/>';
      s += '<text x="' + (x + 18) + '" y="' + (ly + 6) + '" fill="#475569" font-size="11" dominant-baseline="middle">' + it[1] + '</text>';
    });
    return s + '</g>';
  }
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }

  /* ---------------- 详情面板 ---------------- */
  var TYPE_NAME = { proc: '空气处理段', sensor: '传感器', act: '执行器', ctrl: '控制器', domain: '课程知识域', loop: '控制回路要素', leaf: '扩展能力', core: '控制理论（核心）', focus: '控制原理细分' };
  var MOD_NAME = { loop: '控制回路识别', debug: '虚拟调试', fault: '故障诊断', season: '季节节能控制', course: '课程模块',
    ctl_concept: '自动控制系统概论', laplace: '拉氏变换与传递函数', typ_link: '典型环节与一阶/二阶系统',
    obj_char: '被控对象动态特性', pid_law: '控制器控制规律', perf: '控制系统稳定性与性能', '': '' };

  function showDetail(node) {
    var box = document.getElementById('kgDetail');
    if (!box || !node) return;
    var type = node.getAttribute('data-type');
    var label = node.getAttribute('data-label');
    var desc = node.getAttribute('data-desc');
    var mod = node.getAttribute('data-module');
    var html = '<div class="kg-detail-card" style="border-left:4px solid ' + (COLOR[type] || '#888') + '">';
    html += '<b style="color:' + (COLOR[type] || '#333') + '">' + label + '</b> <span class="kg-tag">' + (TYPE_NAME[type] || type) + '</span>';
    html += '<p>' + (desc || '（暂无说明）') + '</p>';
    if (mod) {
      html += '<button class="kg-go" data-tab="' + mod + '">前往练习：' + (MOD_NAME[mod] || mod) + ' →</button>';
    }
    html += '</div>';
    box.innerHTML = html;
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    var sysHost = document.getElementById('kgSystem');
    var graphHost = document.getElementById('kgGraph');
    if (!sysHost || !graphHost) return; // 该标签不存在时静默跳过

    renderSystem();
    renderGraph();
    renderTheory();
    renderFocus('course');

    // 子视图切换
    var thHost = document.getElementById('kgTheory');
    var focusHost = document.getElementById('kgFocusMap');
    var frameHost = document.getElementById('kgFrame');
    var detailHost = document.getElementById('kgDetail');
    var btns = document.querySelectorAll('.kg-sub-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');
          b.classList.add('active');
          var v = b.getAttribute('data-view');
          // 先隐藏所有可能视图（含新浏览器 iframe），再仅显示所选
          sysHost.style.display = 'none';
          graphHost.style.display = 'none';
          if (thHost) thHost.style.display = 'none';
          if (focusHost) focusHost.style.display = 'none';
          if (detailHost) detailHost.style.display = 'none';
          if (frameHost) frameHost.style.display = 'none';
          if (v === 'system') { sysHost.style.display = 'block'; }
          else if (v === 'graph') { if (frameHost) frameHost.style.display = 'block'; }
          else if (v === 'theory') { if (thHost) thHost.style.display = 'block'; }
        });
      })(btns[i]);
    }

    // 节点点击 → 详情
    function bind(host) {
      host.addEventListener('click', function (e) {
        var g = e.target.closest ? e.target.closest('.kg-node') : null;
        if (!g) return;
        var allNodes = host.querySelectorAll('.kg-node');
        for (var k = 0; k < allNodes.length; k++) allNodes[k].classList.remove('kg-sel');
        g.classList.add('kg-sel');
        // 高亮
        var all = host.querySelectorAll('.kg-node rect');
        for (var k2 = 0; k2 < all.length; k2++) all[k2].setAttribute('stroke', 'none');
        var r = g.querySelector('rect.kg-fill') || g.querySelector('rect'); if (r) { r.setAttribute('stroke', '#1d4ed8'); r.setAttribute('stroke-width', '3'); }
        showDetail(g);
      });
    }
    bind(sysHost); bind(graphHost); if (thHost) bind(thHost);
    var focusHost = document.getElementById('kgFocusMap'); if (focusHost) bind(focusHost);

    // 详情里的“前往练习”
    document.getElementById('kgDetail').addEventListener('click', function (e) {
      var go = e.target.closest ? e.target.closest('.kg-go') : null;
      if (!go) return;
      var tab = go.getAttribute('data-tab');
      var TAB_NAMES = ['loop', 'debug', 'fault', 'season', 'course', 'tutor', 'path', 'kg', 'eval', 'teacher'];
      if (TAB_NAMES.indexOf(tab) >= 0) {
        // 直接切到对应标签页
        var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
        if (btn) btn.click();
      } else {
        // 课程模块 id → 深链：标记后切到课程标签页，由 course_ui 打开该模块
        window.__KG_OPEN_MODULE = tab;
        var courseBtn = document.querySelector('.tab-btn[data-tab="course"]');
        if (courseBtn) courseBtn.click();
        else window.__KG_OPEN_MODULE = null;
      }
    });

    // 默认提示
    document.getElementById('kgDetail').innerHTML = '<div class="kg-detail-card">点击上方任意节点，查看它的角色、在控制回路中的位置，以及可前往的练习模块 →</div>';
  }

  global.KG = { init: init };
})(window);
