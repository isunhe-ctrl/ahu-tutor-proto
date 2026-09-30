/* 知识图谱来源说明：图谱主体与课程 Excel 的上下篇结构保持一致。 */
(function () {
  'use strict';
  function init() {
    var host=document.getElementById('kgGraph'); if(!host) return;
    var old=host.querySelector('.kg-learning-map'); if(old) old.remove();
    var panel=document.createElement('div'); panel.className='kg-learning-map';
    panel.innerHTML='<div class="kg-focus"><b>图谱来源</b><span>《自控原理与楼宇自动化—知识图谱1.xlsx》</span><span>下篇：11 个一级模块</span><span>点击环形节点查看代表性知识点</span></div>';
    host.appendChild(panel);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
