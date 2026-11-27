// Recent official H-2A/H-2B orders, drawn from DOL SeasonalJobs RSS.
// We only label a record ACTIVE after checking its official detail page.
const FEED="https://seasonaljobs.dol.gov/job_rss.xml";
const BASE="https://seasonaljobs.dol.gov/jobs/";
function decodeXML(s){
 return String(s||"").replace(/^<!\[CDATA\[|\]\]>$/g,"")
 .replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&")
 .replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'")
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function tag(xml,name){
 const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");
 return decodeXML(re.exec(xml)?.[1]||"");
}
function jobsFromRSS(xml){
 const records=[];const blocks=String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 for(const block of blocks){
  const rawLink=tag(block,"link");
  const match=/\b(H-(?:300|400)-\d{5}-\d{6})\b/i.exec(rawLink);
  if(!match)continue;
  const caseNumber=match[1].toUpperCase();
  const description=tag(block,"description"),title=tag(block,"title");
  const published=tag(block,"pubDate");
  const stateMatch=/\b([A-Za-z .'-]{2,55}),\s*([A-Z]{2})\b/.exec(description+" "+title);
  const location=stateMatch?stateMatch[0]:"Estados Unidos (ver anúncio)";
  const state=stateMatch?.[2]||"";
  records.push({id:"dol:"+caseNumber,caseNumber,company:"Empregador informado no anúncio DOL",
   role:title||"Trabalho temporário H-2",location,state,source:"SeasonalJobs / DOL",
   url:BASE+caseNumber,visaType:caseNumber.startsWith("H-300")?"H-2A":"H-2B",
   publishedAt:Number.isFinite(Date.parse(published))?new Date(published).toISOString():null,
   description:description.slice(0,500)});
 }
 return records;
}
async function getPage(url,timeoutMs){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{const r=await fetch(url,{headers:{"Accept":"text/html,application/rss+xml,application/xml"},signal:ctrl.signal});
  if(!r.ok)throw Error("HTTP "+r.status);
  return await r.text();
 }finally{clearTimeout(timer)}
}
function activeInPage(html,caseNumber){
 // Only accept explicit ACTIVE status in the HTML of the matching government job.
 if(!html.includes(caseNumber))return false;
 const withoutScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
 return /(?:>\s*ACTIVE\s*<|\bACTIVE\s*<\/span>|\bJob Status[^<]{0,100}<[^>]*>\s*ACTIVE\b)/i.test(withoutScripts);
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=900");
 if(req.method!=="GET")return res.status(405).json({error:"Método não permitido"});
 const type=String(req.query?.type||"all").toUpperCase();
 const q=String(req.query?.q||"").toLowerCase().trim().slice(0,90);
 const state=String(req.query?.state||"").toUpperCase().slice(0,2);
 if(!["ALL","H-2A","H-2B"].includes(type)||state&&!/^[A-Z]{2}$/.test(state))
   return res.status(400).json({error:"Filtro inválido"});
 try{
  const xml=await getPage(FEED,9000);
  if(!/<(?:rss|feed)\b/i.test(xml))throw Error("Feed inválido");
  const all=jobsFromRSS(xml);
  const matching=all.filter(j=>(type==="ALL"||j.visaType===type)
   &&(!q||(j.role+" "+j.company+" "+j.location+" "+j.description).toLowerCase().includes(q))
   &&(!state||j.state===state));
  // This live route is a small window into new postings, not the full DOL registry.
  const selection=matching.slice(0,32);
  const checked=await Promise.allSettled(selection.map(async job=>{
   const page=await getPage(job.url,4500);
   if(!activeInPage(page,job.caseNumber))return null;
   return {...job,availability:"ACTIVE",evidence:{kind:"official-program",visaTypes:[job.visaType],
    note:"Status ACTIVE confirmado na página da ordem de trabalho SeasonalJobs."}};
  }));
  const jobs=checked.filter(x=>x.status==="fulfilled"&&x.value).map(x=>x.value);
  return res.status(200).json({jobs,checkedAt:new Date().toISOString(),feedEntries:all.length,
   matchingEntries:matching.length,checkedEntries:selection.length,verifiedActive:jobs.length,
   source:"U.S. Department of Labor — SeasonalJobs",partial:matching.length>selection.length,
   note:"Amostra dos anúncios recentes do feed oficial, verificada contra páginas ACTIVE. Não cobre todas as ordens de trabalho. Status e elegibilidade podem mudar."});
 }catch(err){
  console.error("DOL SeasonalJobs feed unavailable",err?.name);
  return res.status(502).json({error:"Feed ou verificação de status do DOL indisponível. Use a pesquisa oficial para consultar vagas H-2A/H-2B ativas."});
 }
}
