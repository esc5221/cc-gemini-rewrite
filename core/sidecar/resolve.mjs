// Hook dispatcher: runs the configured handler, yields text chunks as an async iterable.
//  module  : a JS file default-exporting async generator(ctx,{signal}) → chunks
//  command : an executable; ctx JSON on stdin, stdout text as chunks (empty = skip)
//  http    : POST ctx to a URL, SSE(data:{t}) or raw text chunks
import { spawn } from 'node:child_process';
import { loadConfig, resolveHandlerPath } from '../config.mjs';

export async function* runHandler(ctx, { signal } = {}) {
  const h = loadConfig().handler || {};
  const kind = h.kind || 'module';
  if (kind === 'module') {
    const mod = await import(resolveHandlerPath(h.module));
    yield* (mod.default || mod.handler)(ctx, { signal });
    return;
  }
  if (kind === 'command') {
    const child = spawn(resolveHandlerPath(h.command), [], { stdio: ['pipe','pipe','inherit'] });
    child.stdin.write(JSON.stringify(ctx)); child.stdin.end();
    if (signal) signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    for await (const chunk of child.stdout) {
      const s = chunk.toString('utf8'); let emitted = false;
      for (const line of s.split('\n')) { const t = line.trim(); if (t.startsWith('{')) { try { const j = JSON.parse(t); if (typeof j.t === 'string') { yield j.t; emitted = true; } } catch {} } }
      if (!emitted) yield s;
    }
    return;
  }
  if (kind === 'http') {
    const res = await fetch(h.url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(ctx), signal });
    if (!res.ok) return;
    const reader = res.body.getReader(); const dec = new TextDecoder(); let sse='';
    while (true) { const {done,value}=await reader.read(); if(done)break; sse+=dec.decode(value,{stream:true});
      let i; while((i=sse.indexOf('\n\n'))>=0){ const ev=sse.slice(0,i); sse=sse.slice(i+2); const m=/^data: (.*)$/m.exec(ev); if(m){ try{ const j=JSON.parse(m[1]); if(typeof j.t==='string') yield j.t; }catch{} } } }
    return;
  }
  throw new Error('unknown handler kind: '+kind);
}
