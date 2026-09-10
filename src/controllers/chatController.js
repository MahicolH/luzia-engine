import { generateAnswer } from '../services/aiProvider.js';
import { searchKnowledge } from '../services/knowledgeEngine.js';
import { compareTariffs, findTariffs, estimateTariffById } from '../services/tariffEngine.js';
import { recommendTariffs } from '../services/profileEngine.js';

function parseNumber(v){if(v==null)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;}
function extractKwh(t){const m=t.match(/(\d+(?:[.,]\d+)?)\s*kwh\b/i);return m?parseNumber(m[1]):null;}
function extractKw(t){const m=t.match(/(\d+(?:[.,]\d+)?)\s*kw\b/i);return m?parseNumber(m[1]):null;}
function extractDays(t){const m=t.match(/(\d+)\s*d[ií]as?\b/i);return m?parseNumber(m[1]):30;}
function detectCompany(t){const c=['Repsol','Naturgy','Iberdrola','Gana Energía','Nordy'];const l=t.toLowerCase();return c.find(x=>l.includes(x.toLowerCase()))??null;}
function looksLikeEstimate(t){return extractKwh(t)!==null&&/(cu[aá]nto|pagar|factura|coste|costo|estim|precio|mes|tarifa|consumo)/i.test(t);}
function looksLikeComparison(t){return /(compar|mejor|conviene|barat|econ[oó]mic|ahorr|diferencia|opci[oó]n|ranking|alternativ)/i.test(t)&&/(tarifa|precio|contrato|repsol|naturgy|iberdrola|nordy|gana energ[ií]a|electricidad|luz)/i.test(t);}
function looksLikeRecommendation(t){return /(me conviene|recomienda|recomend|mejor para mi|ideal para mi|seg[uú]n mi perfil|para mi caso)/i.test(t)&&/(tarifa|contrato|electricidad|luz|energia)/i.test(t);}

function isElectricityKnowledge(item) {
  const section = String(item?.section ?? '').toLowerCase();
  return section === 'electricidad' || section === 'structured_tariff';
}

export async function chatController(req,res,next){
  try{
    const{message,userContext={}}=req.body??{};
    if(typeof message!=='string'||!message.trim())return res.status(400).json({success:false,error:'El campo "message" es obligatorio.'});
    if(message.length>4000)return res.status(400).json({success:false,error:'El campo "message" supera 4000 caracteres.'});

    const text=message.trim();
    const comparisonUsed=looksLikeComparison(text);
    const recommendationUsed=looksLikeRecommendation(text);
    const estimateUsed=looksLikeEstimate(text);
    const knowledgeRaw=await searchKnowledge(text);
    const knowledgeContext=knowledgeRaw.filter((item)=>!comparisonUsed || isElectricityKnowledge(item));
    const structuredTariffs=await findTariffs(text,{company:userContext.company,limit:20,type:'electricity'});
    const calculation=estimateUsed?await buildCalculationContext(text,structuredTariffs,userContext):null;
    const comparison=comparisonUsed?await buildComparisonContext(text,userContext):null;
    const recommendation=recommendationUsed?await buildRecommendationContext(text,userContext):null;

    const structuredContext=structuredTariffs.map(t=>({
      id:t.id,company:t.company,name:t.name,type:t.type,category:t.category,planCode:t.planCode,
      flatEnergyPrice:t.flatEnergyPrice,energyPrices:t.energyPrices,powerPrices:t.powerPrices,
      powerPriceUnit:t.powerPriceUnit,permanence:t.permanence,segment:t.segment,maxPowerKw:t.maxPowerKw,
      region:t.region,requiresVerification:t.requiresVerification,source:t.source
    }));

    const combinedKnowledge=[
      ...knowledgeContext.map(x=>({...x,knowledgeType:'text'})),
      ...structuredContext.map(x=>({
        id:x.id,company:x.company,section:'structured_tariff',source:typeof x.source==='string'?x.source:JSON.stringify(x.source),
        text:JSON.stringify(x),requiresVerification:x.requiresVerification,knowledgeType:'structured'
      }))
    ];

    const dedupedKnowledge=[];
    const seenSource=new Set();
    for(const item of combinedKnowledge){
      const key=`${item.id}|${item.knowledgeType}`;
      if(seenSource.has(key))continue;
      seenSource.add(key);
      dedupedKnowledge.push(item);
      if(dedupedKnowledge.length>=14)break;
    }

    const data=await generateAnswer({
      message:text,
      userContext,
      knowledgeContext:dedupedKnowledge,
      toolContext:{calculation,comparison,recommendation}
    });

    return res.json({
      success:true,
      engine:'LuzIA Engine',
      version:'0.9.2',
      knowledgeUsed:dedupedKnowledge.length>0,
      calculationUsed:Boolean(calculation),
      comparisonUsed,
      recommendationUsed,
      sources:dedupedKnowledge.map(x=>({id:x.id,source:x.source,company:x.company,section:x.section,knowledgeType:x.knowledgeType,requiresVerification:x.requiresVerification})),
      data
    });
  }catch(error){next(error);}
}

