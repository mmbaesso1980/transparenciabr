// src/pages/AdminCronjobs.jsx
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export default function AdminCronjobs() {
  const [execucoes, setExecucoes] = useState([]);

  useEffect(() => {
    (async () => {
      const q = query(
        collection(db, 'admin_cronjobs'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      setExecucoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  const statusIcon = (s) =>
    s === 'SUCESSO' ? '✅' : s === 'ERRO' ? '❌' : '🟡';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Status dos Cronjobs</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Job</th>
            <th className="text-left py-2">Quando</th>
            <th className="text-left py-2">Duração</th>
            <th className="text-left py-2">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {execucoes.map((e) => (
            <tr key={e.id} className="border-b">
              <td>{statusIcon(e.status)}</td>
              <td className="font-mono">{e.nome}</td>
              <td>{e.timestamp?.toDate().toLocaleString('pt-BR')}</td>
              <td>{e.detalhes?.elapsed ? `${e.detalhes.elapsed}s` : '—'}</td>
              <td className="text-xs">{JSON.stringify(e.detalhes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
