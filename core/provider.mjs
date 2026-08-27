// Generic OpenAI-compatible chat client. Provider from merged config.
import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.mjs';

function providerCfg() { return loadConfig().provider || {}; }
let _key, _keyResolved = false;
function getKey(P) {
  if (_keyResolved) return _key; _keyResolved = true;
  if (process.env.CCR_KEY) return (_key = process.env.CCR_KEY);
  if (P.apiKey) return (_key = P.apiKey);
  if (P.apiKeyEnv && process.env[P.apiKeyEnv]) return (_key = process.env[P.apiKeyEnv]);
  if (P.apiKeyKeychain) { try { _key = execFileSync('security', ['find-generic-password','-s',P.apiKeyKeychain,'-w'], {encoding:'utf8'}).trim(); } catch { _key = null; } }
  return _key;
}
export async function* streamChat(messages, { model, signal, temperature, reasoningEffort } = {}) {
  const P = providerCfg();
  const base = (process.env.CCR_BASE || P.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('provider.baseUrl not set');
  const useModel = model || process.env.CCR_MODEL || P.model;
  const effort = reasoningEffort ?? P.reasoningEffort;
  const key = getKey(P);
  const headers = { 'Content-Type': 'application/json', ...(P.headers || {}) };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers, signal,
    body: JSON.stringify({ model: useModel, stream: true, ...(temperature!=null?{temperature}:{}), ...(effort?{reasoning_effort:effort}:{}), messages }),
  });
  if (!res.ok) throw new Error(`llm http ${res.status}: ${(await res.text()).slice(0,200)}`);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let sse = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    sse += dec.decode(value, { stream: true }); let i;
    while ((i = sse.indexOf('\n')) >= 0) {
      const line = sse.slice(0, i).trim(); sse = sse.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try { const t = JSON.parse(payload)?.choices?.[0]?.delta?.content; if (typeof t === 'string' && t.length) yield t; } catch {}
    }
  }
}
export async function chat(messages, opts = {}) { let o=''; for await (const t of streamChat(messages, opts)) o += t; return o; }
