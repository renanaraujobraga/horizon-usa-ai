import {configured,cookies,unseal,setCookie,redirectUri,saveSession} from "./_gmail.js";

export default async function handler(req,res){
  const go=(msg)=>res.redirect(302,"/?gmail="+encodeURIComponent(msg));
  if(req.method!=="GET"||!configured())return go("config");
  const {code,state,error}=req.query||{};
  const flow=unseal(cookies(req).horizon_oauth);
  if(error)return go("denied");
  if(!flow||!state||flow.state!==state||flow.exp<Date.now()||!code)return go("state");
  let tokens;
  try{
    const response=await fetch("https://oauth2.googleapis.com/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        client_id:process.env.GOOGLE_CLIENT_ID,
        client_secret:process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:redirectUri(),
        grant_type:"authorization_code",
        code,
        code_verifier:flow.verifier
      })
    });
    tokens=await response.json().catch(()=>({}));
    if(!response.ok){
      const tokenCode=typeof tokens.error==="string"?tokens.error:"unknown";
      console.error("Google OAuth token exchange failed", {status:response.status,code:tokenCode});
      return go(tokenCode==="invalid_client"?"token_client":tokenCode==="invalid_grant"?"token_grant":"token_other");
    }
    if(!tokens.access_token)return go("token_missing");
    const grantedScopes=(typeof tokens.scope==="string"?tokens.scope:"").split(" ").filter(Boolean);
    if(!grantedScopes.includes("https://www.googleapis.com/auth/gmail.send")){
      console.error("Google OAuth authorization missing gmail.send scope");
      return go("gmail_scope_missing");
    }
  }catch(e){
    console.error("Google OAuth network error",e?.name);
    return go("token_network");
  }

  let user;
  try{
    const response=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{
      headers:{Authorization:"Bearer "+tokens.access_token}
    });
    if(!response.ok){
      console.error("Google userinfo lookup failed",response.status);
      return go("userinfo_http");
    }
    user=await response.json();
    if(!user.email||user.verified_email===false)return go("userinfo_email");
  }catch(e){
    console.error("Google userinfo error",e?.name);
    return go("userinfo_network");
  }
  const allowed=process.env.ALLOWED_GMAIL_ADDRESS?.trim();
  if(allowed&&user.email.toLowerCase()!==allowed.toLowerCase())return go("forbidden");

  try{
    // Preserve both Set-Cookie headers instead of overwriting one of them.
    saveSession(res,{
      email:user.email,
      access_token:tokens.access_token,
      refresh_token:tokens.refresh_token||null,
      scopes:tokens.scope,
      expiresAt:Date.now()+(tokens.expires_in||3600)*1000
    });
    const sessionCookie=res.getHeader("Set-Cookie");
    setCookie(res,"horizon_oauth","",0);
    const clearCookie=res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie",[sessionCookie,clearCookie].flat());
    return go("connected");
  }catch(e){
    console.error("OAuth session error",e?.name);
    return go("session");
  }
}
