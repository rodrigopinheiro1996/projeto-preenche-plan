// Empacota um módulo de src/ direto com esbuild (IIFE) para injetar na página de teste; não depende do build final.
import { build } from 'esbuild';

export async function empacotar(entrada, globalName) {
  const r = await build({
    entryPoints: [entrada], bundle: true, format: 'iife', globalName, write: false, platform: 'browser', target: 'es2022',
  });
  return r.outputFiles[0].text;
}
