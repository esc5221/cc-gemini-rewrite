// Sidecar. turn-end hook + web dashboard (policy / history / override).
import { createServer } from 'node:http';
import { buildContext } from './context.mjs';
import { runHandler } from './resolve.mjs';
import { scheduleScrub } from './scrub.mjs';
import { readState, writeState, logFire, readHistory } from './state.mjs';
import { dashboardHtml } from './dashboard.mjs';
import { loadConfig } from '../config.mjs';
import { POLICY_LIST } from './policies.mjs';

const CFG = loadConfig();
const PORT = CFG.port || 61237;
const readBody = (req) => new Promise(r => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>r(b)); });
const json = (res, code, obj) => { res.writeHead(code, {'content-type':'application/json'}); res.end(JSON.stringify(obj)); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const path = url.pathname;
  if (req.method === 'GET' && path === '/') { res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); return res.end(dashboardHtml(readState(), POLICY_LIST, loadConfig().provider||{}, readHistory(40))); }
  if (req.method === 'GET' && path === '/health') return json(res,200,{ ok:true, port:PORT });
  if (req.method === 'GET' && path === '/api/state') return json(res,200, readState());
  if (req.method === 'GET' && path === '/api/policies') return json(res,200,{ policies: POLICY_LIST, current: readState().policy });
  if (req.method === 'GET' && path === '/api/history') return json(res,200,{ history: readHistory(Number(url.searchParams.get('limit'))||50) });
  if (req.method === 'POST' && path === '/api/state') {
    let body={}; try{ body=JSON.parse(await readBody(req)||'{}'); }catch{}
    const patch={}; if (typeof body.policy==='string') patch.policy=body.policy; if (body.override) patch.override=body.override;
    return json(res,200, writeState(patch));
  }
  if (req.method === 'POST' && path === '/api/force-next') {
    let b={}; try{ b=JSON.parse(await readBody(req)||'{}'); }catch{}
    writeState({ forceNext: true, forceNote: (typeof b.note==='string'? b.note.slice(0,500):'') });
    return json(res,200,{ ok:true, forceNext:true, note:(b.note||'') });
  }

  if (req.method !== 'POST' || !path.startsWith('/turn-end')) { res.writeHead(404); return res.end(); }
  const state = readState();
  const forced = !!state.forceNext;
  const forceNote = state.forceNote || '';
  if (forced) writeState({ forceNext: false, forceNote: '' });   // one-shot: consume it
  if (!forced && state.policy === 'off') { res.writeHead(204); return res.end(); }
  let payload={}; try{ payload=JSON.parse(await readBody(req)||'{}'); }catch{}
  let ctx = buildContext(payload);
  for (let r = 0; r < 4 && !(ctx.lastAssistant||'').trim(); r++) { await new Promise(z=>setTimeout(z,400)); ctx = buildContext(payload); }

  if (forced) {
    // Manual (/rewrite): rewrite the last SUBSTANTIVE answer, skipping this slash turn's own
    // short/empty reply. Renders through the same injection path (no Claude relay).
    const minChars = (loadConfig().manual?.minChars) ?? 200;
    const asst = ctx.chat.filter(m => m.role === 'assistant');
    let target = '';
    for (let i = asst.length - 1; i >= 0; i--) { if ((asst[i].text||'').trim().length >= minChars) { target = asst[i].text; break; } }
    if (!target) target = asst.at(-1)?.text || '';       // fallback: whatever's last
    if (!target.trim()) { res.writeHead(204); return res.end(); }
    ctx.force = true; ctx.targetText = target; ctx.note = forceNote;
  } else {
    if (!(ctx.lastAssistant||'').trim()) { res.writeHead(204); return res.end(); }
  }

  const ac = new AbortController();
  const to = setTimeout(()=>ac.abort(), CFG.timeoutMs||120000);
  req.on('close', ()=>ac.abort());
  const t0 = performance.now(); let started=false, output='';
  try {
    for await (const chunk of runHandler(ctx, { signal: ac.signal })) {
      if (!chunk) continue;
      if (!started) { started=true; res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'}); }
      output += chunk; res.write(`data: ${JSON.stringify({ t: chunk })}\n\n`);
    }
  } catch(e) { console.error('[handler]', e?.message||e); if(!started){ res.writeHead(204); return res.end(); } }
  finally { clearTimeout(to); }

  logFire({ cwd: ctx.cwd, policy: forced ? 'manual' : (ctx._need?.policy || state.policy), kind: forced ? 'manual' : (ctx._need?.kind || ''), need: ctx._need?.need ?? started, reason: forced ? 'manual' : (ctx._need?.reason || ''), latencyMs: Math.round(performance.now()-t0), fired: started, answerPreview: (ctx.targetText || ctx.lastAssistant||'').slice(0,200), output: started ? output : '' });
  if (!started) { res.writeHead(204); return res.end(); }
  res.write(`event: done\ndata: {}\n\n`); scheduleScrub(ctx.sessionFile); res.end();
});
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.error(`[cc-turn-ext] :${PORT} already in use — another sidecar is running, exiting.`); process.exit(0); } throw e; });
server.listen(PORT, '127.0.0.1', () => console.log(`[cc-turn-ext] http://127.0.0.1:${PORT}  (turn-end hook + dashboard)`));
