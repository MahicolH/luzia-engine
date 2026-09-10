import { calculateTariffEstimate } from '../calculators/energyCalculator.js';
import { estimateElectricityBill } from '../calculators/billEstimator.js';
import { compareTariffs, findTariffs } from '../services/tariffEngine.js';
import { getStructuredMeta } from '../services/structuredTariffEngine.js';

export async function calculateController(req, res, next) {
  try { return res.json({ success: true, engine: 'LuzIA Engine', version: '0.9.0', data: calculateTariffEstimate(req.body ?? {}) }); } catch (error) { next(error); }
}
export async function compareController(req, res, next) {
  try {
    const b=req.body??{}; const result=await compareTariffs({ query:b.query??'tarifas electricidad', company:b.company, kwh:b.kwh, powerKw:b.powerKw, powerKwP1:b.powerKwP1, powerKwP2:b.powerKwP2, days:b.days??30, limit:b.limit??5, requireNoPermanence:b.requireNoPermanence??false });
    return res.json({ success:true, engine:'LuzIA Engine', version:'0.9.2', data:result });
  } catch(error){ next(error); }
}
export async function catalogController(req,res,next){
  try { const type=req.query.type??'electricity'; const result=await findTariffs(req.query.q??'',{company:req.query.company,type,limit:req.query.limit??20}); const meta=await getStructuredMeta(); return res.json({success:true,engine:'LuzIA Engine',version:'0.9.2',meta,data:result}); } catch(error){ next(error); }
}
export async function estimateController(req,res,next){
  try { const b=req.body??{}; if(!b.tariffId) return res.status(400).json({success:false,error:'El campo "tariffId" es obligatorio.'}); const tariffs=await findTariffs('',{type:'electricity',limit:100}); const tariff=tariffs.find(x=>x.id===b.tariffId); if(!tariff) return res.status(404).json({success:false,error:`No se encontró la tarifa ${b.tariffId}.`}); const result=estimateElectricityBill({tariff,kwh:b.kwh,powerKw:b.powerKw,powerKwP1:b.powerKwP1,powerKwP2:b.powerKwP2,days:b.days,periods:b.periods,useDiscountedPrices:b.useDiscountedPrices,includePower:b.includePower,taxRate:b.taxRate,otherCharges:b.otherCharges}); return res.json({success:true,engine:'LuzIA Engine',version:'0.9.2',data:result}); } catch(error){ next(error); }
}
