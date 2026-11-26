import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
function pass(name) { checks.push({name, ok:true}); }
function fail(name, detail) { checks.push({name, ok:false, detail}); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

for (const rel of ['index.html','assets/css/style.css','assets/js/main.js','README.md','docs/PRUEBAS-IWE-META-QUEST-3S.md']) {
  if (exists(rel)) pass(`Existe ${rel}`); else fail(`Existe ${rel}`, 'Archivo no encontrado');
}

const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'assets/css/style.css'),'utf8');
const js = fs.readFileSync(path.join(root,'assets/js/main.js'),'utf8');

if (/<!doctype html>/i.test(html) && /<html\b/i.test(html) && /<head\b/i.test(html) && /<body\b/i.test(html)) pass('Estructura HTML básica');
else fail('Estructura HTML básica', 'Falta doctype, html, head o body');

const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
const duplicates = ids.filter((id,i)=>ids.indexOf(id)!==i);
if (!duplicates.length) pass('IDs HTML únicos'); else fail('IDs HTML únicos', `Duplicados: ${[...new Set(duplicates)].join(', ')}`);

const importMap = html.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
if (importMap) {
  try { JSON.parse(importMap[1]); pass('Import map JSON válido'); }
  catch (e) { fail('Import map JSON válido', e.message); }
} else fail('Import map JSON válido', 'No se encontró import map');

const localRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](\.{1,2}\/[^"']+)["']/gi)].map(m=>m[1]);
let missingRefs=[];
for (const ref of localRefs) {
  const clean = decodeURIComponent(ref.split('?')[0].split('#')[0]);
  const target = path.resolve(root, clean);
  if (!target.startsWith(root + path.sep) && target !== root) missingRefs.push(`${ref} (ruta fuera del proyecto)`);
  else if (!fs.existsSync(target)) missingRefs.push(ref);
}
if (!missingRefs.length) pass('Rutas locales HTML válidas'); else fail('Rutas locales HTML válidas', missingRefs.join('; '));

const syntax = spawnSync(process.execPath, ['--input-type=module','--check'], {input:js, encoding:'utf8'});
if (syntax.status === 0) pass('Sintaxis JavaScript ES Module');
else fail('Sintaxis JavaScript ES Module', syntax.stderr || syntax.stdout || `exit ${syntax.status}`);

const requiredTeam = ['Juan Pablo Sánchez García','24200101','Eduardo Zenil Guerrero','25200365'];
const missingTeam = requiredTeam.filter(v=>!html.includes(v));
if (!missingTeam.length) pass('Datos de integrantes'); else fail('Datos de integrantes', `Faltan: ${missingTeam.join(', ')}`);

const pageSlots = [...html.matchAll(/data-result-page=/g)].length;
if (pageSlots === 8) pass('Ocho espacios de expediente'); else fail('Ocho espacios de expediente', `Se encontraron ${pageSlots}`);

const failures = checks.filter(c=>!c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\nResultado: ${checks.length-failures.length}/${checks.length} comprobaciones correctas.`);
if (failures.length) process.exit(1);
