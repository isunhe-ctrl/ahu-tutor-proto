/* 教师端学情分析：汇总本地体验账号的过程性数据 */
(function () {
  'use strict';
  var USERS=['demo_student','review_2026','trial_user']; for(var ui=1;ui<=60;ui++) USERS.push('student_'+String(ui).padStart(2,'0'));
  var MODULES=[['sensor','传感器与测量'],['controller','控制器与控制算法'],['actuator','执行器与末端设备'],['airprocess','空气处理过程'],['annual','空调全年节能运行'],['fault','常见故障及处理'],['vav','变风量系统'],['fcu','风机盘管加新风']];
  function isTeacher(){return document.body.getAttribute('data-role')==='teacher';}
  function read(user){var p={scores:{},path:{}};try{p=JSON.parse(localStorage.getItem('bems_progress_'+user)||'{}');}catch(e){};return p;}
  function render(){if(!isTeacher())return;var sum=document.getElementById('teacherSummary'),table=document.getElementById('teacherTable'),advice=document.getElementById('teacherAdvice');if(!sum||!table)return;var rows=[],total=0,count=0;USERS.forEach(function(u){var p=read(u),scores=p.scores||{},course=[];MODULES.forEach(function(m){var v=localStorage.getItem('bems_course_score_'+m[0]+'_'+u);course.push(v?Number(v):null);});var vals=course.filter(function(v){return v!==null;});var avg=vals.length?Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length):null;var keyScores=['loop','debug','season','fault'].map(function(k){return scores[k]===undefined?null:scores[k];});var all=keyScores.filter(function(v){return v!==null;});var trainAvg=all.length?Math.round(all.reduce(function(a,b){return a+b;},0)/all.length):null;rows.push({u:u,course:avg,train:trainAvg,done:course.filter(function(v){return v!==null&&v>=60;}).length});if(avg!==null){total+=avg;count++;}});sum.innerHTML='<div class="teacher-kpis"><div><b>'+USERS.length+'</b><span>体验账号</span></div><div><b>'+ (count?Math.round(total/count):'—') +'</b><span>课程平均分</span></div><div><b>'+rows.filter(function(r){return r.course!==null;}).length+'</b><span>已有学习记录</span></div></div>';var html='<table class="eval-tbl"><tr><th>学生账号</th><th>课程模块平均分</th><th>训练平均分</th><th>已完成模块</th><th>学习状态</th></tr>';rows.forEach(function(r){var status=r.course===null?'未开始':(r.course<60?'需要辅导':'进行中');html+='<tr><td>'+r.u+'</td><td>'+(r.course===null?'—':r.course)+'</td><td>'+(r.train===null?'—':r.train)+'</td><td>'+r.done+' / '+MODULES.length+'</td><td>'+status+'</td></tr>';});table.innerHTML=html+'</table>';advice.innerHTML='<b>教学建议：</b>优先关注课程平均分低于 60 分或训练平均分缺失的学生；建议先复习传感器/控制器基础，再进入 VAV、PID 和全年节能实验。';}
  window.addEventListener('storage',render);
  window.addEventListener('bems:progress',render);
  window.addEventListener('bems:role',render);
  document.addEventListener('click',function(e){if(e.target&&e.target.id==='teacherRefresh')render();});
  document.addEventListener('click',function(e){if(e.target&&e.target.getAttribute('data-tab')==='teacher')render();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
