import {configured,cookies,unseal,setCookie,redirectUri,googleToken,saveSession} from "./_gmail.js";
export default async function handler(req,res){
 const go=(msg)=>res.redirect(302,"/?gmail="+encodeURIComponent(msg));
 if(req.method!=="GET"||!configured())return go("config");
 const {code,state,error}=req.query||{};
 const flow=unseal(cookies(req).horizon_oauth);
 setCookie(res,"horizon_oauth","",0);
 if(error)return go("denied");
 if(!flow||!state||flow.state!==state||flow.exp<Date.now()||!code)return go("state");
 try{
  const tokens=await googleToken({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri(),grant_type:"authorization_code",code,code_verifier:flow.verifier});
  if(!tokens.access_token)throw Error("Token indisponível");
  const response=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+tokens.access_token}});
  if(!response.ok)throw Error("Não foi possível identificar a conta");
  const user=await response.json();
  if(!user.verified_email||!user.email)throw Error("E-mail não verificado");
  const allowed=process.env.ALLOWED_GMAIL_ADDRESS;
  if(allowed&&user.email.toLowerCase()!==allowed.toLowerCase())return go("forbidden");
  saveSession(res,{email:user.email,access_token:tokens.access_token,refresh_token:tokens.refresh_token||null,expiresAt:Date.now()+(tokens.expires_in||3600)*1000});
  return go("connected");
 }catch(e){return go("error")}
}
