import {configured,getSession,json} from "./_gmail.js";
export default function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"Método não permitido"});
 const session=configured()?getSession(req):null;
 json(res,200,{configured:configured(),connected:!!session,email:session?.email||null});
}
