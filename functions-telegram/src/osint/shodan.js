import axios from 'axios';
import { getSecret } from '../utils/secrets.js';

export async function shodanLookup({ nome, cpf }) {
  const key = await getSecret('SHODAN_API_KEY');
  if (!key || key === 'PLACEHOLDER_RECONFIGURE') return { celular: null };
  const query = encodeURIComponent(`"${nome}" "${cpf}"`);
  const url = `https://api.shodan.io/shodan/host/search?key=${key}&query=${query}`;
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const blob = JSON.stringify(data?.matches || []);
    const m = blob.match(/\(\d{2}\)\s?9?\d{4}-?\d{4}/);
    return { celular: m?.[0] || null, raw: data?.total };
  } catch {
    return { celular: null };
  }
}
