import crypto from "node:crypto";

const ORIGIN=(process.env.APP_ORIGIN||"https://horizon-usa-ai.vercel.app").replace(/\/$/,"");
export const configured=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32);
export const redirectUri=()=>ORIGIN+"/api/auth-callback";
export const secretKey=()=>crypto.createHash("sha256").update(process.env.SESSION_SECRET||"").digest();
export const random=()=>crypto.randomBytes(24).toString("base64url");
export function seal(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",secretKey(),iv);
  const payload=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString("base64url");
}
export function unseal(value){
  try{
    const bytes=Buffer.from(value||"","base64url");
    if(bytes.length<29)return null;
    const decipher=crypto.createDecipheriv("aes-256-gcm",secretKey(),bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8"));
  }catch{return null}
}
export function cookies(req){
  return Object.fromEntries((req.headers.cookie||"").split(";").map(c=>c.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));
}
export function setCookie(res,name,value,age){
  res.setHeader("Set-Cookie",name+"="+encodeURIComponent(value)+"; Path=/; Max-Age="+age+"; HttpOnly; Secure; SameSite=Lax");
}
export function getSession(req){
  const s=unseal(cookies(req).horizon_session);
  return s&&s.email&&s.access_token?s:null;
}
export function saveSession(res,s){setCookie(res,"horizon_session",seal(s),60*60*24*30)}
export function json(res,code,body){res.setHeader("Cache-Control","no-store");res.status(code).json(body)}
export function securePost(req,res){
  if(req.method!=="POST"){json(res,405,{error:"Método não permitido"});return false}
  if(req.headers.origin!==ORIGIN){json(res,403,{error:"Origem da solicitação não autorizada"});return false}
  return true;
}
export async function googleToken(params){
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error("Falha na autorização do Google ("+(data.error||response.status)+")");
 return data;
}
export async function ensureAccess(req,res){
 const s=getSession(req);
 if(!s)throw new Error("Conta Gmail não conectada");
 if(s.expiresAt>Date.now()+60_000)return s;
 if(!s.refresh_token)throw new Error("Conexão expirada. Reconecte o Gmail");
 const t=await googleToken({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:s.refresh_token,grant_type:"refresh_token"});
 const next={...s,access_token:t.access_token,expiresAt:Date.now()+(t.expires_in||3600)*1000};
 saveSession(res,next);return next;
}
export function error(res,err){json(res,400,{error:err?.message||"Erro inesperado"})}
