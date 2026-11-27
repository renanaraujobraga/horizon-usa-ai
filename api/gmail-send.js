import crypto from "node:crypto";
import {configured,ensureAccess,securePost,json,error} from "./_gmail.js";
const MAX=2*1024*1024;
const b64=s=>Buffer.from(s,"utf8").toString("base64");
const fold=s=>s.match(/.{1,76}/g)?.join("\r\n")||"";
function mime({from,to,subject,body,filename,buffer}){
 const boundary="horizon_"+crypto.randomBytes(12).toString("hex");
 const cleanFilename=filename.replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,110);
 const subjectHeader="=?UTF-8?B?"+b64(subject)+"?=";
 const parts=[
 "From: "+from,
 "To: "+to,
 "Date: "+new Date().toUTCString(),
 "Subject: "+subjectHeader,
 "MIME-Version: 1.0",
 'Content-Type: multipart/mixed; boundary="'+boundary+'"',
 "",
 "--"+boundary,
 'Content-Type: text/plain; charset="UTF-8"',
 "Content-Transfer-Encoding: base64",
 "",
 fold(b64(body)),
 "--"+boundary,
 'Content-Type: application/pdf; name="'+cleanFilename+'"',
 "Content-Transfer-Encoding: base64",
 'Content-Disposition: attachment; filename="'+cleanFilename+'"',
 "",
 fold(buffer.toString("base64")),
 "--"+boundary+"--",
 ""
 ];
 return Buffer.from(parts.join("\r\n"),"utf8").toString("base64url");
}
export default async function handler(req,res){
 if(!securePost(req,res))return;
 if(!configured())return json(res,503,{error:"Configure as credenciais do Gmail na Vercel primeiro"});
 try{
  const {to,subject,body,filename,pdfBase64}=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  if(typeof to!=="string"||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)||/[\r\n]/.test(to))return json(res,400,{error:"Destinatário inválido"});
  if(typeof subject!=="string"||!subject.trim()||subject.length>240||/[\r\n]/.test(subject))return json(res,400,{error:"Assunto inválido"});
  if(typeof body!=="string"||!body.trim()||body.length>25000)return json(res,400,{error:"Mensagem inválida"});
  if(typeof filename!=="string"||!filename.toLowerCase().endsWith(".pdf")||filename.length>160)return json(res,400,{error:"O arquivo deve ser PDF"});
  if(typeof pdfBase64!=="string"||pdfBase64.length>MAX*1.38+10)return json(res,400,{error:"PDF acima do limite de 2 MB"});
  const buffer=Buffer.from(pdfBase64,"base64");
  if(!buffer.length||buffer.length>MAX||buffer.subarray(0,5).toString()!=="%PDF-")return json(res,400,{error:"Arquivo PDF inválido ou acima de 2 MB"});
  const session=await ensureAccess(req,res);
  if(!session.scopes?.split(" ").includes("https://www.googleapis.com/auth/gmail.send"))
    return json(res,403,{error:"A conta conectada não concedeu permissão para enviar mensagens. Clique em Reconectar Gmail e autorize o acesso ao envio."});
  const raw=mime({from:session.email,to,subject,body,filename,buffer});
  const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
   method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({raw})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const insufficientScope=response.status===403&&(data.error?.message||"").toLowerCase().includes("insufficient authentication scopes");
    return json(res,insufficientScope?403:response.status===401?401:502,{
      error:insufficientScope?"A autorização do Gmail não permite enviar mensagens. Reconecte a conta e conceda a permissão de envio.":"Gmail recusou o envio. "+(data.error?.message||response.status)
    });
  }
  if(!data.id)return json(res,502,{error:"Resposta do Gmail sem confirmação do envio"});
  return json(res,200,{sent:true,id:data.id,threadId:data.threadId,email:session.email});
 }catch(e){error(res,e)}
}
