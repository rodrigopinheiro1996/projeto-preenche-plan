// Playwright vive em /opt/node-tools e não resolve via `import` em ESM:
// carrega com createRequire. Usar este helper em todos os testes e2e.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
