import {setCookie,securePost,json} from "./_gmail.js";
export default function handler(req,res){
 if(!securePost(req,res))return;
 setCookie(res,"horizon_session","",0);
 json(res,200,{connected:false});
}
