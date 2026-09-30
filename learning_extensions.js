/* 控制回路场景与冬季防冻专项练习 */
(function () {
  'use strict';
  var LOOP_CASES = {
    ahu: { title:'空调机组送风温度串级', fields:{object:'空调机组盘管段',cv:'送风温度',mv:'冷水阀开度',sensor:'送风温度传感器',controller:'DDC 控制器',actuator:'电动调节阀',innerCv:'盘管后温度'}, exp:'主环控制送风温度，副环快速抑制盘管侧扰动。' },
    vav: { title:'变风量系统 VAV', fields:{object:'VAV 末端及送风系统',cv:'区域温度',mv:'VAV 风阀开度',sensor:'区域温度/风量传感器',controller:'VAV DDC 控制器',actuator:'VAV 风阀执行器',innerCv:'风管静压'}, exp:'区域温度环调节末端风阀，多台 VAV 的需求共同形成主风管静压需求，静压环调节送风机频率。' },
    fcu: { title:'风机盘管加新风系统', fields:{object:'风机盘管服务房间',cv:'室内温度',mv:'二通水阀/风机三速',sensor:'室内温度传感器',controller:'房间温控器/DDC',actuator:'水阀执行器和风机继电器',innerCv:'送风温度'}, exp:'温控器调节盘管水阀与风机档位，新风机组按 CO₂ 和温湿度需求独立控制并联动。' }
  };
  var KEYS = ['object','cv','mv','sensor','controller','actuator','innerCv'];
  var LABELS = {object:'被控对象',cv:'被控变量',mv:'操纵变量',sensor:'测量元件',controller:'控制器',actuator:'执行机构',innerCv:'副环被控变量'};
  var DISTRACT = ['室外温度传感器','冷冻水泵频率','照明控制器','回风湿度','过滤器压差'];
  function setupLoops() {
    var form = document.getElementById('loopForm'), old = document.getElementById('loopCheck');
    if (!form || !old) return;
    var button = old.cloneNode(true); old.parentNode.replaceChild(button, old);
    var selector = document.createElement('div'); selector.className='loop-scenarios';
    selector.innerHTML='<label>练习场景：<select id="loopScenario"><option value="ahu">空调机组串级控制</option><option value="vav">变风量系统 VAV</option><option value="fcu">风机盘管加新风系统</option></select></label>';
    form.parentNode.insertBefore(selector, form);
    function renderCase() {
      var mode=document.getElementById('loopScenario').value, c=LOOP_CASES[mode], formKeys=mode==='fcu'?KEYS.slice(0,6):KEYS; form.innerHTML='';
      formKeys.forEach(function(k){var row=document.createElement('div');row.className='loop-row';var lab=document.createElement('label');lab.textContent=LABELS[k];var sel=document.createElement('select');sel.id='ext_loop_'+k;var vals=[c.fields[k]].concat(DISTRACT);vals.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o);});sel.value='';row.appendChild(lab);row.appendChild(sel);form.appendChild(row);});
    }
    document.getElementById('loopScenario').addEventListener('change',renderCase); renderCase();
    button.addEventListener('click',function(){var mode=document.getElementById('loopScenario').value,c=LOOP_CASES[mode],formKeys=mode==='fcu'?KEYS.slice(0,6):KEYS,n=0;formKeys.forEach(function(k){if(document.getElementById('ext_loop_'+k).value===c.fields[k])n++;});document.getElementById('loopResult').innerHTML='<b>场景：'+c.title+'；正确率：'+n+' / '+formKeys.length+'</b><br><span class="hint">解析：'+c.exp+'</span>';});
  }
  function setupFreeze() {
    var host=document.getElementById('faultOptions'); if(!host) return;
    var box=document.createElement('div');box.className='freeze-practice';box.innerHTML='<h4>冬季盘管防冻专项故障选项</h4><p>现象：室外低温时新风阀仍大开，盘管出水温度持续下降并触发防冻报警。请选择最可能的根因：</p><div class="freeze-options"></div><button class="btn-primary" id="freezeCheck">提交防冻诊断</button><span id="freezeResult" class="course-result"></span>';
    host.parentNode.appendChild(box);var options=['新风阀未执行关闭联锁或反馈失效','室内照度不足','冷却塔水位偏高','风机盘管滤网颜色不一致'];var list=box.querySelector('.freeze-options');options.forEach(function(x,i){var l=document.createElement('label');l.className='opt';l.innerHTML='<input type="radio" name="freeze_case" value="'+i+'"> '+x;list.appendChild(l);});box.querySelector('#freezeCheck').addEventListener('click',function(){var s=box.querySelector('input[name="freeze_case"]:checked'),r=box.querySelector('#freezeResult');r.textContent=!s?'请先选择故障选项':(s.value==='0'?' ✓ 正确：继续核查防冻传感器、热水阀和风机联锁。':' ✗ 错误：应优先核查低温联锁、新风阀和防冻测点。');});
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',setupLoops);document.addEventListener('DOMContentLoaded',setupFreeze);}else{setupLoops();setupFreeze();}
})();
