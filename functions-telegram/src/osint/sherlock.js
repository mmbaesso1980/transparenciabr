import { spawn } from 'node:child_process';

export function sherlockScan({ nome }) {
  return new Promise((resolve) => {
    const p = spawn('sherlock', [nome, '--print-found', '--timeout', '8']);
    let out = '';
    p.stdout?.on('data', (d) => {
      out += d;
    });
    const finish = () => {
      const perfis = out
        .split('\n')
        .filter((l) => l.includes('http'))
        .map((l) => l.trim());
      resolve({ perfis, celular: null });
    };
    p.on('close', finish);
    p.on('error', () => resolve({ perfis: [], celular: null }));
    setTimeout(() => {
      try {
        p.kill();
      } catch {
        /* ignore */
      }
      resolve({ perfis: [], celular: null });
    }, 30000);
  });
}
