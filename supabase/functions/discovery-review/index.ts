import { z } from "npm:zod@3.25.76";
const kind = z.enum(["protocol", "attribute", "similarity", "ordering", "cluster"]);
const imageSchema = z.object({url:z.string().regex(/^images\/[a-f0-9-]+\.jpg$/),caption:z.string().max(80)}).strict();
const caseSchema = z.object({id:z.string().uuid(),version:z.literal("discovery-pilot-v1"),kind,title:z.string().max(120),prompt:z.string().max(4000),images:z.array(imageSchema).max(4)}).strict();
const ordinal = z.enum(["low","moderate","high","uncertain","na"]);
const ratings = z.object({nuclearAtypia:ordinal,polarity:ordinal,architecturalDisorder:ordinal,inflammation:ordinal,stroma:ordinal,mixed:z.enum(["yes","no","uncertain","na"])}).strict();
const answer = z.discriminatedUnion("kind",[
 z.object({kind:z.literal("protocol"),choice:z.enum(["accept","revise"])}).strict(),
 z.object({kind:z.literal("attribute"),ratings}).strict(),
 z.object({kind:z.literal("cluster"),ratings}).strict(),
 z.object({kind:z.literal("similarity"),choice:z.enum(["A","B","tie","incomparable","uncertain"])}).strict(),
 z.object({kind:z.literal("ordering"),choice:z.enum(["A_higher","B_higher","similar","incomparable","uncertain"])}).strict(),
]);
const reviewSchema=z.object({caseId:z.string().uuid(),reviewerId:z.string().uuid(),reviewerName:z.string().trim().min(1).max(80),answer,note:z.string().max(2000)}).strict();
const commands=z.discriminatedUnion("action",[
 z.object({action:z.literal("login")}).strict(),
 z.object({action:z.literal("list"),reviewerId:z.string().uuid()}).strict(),
 z.object({action:z.literal("save"),review:reviewSchema}).strict(),
 z.object({action:z.literal("export")}).strict(),
 z.object({action:z.literal("seed"),rows:z.array(caseSchema).min(1).max(100)}).strict(),
]);
const origins=new Set(["https://je1zzz.github.io","http://127.0.0.1:5173","http://localhost:5173","http://127.0.0.1:5174"]);
async function db(path:string,init:RequestInit={}):Promise<unknown>{
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw Error("Missing environment");
 const response=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",...init.headers}});
 if(!response.ok)throw Error(`Database HTTP ${response.status}`);
 const body=await response.text();return body?JSON.parse(body):null;
}
async function allRows(path:string){
 const rows:unknown[]=[];
 for(let offset=0;;offset+=500){const page=z.array(z.unknown()).parse(await db(`${path}&limit=500&offset=${offset}`));rows.push(...page);if(page.length<500)return rows;}
}
Deno.serve(async request=>{
 const origin=request.headers.get("Origin");const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",Vary:"Origin"});
 if(origin&&origins.has(origin)){headers.set("Access-Control-Allow-Origin",origin);headers.set("Access-Control-Allow-Headers","authorization,content-type,apikey");headers.set("Access-Control-Allow-Methods","POST,OPTIONS");}
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:"来源不受支持"},403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return reply({error:"仅支持POST"},405);
 try{
  const code=request.headers.get("Authorization")?.replace(/^Bearer /,"");if(!code||code.length>200)return reply({error:"请输入访问码"},401);
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code));const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
  const roles=z.array(z.object({role:z.enum(["reviewer","admin"])})).parse(await db(`cv_access?select=role&code_hash=eq.${hash}&limit=1`));const role=roles[0]?.role;
  if(!role)return reply({error:"访问码无效"},401);
  const raw=await request.text();if(raw.length>500000)return reply({error:"请求过大"},413);const command=commands.parse(JSON.parse(raw));
  switch(command.action){
   case "login":return reply({role});
   case "list":{
    const [cases,reviews]=await Promise.all([allRows("cv_discovery_cases?select=payload&order=id"),allRows(`cv_discovery_reviews?select=payload,updated_at&reviewer_id=eq.${command.reviewerId}&order=case_id`)]);
    return reply({cases:z.array(z.object({payload:caseSchema})).parse(cases).map(x=>x.payload),reviews:z.array(z.object({payload:reviewSchema,updated_at:z.string()})).parse(reviews).map(x=>({...x.payload,updatedAt:x.updated_at}))});
   }
   case "save":{
    if(role!=="reviewer")return reply({error:"管理员只读，请用医生访问码填写"},403);
    const rows=z.array(z.object({payload:caseSchema})).parse(await db(`cv_discovery_cases?select=payload&id=eq.${command.review.caseId}&limit=1`));const item=rows[0]?.payload;
    if(!item)return reply({error:"题目不存在"},404);
    if(item.kind!==command.review.answer.kind)return reply({error:"回答类型与题目不匹配"},400);
    if(command.review.answer.kind==="protocol"&&command.review.answer.choice==="revise"&&!command.review.note.trim())return reply({error:"请说明需要修改的定义"},400);
    if(item.kind!=="protocol"){
     const protocols=z.array(z.object({payload:caseSchema})).parse(await db(`cv_discovery_cases?select=payload&payload->>kind=eq.protocol&payload->>version=eq.${item.version}`));
     const accepted=z.array(z.object({payload:reviewSchema})).parse(await db(`cv_discovery_reviews?select=payload&reviewer_id=eq.${command.review.reviewerId}&payload->answer->>kind=eq.protocol&payload->answer->>choice=eq.accept`));
     const acceptedIds=new Set(accepted.map(row=>row.payload.caseId));
     if(!protocols.length||protocols.some(row=>!acceptedIds.has(row.payload.id)))return reply({error:"请先确认本批评分定义"},409);
    }
    const updatedAt=z.string().parse(await db("rpc/cv_discovery_save_review",{method:"POST",body:JSON.stringify({review:command.review})}));return reply({saved:true,updatedAt});
   }
   case "seed":{
    if(role!=="admin")return reply({error:"需要管理员权限"},403);
    await db("cv_discovery_cases?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(command.rows.map(payload=>({id:payload.id,payload})))});return reply({inserted:command.rows.length});
   }
   case "export":{
    if(role!=="admin")return reply({error:"需要管理员权限"},403);
    return reply({reviews:await allRows("cv_discovery_reviews?select=payload,updated_at&order=case_id,reviewer_id")});
   }
  }
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return reply({error:"请检查填写内容"},400);console.error("discovery_backend_error",error instanceof Error?error.message:"unknown");return reply({error:"保存服务暂不可用，请重试"},500);}
});
