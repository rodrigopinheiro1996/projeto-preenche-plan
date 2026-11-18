import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../helpers/playwright.js';

test('Playwright abre e fecha o Chromium', async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  await pagina.setContent('<p id="x">oi</p>');
  assert.equal(await pagina.textContent('#x'), 'oi');
  await navegador.close();
});
