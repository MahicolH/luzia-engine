import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) {
  console.error('Uso: npm run knowledge:import -- "ruta/al/archivo.xlsx"');
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), input);
const workbook = XLSX.readFile(inputPath, { cellDates: true });

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\r\n/g, '\n').trim();
  return text || null;
}

function sectionFromHeading(text) {
  const upper = text.toUpperCase();
  if (upper.includes('MANTENIMIENTOS GAS') || upper.includes('MANTENIMIENTO GAS')) return 'mantenimiento_gas';
  if (upper.includes('MANTENIMIENTOS LUZ SOLAR') || upper.includes('MANTENIMIENTO LUZ SOLAR')) return 'mantenimiento_solar';
  if (upper.includes('MANTENIMIENTOS LUZ') || upper.includes('MANTENIMIENTO LUZ')) return 'mantenimiento_electricidad';
  if (upper.includes('TARIFAS LUZ SOLAR')) return 'electricidad_solar';
  if (upper.includes('TARIFAS LUZ')) return 'electricidad';
  if (upper.includes('TARIFAS GAS')) return 'gas';
  if (upper.includes('CERTIFICADO DE ENERGIA RENOVABLE') || upper.includes('SERVICIO ENERGIA RENOVABLE')) return 'servicio_energia';
  return null;
}

const records = [];
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  let currentSection = 'general';

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const values = row.map(clean);
    const nonEmpty = values.filter(Boolean);
    if (!nonEmpty.length) return;

    const text = nonEmpty.join(' | ');
    const headingSection = sectionFromHeading(text);
    if (headingSection) currentSection = headingSection;

    const upper = text.toUpperCase();
    const isHeader = rowNumber <= 1 || upper.startsWith('PLAN /OFERTA') || upper.startsWith('SERVICIOS MANTEN') || upper.startsWith('TARIFA |') || upper.startsWith('TERMINO FIJO |');

    records.push({
      id: `${sheetName.toLowerCase()}-r${rowNumber}`,
      company: sheetName === 'GANA' ? 'Gana Energía' : sheetName.charAt(0) + sheetName.slice(1).toLowerCase(),
      section: currentSection,
      sheet: sheetName,
      row: rowNumber,
      text,
      isHeader,
      requiresVerification: ['VERIFICAR DIARIAMENTE', 'PRECIO DE MERCADO', 'A PRECIO DE COSTE', 'SE DEBE VERIFICAR DIARIAMENTE'].some((term) => upper.includes(term)),
      columns: Object.fromEntries(values.map((v, i) => [i + 1, v]).filter(([, v]) => v !== null).map(([i, v]) => [`col_${i}`, v]))
    });
  });
}

const output = {
  knowledgeVersion: '0.3.0',
  source: {
    file: path.basename(inputPath),
    period: path.basename(inputPath).toUpperCase().includes('AGOSTO') ? 'Agosto (según nombre del archivo)' : null,
    year: null,
    currency: 'EUR',
    country: 'España',
    scope: 'Tarifas de electricidad, gas, mantenimiento y servicios energéticos disponibles en el documento.',
    warning: 'Los datos reflejan el archivo importado. Las tarifas marcadas como de mercado o de verificación diaria no deben tratarse como precios actuales sin una fuente actualizada.'
  },
  records
};

const outputPath = path.join(projectRoot, 'knowledge', 'energy-knowledge.json');
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`Conocimiento generado: ${outputPath}`);
console.log(`Hojas procesadas: ${workbook.SheetNames.length}`);
console.log(`Registros: ${records.length}`);
