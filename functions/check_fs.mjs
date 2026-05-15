import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: cert('/tmp/firebase-sa.json') });
const db = getFirestore();
const snap = await db.collection('transparency_reports').get();
let empty = 0, withNome = 0;
snap.forEach(d => {
  const data = d.data();
  if (data.nome || data.nome_completo) withNome++;
  else empty++;
});
console.log(`Total docs: ${snap.size} | With nome: ${withNome} | Empty/no nome: ${empty}`);
process.exit(0);
