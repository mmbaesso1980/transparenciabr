import { spawn } from 'node:child_process';

export function truecallerLookup({ nome }) {
  return new Promise((resolve) => {
    const p = spawn('truecallerpy', ['search', '--name', nome]);
    let out = '';
    p.stdout?.on('data', (d) => {
      out += d;
    });
    p.on('close', () => {
      try {
        const j = JSON.parse(out);
        resolve({ celular: j?.data?.[0]?.phones?.[0]?.e164Format || null });
      } catch {
        resolve({ celular: null });
      }
    });
    p.on('error', () => resolve({ celular: null }));
    setTimeout(() => {
      try {
        p.kill();
      } catch {
        /* ignore */
      }
      resolve({ celular: null });
    }, 15000);
  });
}
