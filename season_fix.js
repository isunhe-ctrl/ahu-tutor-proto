/* 季节节能判定修正：使用选项编号，避免中文答案字符串比较误判 */
(function () {
  'use strict';
  function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
  function modeIndex(t, rh, result) {
    if (t >= 26) return 0;
    if (t <= 10) return 2;
    if (result.dh > 0) return 1;
    return 3;
  }
  function init() {
    var old = document.getElementById('seasonQuiz'); if (!old) return;
    var button = old.cloneNode(true); old.parentNode.replaceChild(button, old);
    button.addEventListener('click', function () {
      var t = randInt(-5, 38), rh = randInt(30, 90), inC = {t:24, rh:50};
      var r = freshAirStrategy(inC, {t:t, rh:rh}, {minFresh:0.1}), answer = modeIndex(t, rh, r);
      var opts = ['最小新风（机械制冷）','焓差变新风（免费冷）','最小新风（防冻/加热）','最小新风（室外更湿热）'];
      var html='<b>判定练习</b>：室外 '+t+'℃ / '+rh+'%，室内设定 24℃ / 50%。<br>';
      html+='室内焓值：'+r.hIn.toFixed(1)+' kJ/kg；室外焓值：'+r.hOut.toFixed(1)+' kJ/kg；焓差：'+r.dh.toFixed(1)+' kJ/kg<br>应选择哪种新风机组控制模式？<br>';
      opts.forEach(function(o,i){html+='<label class="opt"><input type="radio" name="sq_fixed" value="'+i+'"> '+o+'</label>';});
      html+='<button class="btn-primary" id="sqFixedSubmit">提交判定</button><span id="sqFixedResult"></span>';
      document.getElementById('seasonResult').innerHTML=html;
      document.getElementById('sqFixedSubmit').addEventListener('click',function(){var s=document.querySelector('input[name="sq_fixed"]:checked'),out=document.getElementById('sqFixedResult');if(!s){out.textContent=' 请先选择';return;}var ok=Number(s.value)===answer;var user=localStorage.getItem('bems_active_user')||'trial_user',progress={scores:{},path:{}};try{progress=JSON.parse(localStorage.getItem('bems_progress_'+user)||'{}');}catch(e){}progress.scores=progress.scores||{};progress.scores.season=ok?100:0;localStorage.setItem('bems_progress_'+user,JSON.stringify(progress));window.dispatchEvent(new CustomEvent('bems:progress'));out.innerHTML=ok?' <b class="ok">✓ 正确</b>':' <b class="warn">✗ 错误，正确选项为：'+opts[answer]+'</b>';out.innerHTML+='<br><span class="hint">判定依据：室外焓值 '+(r.dh>0?'低于':'不低于')+' 室内焓值。温度适宜时'+(r.dh>0?'增加新风利用免费冷。':'采用最小新风。')+'</span>';});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
