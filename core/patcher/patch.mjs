// Bun standalone binary patcher — injects a self-contained snippet at turn-end.
// grow (page-aligned) + Offsets/module-pointer fixup + zero the host module bytecode + Mach-O LC fixup + re-sign.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PAGE = 16384;
const TRAILER = '\n---- Bun! ----\n';
const ANCHOR = 'continue}return{reason:"completed"}';   // insertion point: before return
const MARK = 'CCX_BEGIN';

function die(m){ console.error('ERROR:', m); process.exit(1); }
function u32(dv,o){ return dv.getUint32(o,true); }
function setU32(dv,o,v){ dv.setUint32(o,v>>>0,true); }
function u64(dv,o){ return Number(dv.getBigUint64(o,true)); }
function setU64(dv,o,v){ dv.setBigUint64(o,BigInt(v),true); }

const src = process.argv[2];
const out = process.argv[3] || src + '.ccx';
if (!src) die('usage: patch.mjs <src-binary> [out]');

let buf = readFileSync(src);
let dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// already patched?
if (buf.includes(Buffer.from(MARK))) die('already patched (found '+MARK+')');

// --- parse Mach-O load commands ---
const magic = u32(dv,0);
if (magic !== 0xfeedfacf) die('not 64-bit mach-o (magic '+magic.toString(16)+')');
const ncmds = u32(dv,16);
let p = 32; // header64
const cmds = [];
for (let i=0;i<ncmds;i++){
  const cmd = u32(dv,p), sz = u32(dv,p+4);
  cmds.push({cmd,sz,off:p});
  p += sz;
}
// find segments
function seg(name){
  for (const c of cmds){
    if (c.cmd===0x19){ // LC_SEGMENT_64
      const n = buf.slice(c.off+8, c.off+24).toString('utf8').replace(/\0+$/,'');
      if (n===name) return c;
    }
  }
  return null;
}
const segBUN = seg('__BUN'), segLINK = seg('__LINKEDIT');
if (!segBUN) die('no __BUN');
const BUNfo = u64(dv, segBUN.off+40);   // fileoff @ +40 in segment_command_64
const base = BUNfo + 8;
const headerLen = u64(dv, BUNfo);
const offOff = base + headerLen - 32 - TRAILER.length;
// verify: trailer
const gotTr = buf.slice(base+headerLen-TRAILER.length, base+headerLen).toString('latin1');
if (gotTr !== TRAILER) die('trailer mismatch: '+JSON.stringify(gotTr));
const byteCount = u64(dv, offOff);
const modOff = u32(dv, offOff+8), modLen = u32(dv, offOff+12);
const entryId = u32(dv, offOff+16);
const argvOff = u32(dv, offOff+20);
const STRIDE = 52, nMod = modLen/STRIDE;
if (!Number.isInteger(nMod)) die('module count not integer: '+nMod);
console.log(`base=${base} headerLen=${headerLen} modules=${nMod} entry=${entryId}`);

// --- anchor location ---
const anchorIdx = buf.indexOf(Buffer.from(ANCHOR));
if (anchorIdx < 0) die('anchor not found: '+ANCHOR);
if (buf.indexOf(Buffer.from(ANCHOR), anchorIdx+1) >= 0) die('anchor not unique');
const Fins = anchorIdx + 'continue}'.length;  // right before return
const P = Fins - base;                          // payload-relative
console.log(`anchor @${anchorIdx}, insert @${Fins}, payload P=${P}`);

// which module's contents holds the insertion point + its index
const SP = (o)=>({offset:u32(dv,base+o,true),length:u32(dv,base+o+4)});
function modSP(i){ const mo=modOff+i*STRIDE; return {
  mo, name:SP(mo), contents:SP(mo+8), sourcemap:SP(mo+16),
  bytecode:SP(mo+24), module_info:SP(mo+32), bop:SP(mo+40) }; }
let hostMod = -1;
for (let i=0;i<nMod;i++){ const m=modSP(i); const s=m.contents.offset;
  if (P>s && P<s+m.contents.length){ hostMod=i; break; } }
if (hostMod<0) die('insert point not inside any module contents');
console.log(`host module = ${hostMod}, bytecode len = ${modSP(hostMod).bytecode.length}`);

// --- snippet + padding (delta = page multiple) ---
const snippet = readFileSync(new URL('../inject/snippet.js', import.meta.url), 'utf8').replace(/\n+$/,'');
const rawLen = Buffer.byteLength(snippet, 'latin1');
const delta = Math.ceil(rawLen / PAGE) * PAGE;
const insertStr = snippet + ' '.repeat(delta - rawLen);  // trailing space padding (valid JS)
const insertBuf = Buffer.from(insertStr, 'latin1');
if (insertBuf.length !== delta) die('insert length mismatch');
console.log(`snippet ${rawLen}B → insert ${delta}B (delta)`);

