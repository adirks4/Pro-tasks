'use strict';

// ══════════════════════════════════════════════════════════════════
//  CRYPTO — AES-256-GCM + PBKDF2 (PIN as key)
// ══════════════════════════════════════════════════════════════════
const PBKDF2_ITERS=100000;
const _e=new TextEncoder(), _d=new TextDecoder();
async function deriveKey(pin,salt){
  const km=await crypto.subtle.importKey('raw',_e.encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:PBKDF2_ITERS,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(plain,pin){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(pin,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,_e.encode(plain));
  const out=new Uint8Array(16+12+ct.byteLength);
  out.set(salt,0);out.set(iv,16);out.set(new Uint8Array(ct),28);
  return btoa(String.fromCharCode(...out));
}
async function decrypt(b64,pin){
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const key=await deriveKey(pin,bytes.slice(0,16));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(16,28)},key,bytes.slice(28));
  return _d.decode(pt);
}
