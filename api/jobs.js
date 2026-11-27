// Searches published openings from public employer ATS feeds (Greenhouse / Lever)
// and a remote-job feed (Remotive). No scraped credentials, no visa claims.
const BOARDS=[
 ["greenhouse","gitlab","GitLab"],
 ["greenhouse","figma","Figma"],
 ["greenhouse","stripe","Stripe"],
 ["greenhouse","datadog","Datadog"],
 ["greenhouse","reddit","Reddit"],
 ["greenhouse","duolingo","Duolingo"],
 ["greenhouse","coinbase","Coinbase"],
 ["greenhouse","rippling","Rippling"],
 ["greenhouse","notion","Notion"],
 ["greenhouse","chime","Chime"],
 ["greenhouse","roblox","Roblox"],
 ["greenhouse","plaid","Plaid"],
 ["greenhouse","asana","Asana"],
 ["lever","spotify","Spotify"],
 ["lever","palantir","Palantir"],
 ["lever","coursera","Coursera"],
 ["lever","atlassian","Atlassian"]
];
const US_STATES={
 AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
 CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",
 IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
 ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
 MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
 NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",
 ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
 RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",
 UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
 WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia"
};
const ROLE_RE=/(product\s*(owner|manager|lead|management)|project\s*(manager|lead|management)|scrum\s*master|agile\s*(coach|delivery|project|program|transformation)|technical\s*program\s*manager|program\s*manager|delivery\s*manager)/i;
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function matchesQuery(job,q){
 if(!q)return ROLE_RE.test(job.role);
 const words=norm(q).split(/\s+/).filter(Boolean);
 const corpus=norm(job.role+" "+job.company);
 return words.every(word=>corpus.includes(word));
}
function extractState(location){
 const t=String(location||"");
 for(const [abbr,full] of Object.entries(US_STATES)){
   if(new RegExp("(?:^|[,\\s/(-])"+abbr+"(?:$|[,\\s/)-])","i").test(t))return abbr;
   if(new RegExp("\\b"+full.replace(/ /g,"\\s+")+"\\b","i").test(t))return abbr;
 }
 return "";
}
function isUS(location){
 const t=String(location||"");
 return !!extractState(t)||/\b(United States|USA|US|U\.S\.A\.|U\.S\.|US[- /]Remote|Remote[- /]US)\b/i.test(t);
}
function acceptableUrl(uri){
 try{const u=new URL(uri);return u.protocol==="https:"?u.toString():""}catch{return ""}
}
async function getJSON(url){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),6500);
 try{
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"HorizonUSAAI/0.4 (immigration-evidence-search)"},signal:ctrl.signal});
  if(!response.ok)throw new Error("HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timeout)}
}
function cleanText(text){
 return String(text||"").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").slice(0,35000);
}
// Strict: reject negative sponsorship language before looking for affirmative support.
// A visa mention in an ad is NOT considered a sponsorship offer.
function immigrationEvidence(description){
 const text=cleanText(description);
 const negatives=[
  /(?:do(?:es)?\s+not|will\s+not|don['’]?t|won['’]?t|cannot|can['’]?t|unable\s+to|not\s+able\s+to)\s+(?:provide|offer|support|consider|sponsor)[^.!?]{0,75}(?:sponsor|visa|immigration|work\s+authorization)/i,
  /(?:no|without|not\s+(?:available|provided|offered|eligible))\s+(?:visa\s+|immigration\s+)?sponsorship/i,
  /(?:must|need)\s+(?:already\s+)?(?:be\s+)?(?:authorized|eligible)\s+to\s+work[^.!?]{0,110}without\s+(?:the\s+need\s+for\s+)?(?:visa\s+)?sponsorship/i,
  /sponsorship\s+(?:is\s+)?(?:not|unavailable|cannot|won['’]?t)/i
 ];
 if(negatives.some(rx=>rx.test(text)))return {kind:"exclusion",note:"O anúncio indica restrição ou indisponibilidade de patrocínio."};
 const affirmed=[
  /\b(?:we|company|employer)\s+(?:will|can|may|do)\s+(?:provide|offer|support|consider)\s+(?:visa\s+|immigration\s+|work\s+)?sponsorship\b/i,
  /\b(?:visa|immigration|h[- ]?1b|eb[- ]?[23])\s+sponsorship\s+(?:is\s+)?(?:available|offered|provided|supported|considered)\b/i,
  /\bsponsorship\s+(?:for\s+)?(?:h[- ]?1b|eb[- ]?[23]|work\s+visa|employment\s+visa)[^.!?]{0,35}(?:available|provided|offered|supported|considered)\b/i,
  /\b(?:offers?|provides?|supports?|offer|provide|support)\s+(?:employment[- ]based\s+)?(?:(?:visa|immigration|work\s+permit)\s+)?sponsorship\b/i
 ];
 const hit=affirmed.map(rx=>rx.exec(text)).find(Boolean);
 if(!hit)return {kind:"none"};
 const index=Math.max(0,text.indexOf(hit[0]));
 const start=Math.max(0,index-75),end=Math.min(text.length,index+hit[0].length+100);
 const context=text.slice(start,end);
 const visaTypes=[];
 if(/\bh[- ]?1b\b/i.test(context))visaTypes.push("H-1B");
 if(/\beb[- ]?2\b/i.test(context))visaTypes.push("EB-2");
 if(/\beb[- ]?3\b/i.test(context))visaTypes.push("EB-3");
 return {kind:"explicit-claim",visaTypes,note:"O anúncio menciona disponibilidade de patrocínio, sujeita à confirmação com o empregador.",excerpt:context};
}
function ghJob(j,company){
 const location=String(j.location?.name||"");
 return {id:"gh:"+String(j.id),company,role:String(j.title||""),location,
  state:extractState(location),remote:/remote/i.test(location),url:acceptableUrl(j.absolute_url),
  source:"Greenhouse",publishedAt:j.updated_at||null,evidence:immigrationEvidence(j.content||"")};
}
function leverJob(j,company){
 const location=String(j.categories?.location||j.workplaceType||"");
 const others=Array.isArray(j.categories?.allLocations)?j.categories.allLocations:[];
 const best=[location,...others].find(isUS)||location;
 return {id:"lever:"+String(j.id),company,role:String(j.text||""),location:best,
  state:extractState(best),remote:/remote/i.test(best)||j.workplaceType==="remote",url:acceptableUrl(j.hostedUrl),
  source:"Lever",publishedAt:j.createdAt?new Date(j.createdAt).toISOString():null,evidence:immigrationEvidence(j.descriptionPlain||j.description||j.additional||"")};
}
function remotiveJob(j){
 const location=String(j.candidate_required_location||"");
 return {id:"remotive:"+String(j.id),company:String(j.company_name||""),role:String(j.title||""),location,
  state:extractState(location),remote:true,url:acceptableUrl(j.url),
  source:"Remotive",publishedAt:j.publication_date||null,salaryText:String(j.salary||"").slice(0,140),evidence:immigrationEvidence(j.description||"")};
}
async function sourceJobs([kind,slug,company]){
 const url=kind==="greenhouse"
  ?"https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(slug)+"/jobs?content=true"
  :"https://api.lever.co/v0/postings/"+encodeURIComponent(slug)+"?mode=json";
 const result=await getJSON(url);
 const raw=kind==="greenhouse"?result.jobs:result;
 if(!Array.isArray(raw))throw Error("Invalid ATS response");
 return raw.map(j=>kind==="greenhouse"?ghJob(j,company):leverJob(j,company));
}
async function remoteJobs(){
 const response=await getJSON("https://remotive.com/api/remote-jobs?limit=150");
 return Array.isArray(response.jobs)?response.jobs.map(remotiveJob):[];
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","public, s-maxage=600, stale-while-revalidate=900");
 if(req.method!=="GET")return res.status(405).json({error:"Método não permitido"});
 const q=String(req.query?.q||"").slice(0,100).trim();
 const state=String(req.query?.state||"").toUpperCase().slice(0,2);
 const visa=String(req.query?.visa||"").toUpperCase().slice(0,5);
 if(state&&!US_STATES[state])return res.status(400).json({error:"Estado inválido"});
 if(visa&&!["EB-2","EB-3","H-1B"].includes(visa))return res.status(400).json({error:"Categoria de visto inválida"});
 const checkedAt=new Date().toISOString();
 try{
  const results=await Promise.allSettled([...BOARDS.map(sourceJobs),remoteJobs()]);
  let found=0;const unavailable=[];
  const jobs=[];
  for(let i=0;i<results.length;i++){
   const r=results[i];
   if(r.status==="fulfilled"){found++;jobs.push(...r.value)}
   else unavailable.push(i===BOARDS.length?"Remotive":BOARDS[i][2]);
  }
  if(found===0)return res.status(502).json({error:"Fontes de vagas temporariamente indisponíveis. Tente novamente.",checkedAt,unavailable});
  const seen=new Set();
  const matches=jobs.filter(job=>{
   if(!job.url||!job.role||!job.company||!isUS(job.location))return false;
   if(job.evidence?.kind!=="explicit-claim")return false;
   if(state&&job.state!==state)return false;
   if(visa&&!job.evidence.visaTypes.includes(visa))return false;
   if(!matchesQuery(job,q))return false;
   const dedupe=job.source+":"+job.id;
   if(seen.has(dedupe))return false;
   seen.add(dedupe);return true;
  });
  // Prioritize titles and locations that match user's professional focus.
  matches.sort((a,b)=>Number(ROLE_RE.test(b.role))-Number(ROLE_RE.test(a.role))||
   String(b.publishedAt||"").localeCompare(String(a.publishedAt||"")));
  return res.status(200).json({
   jobs:matches.slice(0,100),totalMatches:matches.length,checkedAt,
   sourcesOk:found,sourcesChecked:results.length,unavailable,
   note:"Somente anúncios com indicação afirmativa de patrocínio na descrição. Mesmo assim, tipo de visto e elegibilidade precisam de confirmação. Não são provas de EB-2, EB-3 ou H-1B aprovados."
  });
 }catch(e){
  console.error("Public job search failure",e?.name||"Error");
  return res.status(500).json({error:"Não foi possível consultar as fontes de vagas no momento."});
 }
}
