function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

export function dashboardHtml(state, policyList, gemini, history) {
  const cur = state.policy || 'hybrid';
  const ov = state.override || {};
  const g = gemini || {};
  const btns = policyList.map(p =>
    '<button class="pol'+(p.id===cur?' active':'')+'" data-id="'+p.id+'" onclick="setPolicy(\''+p.id+'\')" title="'+esc(p.desc)+'">'+
    '<span class="pn">'+esc(p.name)+'</span><span class="pd">'+esc(p.desc)+'</span></button>').join('');
  const init = JSON.stringify({ policy: cur, history: history || [] }).replace(/</g,'\\u003c');

  const CSS = `
:root{--bg:#0f1115;--panel:#171a21;--line:#252a34;--fg:#e6e8ec;--dim:#8b93a1;--acc:#5769f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{max-width:920px;margin:0 auto;padding:24px}h1{font-size:18px;margin:0 0 2px}.sub{color:var(--dim);font-size:12px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.pols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px}
.pol{display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;background:#0c0e12;border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color .12s,background .12s}
.pol:hover{border-color:#39414f}.pol.active{border-color:var(--acc);background:rgba(87,105,247,.12)}
.pol .pn{font-weight:600;font-size:13px}.pol.active .pn{color:#aab4ff}.pol .pd{color:var(--dim);font-size:11px}
label{display:block;color:var(--dim);font-size:12px;margin:10px 0 4px}
input,textarea{width:100%;background:#0c0e12;border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:8px;font:12px/1.5 ui-monospace,monospace}textarea{min-height:70px;resize:vertical}
button.act{background:var(--acc);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:6px;padding:8px 14px;cursor:pointer}
.grid4{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hitem{border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:10px}
.hitem .meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--dim);font-size:11px;margin-bottom:6px;align-items:center}
.badge{padding:1px 7px;border-radius:10px;font-size:11px}.badge.fire{background:rgba(44,122,57,.2);color:#5fd07a}.badge.skip{background:#20242c;color:var(--dim)}
.badge.rule{background:rgba(150,108,30,.18);color:#d8b45a}.badge.llm{background:rgba(87,105,247,.18);color:#aab4ff}
.prev{color:var(--dim);font-size:12px;white-space:pre-wrap;max-height:54px;overflow:hidden}
.pre{white-space:pre-wrap;word-break:break-word;font-size:12px;color:#c4c9d2}
details summary{cursor:pointer;color:var(--acc);font-size:12px}.muted{color:var(--dim);font-size:12px}
@media(max-width:640px){.grid4{grid-template-columns:1fr}}`;

  // client JS built by string concatenation (avoids nested template literals)
  const JS = [
"const INIT="+init+";",
"const $=s=>document.querySelector(s);",
"async function api(p,m,b){const r=await fetch(p,{method:m||'GET',headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});return r.json()}",
"let curPolicy=INIT.policy;",
"async function setPolicy(id){if(id===curPolicy)return;curPolicy=id;",
"  document.querySelectorAll('.pol').forEach(b=>b.classList.toggle('active',b.dataset.id===id));",
"  const s=await api('/api/state','POST',{policy:id});curPolicy=s.policy;",
"  document.querySelectorAll('.pol').forEach(b=>b.classList.toggle('active',b.dataset.id===s.policy));}",
"async function saveOv(){const ov={};const set=(k,v,num)=>{const t=(''+v).trim();if(t!=='')ov[k]=num?Number(t):t;};",
"  set('model',$('#ov_model').value);set('alwaysLines',$('#ov_alwaysLines').value,1);set('judgeMinLines',$('#ov_judgeMinLines').value,1);",
"  set('judgePrompt',$('#ov_judge').value);set('respondPrompt',$('#ov_respond').value);",
"  await api('/api/state','POST',{override:ov});$('#saveMsg').textContent='saved '+new Date().toLocaleTimeString();setTimeout(()=>$('#saveMsg').textContent='',2500);}",
"async function clearOv(){await api('/api/state','POST',{override:{model:'',alwaysLines:'',judgeMinLines:'',judgePrompt:'',respondPrompt:''}});location.reload();}",
"function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}",
"const seen=new Set();",
"function node(h){var d=document.createElement('div');d.className='hitem';d.dataset.ts=h.ts;",
"  var badges=(h.fired?'<span class=\"badge fire\">re-explained</span>':'<span class=\"badge skip\">skipped</span>')",
"    +(h.kind?' <span class=\"badge '+h.kind+'\">'+esc(h.kind)+'</span>':'')",
"    +(h.policy?' <span class=\"muted\">'+esc(h.policy)+'</span>':'');",
"  var html='<div class=\"meta\">'+badges+'<span>'+esc(new Date(h.ts).toLocaleString())+'</span>'",
"    +(h.reason?'<span>· '+esc(h.reason)+'</span>':'')+'<span>· '+h.latencyMs+'ms</span></div>'",
"    +'<div class=\"prev\">original: '+esc((h.answerPreview||'').slice(0,160))+'…</div>'",
"    +(h.fired?'<details style=\"margin-top:6px\"><summary>view re-explanation</summary><div class=\"pre\">'+esc(h.output||'')+'</div></details>':'');",
"  d.innerHTML=html;return d;}",
"function renderInitial(list){var c=$('#hist');if(!list.length){c.innerHTML='<div class=\"muted\">no activity yet</div>';return;}",
"  list.forEach(function(h){seen.add(h.ts);c.appendChild(node(h));});}",
"async function pollHist(){var r=await api('/api/history?limit=40');var fresh=r.history.filter(function(h){return !seen.has(h.ts);});",
"  if(fresh.length){var c=$('#hist');var m=c.querySelector('.muted');if(m)c.innerHTML='';",
"  fresh.reverse().forEach(function(h){seen.add(h.ts);c.insertBefore(node(h),c.firstChild);});}}",
"renderInitial(INIT.history);setInterval(pollHist,5000);"
].join("\n");

  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'+
"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>cc-turn-ext</title>"+
'<style>'+CSS+'</style></head><body><div class="wrap">'+
'<h1>cc-turn-ext</h1><div class="sub">turn-end re-explainer · policy (decide) → rewriter (separated)</div>'+
'<div class="card"><div class="row"><b>Policy</b><span class="muted">rule that decides whether to re-explain the last response</span></div>'+
'<div class="pols" id="pols">'+btns+'</div></div>'+
'<div class="card"><div class="row"><b>Override</b><span class="muted">live, no file edit (applies next turn)</span></div>'+
'<div class="grid4">'+
'<div><label>model</label><input id="ov_model" value="'+esc(ov.model||'')+'" placeholder="'+esc(g.model||'')+'"></div>'+
'<div><label>alwaysLines (≥ this → always)</label><input id="ov_alwaysLines" type="number" value="'+(ov.alwaysLines??'')+'" placeholder="'+(g.alwaysLines??10)+'"></div>'+
'<div><label>judgeMinLines (< this → never judge)</label><input id="ov_judgeMinLines" type="number" value="'+(ov.judgeMinLines??'')+'" placeholder="'+(g.judgeMinLines??5)+'"></div><div></div>'+
'</div>'+
'<label>judgePrompt</label><textarea id="ov_judge" placeholder="(config default)">'+esc(ov.judgePrompt||'')+'</textarea>'+
'<label>respondPrompt</label><textarea id="ov_respond" placeholder="(config default)">'+esc(ov.respondPrompt||'')+'</textarea>'+
'<div class="row" style="margin-top:10px"><span class="muted" id="saveMsg"></span>'+
'<div><button class="ghost" onclick="clearOv()">Reset</button> <button class="act" onclick="saveOv()">Save</button></div></div></div>'+
'<div class="card"><div class="row"><b>Recent activity</b><button class="ghost" onclick="pollHist()">Refresh</button></div>'+
'<div id="hist" style="margin-top:10px"></div></div>'+
'</div><script>'+JS+'</scr'+'ipt></body></html>';
}
