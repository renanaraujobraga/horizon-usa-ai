import crypto from "node:crypto";
import {configured,random,seal,setCookie,redirectUri,json} from "./_gmail.js";
export default function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"Método não permitido"});
 if(!configured())return json(res,503,{error:"Integração Gmail ainda não configurada no servidor"});
 const state=random(),verifier=random()+random();
 const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");
 setCookie(res,"horizon_oauth",seal({state,verifier,exp:Date.now()+600000}),600);
 const params=new URLSearchParams({
   client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri(),response_type:"code",
   scope:"https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
   access_type:"offline",prompt:"consent",state,code_challenge:challenge,code_challenge_method:"S256"
 });
 res.redirect(302,"https://accounts.google.com/o/oauth2/v2/auth?"+params.toString());
}