// --- new buffer: [0:Fins] + insert + [Fins:] ---
const nbuf = Buffer.concat([buf.slice(0,Fins), insertBuf, buf.slice(Fins)]);
const ndv = new DataView(nbuf.buffer, nbuf.byteOffset, nbuf.byteLength);

// ============ PAYLOAD fixups ============
// u64 header += delta
setU64(ndv, BUNfo, headerLen + delta);
// Offsets move: new location = offOff + delta
const nOffOff = offOff + delta;
setU64(ndv, nOffOff, byteCount + delta);                 // byte_count
if (modOff >= P) setU32(ndv, nOffOff+8, modOff + delta);  // modules_ptr.offset
if (argvOff >= P) setU32(ndv, nOffOff+20, argvOff + delta);// argv_ptr.offset
// module metadata array: new location base+(modOff>=P?modOff+delta:modOff)
const nModOff = (modOff >= P ? modOff + delta : modOff);
let shifted=0, grown=0;
for (let i=0;i<nMod;i++){
  const mo = nModOff + i*STRIDE;   // this module entry position in the new buffer (payload-relative)
  for (const fo of [0,8,16,24,32,40]){  // 6 StringPointers
    const spOff = base + mo + fo;        // absolute file offset (new buffer)
    const o = u32(ndv, spOff), l = u32(ndv, spOff+4);
    if (o >= P){ setU32(ndv, spOff, o+delta); shifted++; }
    else if (o < P && P < o+l){ setU32(ndv, spOff+4, l+delta); grown++; }
  }
}
console.log(`fixup: ${shifted} offsets shifted, ${grown} lengths grown`);
if (grown !== 1) die('expected exactly 1 grown length (host contents), got '+grown);
// zero the host module bytecode/module_info (force source parsing)
{ const mo = nModOff + hostMod*STRIDE;
  setU32(ndv, base+mo+24+4, 0);  // bytecode.length=0
  setU32(ndv, base+mo+32+4, 0);  // module_info.length=0
  console.log('zeroed host bytecode+module_info length');
}

// ============ MACH-O fixups ============
// segment: filesize/vmsize... segment_command_64 layout:
// cmd(0) cmdsize(4) segname(8..24) vmaddr(24) vmsize(32) fileoff(40) filesize(48) ...
setU64(ndv, segBUN.off+32, u64(ndv,segBUN.off+32)+delta);  // __BUN vmsize
setU64(ndv, segBUN.off+48, u64(ndv,segBUN.off+48)+delta);  // __BUN filesize
if (segLINK){
  setU64(ndv, segLINK.off+24, u64(ndv,segLINK.off+24)+delta); // vmaddr
  setU64(ndv, segLINK.off+40, u64(ndv,segLINK.off+40)+delta); // fileoff
}
// remaining LC file offsets (all inside __LINKEDIT → >= Fins → +delta)
function bump32(off){ setU32(ndv, off, u32(ndv,off)+delta); }
for (const c of cmds){
  switch(c.cmd){
    case 0x2:  bump32(c.off+8); bump32(c.off+16); break;          // LC_SYMTAB symoff,stroff
    case 0xb:  // LC_DYSYMTAB: several offsets
      for (const d of [32,40,48,56,64,72]){ const v=u32(ndv,c.off+d); if(v) setU32(ndv,c.off+d,v+delta); } break;
    case 0x1d: bump32(c.off+8); break;   // LC_CODE_SIGNATURE dataoff
    case 0x26: bump32(c.off+8); break;   // LC_FUNCTION_STARTS
    case 0x29: bump32(c.off+8); break;   // LC_DATA_IN_CODE
    case 0x22: case 0x80000022: // LC_DYLD_INFO(_ONLY)
      for (const d of [8,16,24,32,40]){ const v=u32(ndv,c.off+d); if(v) setU32(ndv,c.off+d,v+delta); } break;
    case 0x80000034: bump32(c.off+8); break; // LC_DYLD_CHAINED_FIXUPS
    case 0x80000033: bump32(c.off+8); break; // LC_DYLD_EXPORTS_TRIE
  }
}

// --- write + codesign ---
writeFileSync(out, nbuf);
console.log(`wrote ${out} (${nbuf.length} bytes, +${delta})`);
try {
  execSync(`codesign --remove-signature "${out}" 2>/dev/null`, {stdio:'ignore'});
} catch {}
execSync(`codesign -f -s - --preserve-metadata=entitlements "${out}"`, {stdio:'inherit'});
execSync(`codesign -v "${out}"`, {stdio:'inherit'});
console.log('codesign OK');
