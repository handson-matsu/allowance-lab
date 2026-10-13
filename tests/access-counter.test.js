'use strict';
// Run the real page scripts in a fresh VM per page load, with minimal DOM and
// timer fixtures. fetch is always replaced: this test cannot send GAS requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match => match[1]);
assert.equal(scripts.filter(name => name === 'access-counter.js').length, 1);

function loadPage(outcome) {
  const requests = [], timers = new Map(), elements = new Map(), events = new Map();
  let timerId = 0;
  function element() {
    const listeners = {};
    return {
      innerHTML:'', textContent:'', value:'', hidden:false, disabled:false,
      clientWidth:900, dataset:{}, classList:{toggle(){},remove(){}},
      addEventListener(name, fn){listeners[name]=fn;},
      click(){if (!this.disabled) (this.onclick || listeners.click)?.();},
      setAttribute(){}, focus(){}, scrollIntoView(){},
      closest(){return {hidden:false};}, previousElementSibling:{textContent:''},
    };
  }
  for (const id of [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1])) elements.set(id, element());
  const choices = ['A','B','C'].map(id=>Object.assign(element(),{dataset:{choice:id}}));
  elements.get('choices').querySelector=()=>choices[0];
  elements.get('metric').value='amount'; elements.get('scale').value='linear';
  const fields = {};
  ['A','B','C'].forEach((id,i)=>{
    fields[id+'-type']=Object.assign(element(),{value:['constant','add','multiply'][i]});
    fields[id+'-first']=Object.assign(element(),{value:String([10000,1000,1][i])});
    fields[id+'-step']=Object.assign(element(),{value:String([0,2000,2][i])});
  });
  elements.get('settings').elements=fields;
  const document = {
    getElementById:id=>elements.get(id),
    querySelectorAll:selector=>{assert.equal(selector,'[data-choice]'); return choices;},
    addEventListener:(name,fn)=>events.set(name,fn),hidden:false,
  };
  const sandbox = {
    document,window:{addEventListener(){}},
    setInterval:fn=>{timers.set(++timerId,fn);return timerId;},
    clearInterval:id=>timers.delete(id),
    fetch:(url,options)=>{
      requests.push({url,options});
      if(outcome==='throw')throw Error('synchronous network failure');
      if(outcome==='reject')return Promise.reject(Error('network failure'));
      if(outcome==='pending')return new Promise(()=>{});
      return Promise.resolve({type:'opaque'});
    },
  };
  if(outcome==='unavailable')delete sandbox.fetch;
  const context=vm.createContext(sandbox);
  scripts.forEach(name=>vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name}));
  return {requests,elements,fields,choices,timers,events,document};
}
function exercise(page) {
  const {elements,choices,fields,timers,events,document}=page;
  const click=id=>elements.get(id).click();
  choices[1].click();click('start');click('next');click('next');
  assert.equal(elements.get('month-label').textContent,'2か月目');
  click('back');assert.equal(elements.get('month-label').textContent,'1か月目');
  click('play');assert.equal(timers.size,1);
  [...timers.values()].forEach(fn=>fn());
  assert.equal(elements.get('month-label').textContent,'2か月目');
  elements.get('speed').value='500';elements.get('speed').onchange();
  assert.equal(timers.size,1);click('play');assert.equal(timers.size,0);
  click('play');document.hidden=true;events.get('visibilitychange')();
  assert.equal(timers.size,0);document.hidden=false;
  elements.get('metric').value='total';elements.get('metric').onchange();
  elements.get('scale').value='log';elements.get('scale').onchange();
  assert.match(elements.get('chart').innerHTML,/累計額/);
  click('unlock');fields['A-first'].value='7';
  elements.get('settings').onsubmit({preventDefault(){},currentTarget:elements.get('settings')});
  assert.equal(elements.get('mode-label').textContent,'自由実験モード');
  click('next');assert.match(elements.get('cards').innerHTML,/7円/);
  click('reset');assert.match(elements.get('month-label').textContent,/0か月目/);
  click('example');assert.equal(elements.get('prediction').hidden,false);
  choices[2].click();click('start');click('next');
  assert.match(elements.get('cards').innerHTML,/10,000円/);
}

(async()=>{
  let count=0;
  for(const outcome of ['success','pending','reject','throw','unavailable']){
    const page=loadPage(outcome),expected=outcome==='unavailable'?0:1;
    assert.equal(page.requests.length,expected);
    if(expected){
      const request=page.requests[0],url=new URL(request.url);
      assert.equal(url.origin,'https://script.google.com');
      assert.equal(url.pathname,'/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec');
      assert.equal(url.search,'?app=allowance-lab');
      assert.deepEqual(JSON.parse(JSON.stringify(request.options)),{method:'GET',mode:'no-cors',cache:'no-store',credentials:'omit',keepalive:true});
    }
    exercise(page);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(page.requests.length,expected,'Actions and failures must not trigger additional requests');
    console.log(`✓ ${outcome}: initial request count, request options, all app actions and no retries`);count++;
  }
  const first=loadPage('success'),reload=loadPage('success');
  assert.equal(first.requests.length,1);assert.equal(reload.requests.length,1);
  console.log('✓ fresh page loads each send exactly once');count++;
  console.log(`${count} access-counter tests passed (mock fetch only, no external network)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