async function buildRecommendationContext(text,userContext){
  const kwh=extractKwh(text) ?? parseNumber(userContext.consumptionKwh) ?? null;
  const powerKw=parseNumber(userContext.powerKw)??extractKw(text)??null;
  const days=parseNumber(userContext.days)??extractDays(text);
  const noPermanence=Boolean(userContext.noPermanence) || /(sin permanencia|sin.*permanencia|no.*permanencia)/i.test(text);
  const renewable=Boolean(userContext.renewable) || /(renovable|energia verde|energ[ií]a verde|solar)/i.test(text);
  const schedule=userContext.schedule??userContext.consumptionPattern??( /(noche|nocturno)/i.test(text)?'noche':'' );
  const customerType=userContext.customerType??userContext.type??'hogar';
  const company=userContext.company??detectCompany(text);
  return recommendTariffs({ consumptionKwh:kwh, powerKw, days, noPermanence, renewable, schedule, customerType, company }, {limit:5, query:text});
}

async function buildCalculationContext(text,tariffs,userContext){
  const kwh=extractKwh(text);
  const powerKw=parseNumber(userContext.powerKw)??extractKw(text)??null;
  const days=parseNumber(userContext.days)??extractDays(text);
  const company=userContext.company??detectCompany(text);
  const tariff=detectTariff(text,tariffs,company);
  if(!tariff)return{status:'needs_tariff_selection',inputs:{kwh,powerKw,days,company},candidates:tariffs.slice(0,5).map(t=>({id:t.id,company:t.company,name:t.name,flatEnergyPrice:t.flatEnergyPrice}))};
  if(kwh===null)return null;
  const estimate=await estimateTariffById(tariff.id,{kwh,powerKw:powerKw??0,days,includePower:powerKw!==null,useDiscountedPrices:userContext.useDiscountedPrices??true});
  return{status:'calculated',request:{kwh,powerKw,days,company,tariffId:tariff.id},result:estimate};
}

async function buildComparisonContext(text,userContext){
  const kwh=extractKwh(text);
  const powerKw=parseNumber(userContext.powerKw)??extractKw(text)??null;
  const days=parseNumber(userContext.days)??extractDays(text);
  const company=userContext.company??detectCompany(text);
  const requireNoPermanence=/(sin permanencia|sin.*permanencia|no.*permanencia)/i.test(text);
  return compareTariffs({query:text,company,kwh,powerKw,powerKwP1:userContext.powerKwP1,powerKwP2:userContext.powerKwP2,days,limit:6,requireNoPermanence});
}

function detectTariff(text,tariffs,company){
  const lower=text.toLowerCase();
  const exact=tariffs.find(t=>t.name&&lower.includes(t.name.toLowerCase()));
  if(exact)return exact;
  const matches=company?tariffs.filter(t=>t.company?.toLowerCase()===company.toLowerCase()):tariffs;
  return matches.find(t=>t.flatEnergyPrice!=null)??matches[0]??null;
}
