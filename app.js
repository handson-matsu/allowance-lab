'use strict';
const $ = id => document.getElementById(id);
const experiment = Allowance.createExperiment();
const colors = ['#2376ae','#b25915','#8553b4'];
const money = value => (value >= 1e15 ? value.toExponential(3) : value.toLocaleString('ja-JP',{maximumFractionDigits:2}))+'円';
let prediction=null, unlocked=false;
document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
  prediction=button.dataset.choice;
  document.querySelectorAll('[data-choice]').forEach(b=>{const chosen=b===button;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',chosen);});
  $('choice-note').textContent=`あなたの予想はプラン${prediction}。実験で確かめよう。`;$('start').disabled=false;
}));
$('start').onclick=()=>{$('prediction').hidden=true;$('experiment').hidden=false;render();$('next').focus();};
$('next').onclick=()=>experiment.next();$('back').onclick=()=>experiment.back();$('reset').onclick=()=>experiment.reset();
$('play').onclick=()=>experiment.playing?experiment.pause():experiment.play();
$('speed').onchange=()=>experiment.setSpeed(Number($('speed').value));
$('metric').onchange=render;$('scale').onchange=render;
function render(){
  const rows=experiment.rows, current=rows.at(-1), metric=$('metric').value, plans=experiment.plans;
  $('month-label').textContent=experiment.month?`${experiment.month}か月目`:'0か月目 · ここから実験';
  $('prediction-note').textContent=prediction?`最初の予想：プラン${prediction}。どの期間、どの金額で比べる？`:'条件を変えたら、結果も変わる？';
  $('back').disabled=experiment.month===0;$('reset').disabled=experiment.month===0&&!experiment.playing;$('next').disabled=experiment.month===60;
  $('play').disabled=experiment.month===60;$('play').textContent=experiment.playing?'Ⅱ 一時停止':'▶ 自動再生';
  $('unlock').disabled=!experiment.month&&!unlocked;
  const previous=rows.at(-2);
  const cards=plans.map((p,i)=>{
    const v=current?.values[i], before=previous?.values[i];
    const section=(key,label)=>{
      const rank=v?.[key+'Rank'], oldRank=before?.[key+'Rank'];
      const changed=oldRank!==undefined && rank!==oldRank;
      const tied=v && current.values.filter(value=>value[key]===v[key]).length>1;
      return `<section class="result-section${changed?' rank-changed':''}" data-metric="${key}" aria-label="${label}">
        <h3>${label}</h3>
        <div class="amount-and-rank"><strong class="result-money">${v?money(v[key]):'—'}</strong>
          <div class="rank-badge" aria-label="${label}の順位：${v?rank+'位'+(tied?'（同順位）':''):'未計測'}"><span class="rank-number">${v?rank:'—'}</span>${v?'<span>位</span>':''}${tied?'<small>同順位</small>':''}</div>
        </div>
        <p class="rank-change">${changed?`${rank<oldRank?'↑':'↓'} 順位が変化：先月${oldRank}位 → 今月${rank}位`:v?(before?'先月から順位の変化なし':'最初の月の順位'):'次の1か月へ進めて比べよう'}</p>
      </section>`;
    };
    return `<article class="plan result-card ${p.id.toLowerCase()}" aria-label="プラン${p.id}の結果">
      <b>${p.id}<span>${{constant:'一定',add:'足し算',multiply:'掛け算'}[p.type]}</span></b>
      <p class="card-month">${experiment.month}か月目${v?'':'<small>実験開始前</small>'}</p>
      ${section('amount','今月の受取額')}${section('total','これまでの累計額')}
    </article>`;
  }).join('');
  if($('cards').innerHTML!==cards) $('cards').innerHTML=cards;
  $('history').innerHTML=rows.map(row=>`<tr class="${row.month===experiment.month?'latest':''}"><th scope="row">${row.month}か月目</th>${row.values.map(v=>`<td>${money(v.amount)}<small>${v.amountRank}位</small></td><td>${money(v.total)}<small>${v.totalRank}位</small></td>`).join('')}<td>${['amount','total'].filter(k=>row.events[k].length).map(k=>`${k==='amount'?'受取':'累計'} 逆転！ ${row.events[k].join('、')}`).join('<br>')||'—'}</td></tr>`).join('');
  $('discoveries').innerHTML=current?['amount','total'].map(k=>{const name=k==='amount'?'毎月の受取額':'累計額';return (current.events[k].length?`<p class="discovery"><b>${name}で逆転！</b> ${current.events[k].join('、')} の大小関係が変わりました。</p>`:'')+current.gaps[k].map(g=>`<p class="gap">${name}：${g.pair} の差が先月より ${money(g.reduction)} 縮まり、現在 ${money(g.gap)}${g.gap===0?'（同額）':''}。</p>`).join('');}).join(''):'';
  $('formulas').innerHTML=plans.map(p=>`<div class="formula"><b>プラン${p.id}</b><p>${p.type==='constant'?'aₙ = a<br>Sₙ = na':p.type==='add'?'aₙ = a + (n − 1)d<br>Sₙ = n[2a + (n − 1)d] / 2':'aₙ = arⁿ⁻¹<br>r ≠ 1：Sₙ = a(1 − rⁿ) / (1 − r)<br>r = 1：Sₙ = na'}</p><small>a = ${p.first.toLocaleString('ja-JP')}${p.type==='add'?`, d = ${p.step.toLocaleString('ja-JP')}`:p.type==='multiply'?`, r = ${p.step}`:''}</small></div>`).join('');
  drawChart(rows,metric);
}
function drawChart(rows,metric){
  const logarithmic=$('scale').value==='log';
  $('axis-note').textContent=`横軸：経過月数 ／ 縦軸：${metric==='amount'?'毎月の受取額':'累計額'}（円）${logarithmic?' · 対数目盛：log₁₀(金額 + 1)':''}。表示範囲は現在までのデータに合わせて変わります。`;
  if(!rows.length){$('chart').innerHTML='<div class="empty">「次の1か月へ」で最初の点を描こう。</div>';return;}
  const transform=v=>logarithmic?Math.log10(v+1):v;
  const maximum=Math.max(...rows.flatMap(r=>r.values.map(v=>transform(v[metric]))),1)*1.08;
  const w=Math.max(300,$('chart').clientWidth),h=w<500?280:340,left=w<500?88:114,right=35,top=22,bottom=45;
  const x=n=>left+(n-1)/Math.max(1,rows.length-1)*(w-left-right),y=v=>h-bottom-transform(v)/maximum*(h-top-bottom);
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${rows.length}か月目までの${metric==='amount'?'受取額':'累計額'}のグラフ。各月の正確な値は下の一覧表で確認できます。">`;
  for(let i=0;i<=4;i++){const t=maximum*i/4,yy=h-bottom-t/maximum*(h-top-bottom),raw=logarithmic?Math.pow(10,t)-1:t;svg+=`<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#dce5dd"/><text x="${left-10}" y="${yy+5}" text-anchor="end" font-size="13" fill="#607267">${raw>=1e6?raw.toExponential(1):raw.toLocaleString('ja-JP',{maximumFractionDigits:0})}</text>`;}
  const ticks=[...new Set([1,Math.ceil(rows.length/2),rows.length])];ticks.forEach(n=>svg+=`<text x="${x(n)}" y="${h-15}" text-anchor="middle" font-size="14" fill="#607267">${n}か月</text>`);
  rows[0].values.forEach((v,i)=>{
    svg+=`<polyline points="${rows.map(r=>`${x(r.month)},${y(r.values[i][metric])}`).join(' ')}" fill="none" stroke="${colors[i]}" stroke-width="3" stroke-linecap="round"/>`;
    rows.forEach(r=>svg+=`<circle cx="${x(r.month)}" cy="${y(r.values[i][metric])}" r="${r.month===rows.length?5:3}" fill="${colors[i]}"><title>${r.month}か月目 プラン${v.id} ${money(r.values[i][metric])}</title></circle>`);
    const last=rows.at(-1).values[i];svg+=`<text x="${x(rows.length)+10}" y="${y(last[metric])+4}" fill="${colors[i]}" font-size="13" font-weight="bold">${v.id}</text>`;
  });
  $('chart').innerHTML=svg+'</svg>';
}
function populateEditors(){
  $('editors').innerHTML=experiment.plans.map(p=>`<div class="plan editor ${p.id.toLowerCase()}"><b>プラン${p.id}</b><label>増え方<select name="${p.id}-type"><option value="constant">一定</option><option value="add">足し算</option><option value="multiply">掛け算</option></select></label><label>初月の金額（円）<input name="${p.id}-first" type="number" min="0" max="1000000000000" step="any" required value="${p.first}"></label><label class="step-label"><span>毎月の増加額（円）</span><input name="${p.id}-step" type="number" min="0" step="any" required value="${p.step}"></label></div>`).join('');
  experiment.plans.forEach(p=>{const select=$('settings').elements[`${p.id}-type`];select.value=p.type;select.onchange=()=>updateEditor(p.id);updateEditor(p.id);});
}
function updateEditor(id){const form=$('settings'),type=form.elements[`${id}-type`].value,input=form.elements[`${id}-step`];input.disabled=type==='constant';input.closest('label').hidden=type==='constant';input.max=type==='multiply'?'100':'1000000000000';input.previousElementSibling.textContent=type==='multiply'?'毎月の倍率':'毎月の増加額（円）';}
$('unlock').onclick=()=>{experiment.pause();unlocked=true;$('settings').hidden=false;$('unlock').hidden=true;populateEditors();};
$('settings').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;const plans=['A','B','C'].map(id=>({id,type:form.elements[`${id}-type`].value,first:Number(form.elements[`${id}-first`].value),step:form.elements[`${id}-step`].disabled?0:Number(form.elements[`${id}-step`].value)}));try{experiment.configure(plans);prediction=null;$('mode-label').textContent='自由実験モード';$('error').textContent='';render();$('month-label').scrollIntoView({behavior:'smooth',block:'center'});}catch(error){$('error').textContent=error.message;}};
$('example').onclick=()=>{experiment.configure(Allowance.defaults());prediction=null;unlocked=false;$('mode-label').textContent='例題モード';$('experiment').hidden=true;$('prediction').hidden=false;$('settings').hidden=true;$('unlock').hidden=false;$('start').disabled=true;$('choice-note').textContent='プランを選ぶと、実験を始められます。';document.querySelectorAll('[data-choice]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});$('choices').querySelector('button').focus();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)experiment.pause();});
experiment.subscribe(render);
render();

window.addEventListener('resize',()=>{if(!$('experiment').hidden)drawChart(experiment.rows,$('metric').value);});
