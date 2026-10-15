// Starts the Vite dev server, compiles the Electron main/preload once and launches Electron.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];

const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.electron.json'], {
  stdio: 'inherit',
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
