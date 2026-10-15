// Teste de fumaça da tela: sobe o site COMPILADO (e2e/servidor.mjs, com os cabeçalhos reais) e usa um navegador de verdade, com a API simulada (e2e/api-simulada.js).
// Roda no CI a cada push e localmente com `npm run test:e2e` (precisa do build antes: `npm run build`).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'pt-BR' },
  webServer: {
    command: 'node e2e/servidor.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
});
