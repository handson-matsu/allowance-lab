(function (root) {
  'use strict';
  const defaults = () => [{id:'A',type:'constant',first:10000,step:0},{id:'B',type:'add',first:1000,step:2000},{id:'C',type:'multiply',first:1,step:2}];
  function validate(plans) {
    if (plans.length !== 3) throw Error('3つのプランを設定してください。');
    for (const p of plans) {
      if (!['constant','add','multiply'].includes(p.type) || !Number.isFinite(p.first) || p.first < 0 || p.first > 1e12 || !Number.isFinite(p.step) || p.step < 0 || p.step > (p.type === 'multiply' ? 100 : 1e12)) throw Error('初月・増加額は0〜1兆円、倍率は0〜100で入力してください。');
    }
  }
  function history(plans, month) {
    validate(plans);
    const rows = [], totals = plans.map(()=>0), lastSigns = {amount:{},total:{}};
    for (let n=1;n<=month;n++) {
      const values = plans.map((p,i)=> { const amount = p.type==='constant' ? p.first : p.type==='add' ? p.first+(n-1)*p.step : p.first*Math.pow(p.step,n-1); totals[i]+=amount; return {id:p.id,amount,total:totals[i]}; });
      const events = {amount:[],total:[]}, gaps = {amount:[],total:[]};
      for (const key of ['amount','total']) {
        values.forEach(v=>v[key+'Rank']=1+values.filter(w=>w[key]>v[key]).length);
        for(let i=0;i<3;i++) for(let j=i+1;j<3;j++) {
          const pair = `${plans[i].id}・${plans[j].id}`, diff=values[i][key]-values[j][key], sign=Math.sign(diff);
          if(sign && lastSigns[key][pair] && sign!==lastSigns[key][pair]) events[key].push(pair);
          if(sign) lastSigns[key][pair]=sign;
          if(rows.length) { const prev=rows[rows.length-1].values; const old=Math.abs(prev[i][key]-prev[j][key]); if(Math.abs(diff)<old) gaps[key].push({pair,gap:Math.abs(diff),reduction:old-Math.abs(diff)}); }
        }
      }
      rows.push({month:n,values,events,gaps});
    }
    return rows;
  }
  function createExperiment(plans=defaults(), timers={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)}) {
    let month=0, playing=false, speed=1000, handle=null;
    const listeners=new Set();
    const emit=()=>listeners.forEach(fn=>fn(api));
    function pause(){if(handle!==null)timers.clear(handle);handle=null;playing=false;emit();}
    function next(){if(month<60)month++;if(month===60)pause();else emit();}
    function play(){if(playing||month>=60)return;playing=true;handle=timers.set(next,speed);emit();}
    const api={get month(){return month;},get playing(){return playing;},get plans(){return plans.map(p=>({...p}));},get rows(){return history(plans,month);},next,back(){pause();month=Math.max(0,month-1);emit();},reset(){pause();month=0;emit();},play,pause,setSpeed(ms){if(![2000,1000,500,250].includes(ms))throw Error('Invalid speed');const resume=playing;pause();speed=ms;if(resume)play();},configure(p){validate(p);pause();plans=p.map(v=>({...v}));month=0;emit();},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
    return api;
  }
  const lib={defaults,validate,history,createExperiment};
  if(typeof module!=='undefined'&&module.exports)module.exports=lib;else root.Allowance=lib;
})(typeof globalThis!=='undefined'?globalThis:this);
