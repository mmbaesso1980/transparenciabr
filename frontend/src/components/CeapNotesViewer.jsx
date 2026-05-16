/**
 * CeapNotesViewer.jsx — Exibidor de notas CEAP clicáveis
 * 
 * Features:
 * - Lista paginada de notas
 * - Flags de risco visuais
 * - Links diretos para recibos (url_documento)
 * - Busca e filtro por tipo de despesa
 * - Exportação CSV
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Download, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function CeapNotesViewer({ parlamentarId, parlamentarNome }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('');
  const [creditsRemaining, setCreditsRemaining] = useState(0);

  // Buscar resumo (gratuito)
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const getCeapSummary = httpsCallable(functions, 'getCeapSummary');
        const result = await getCeapSummary({ parlamentar_id: parlamentarId });
        setSummary(result.data.data);
      } catch (error) {
        console.error('Erro ao buscar resumo:', error);
      }
    };

    if (parlamentarId) fetchSummary();
  }, [parlamentarId]);

  // Buscar notas (custa 100 créditos)
  const fetchNotes = async (offset = 0) => {
    setLoading(true);
    try {
      const getCeapNotes = httpsCallable(functions, 'getCeapNotes');
      const result = await getCeapNotes({
        parlamentar_id: parlamentarId,
        limit: 50,
        offset,
      });

      setNotes(result.data.data);
      setPagination(result.data.pagination);
      setCreditsRemaining(result.data.credits_remaining);

      toast.success(`${result.data.data.length} notas carregadas`);
    } catch (error) {
      console.error('Erro ao buscar notas:', error);
      toast.error(error.message || 'Erro ao carregar notas');
    } finally {
      setLoading(false);
    }
  };

  // Renderizar badge de risco
  const getRiskBadge = (note) => {
    const riskLevel = note.flag_valor || 'BAIXO';
    const colors = {
      ALTO: 'bg-red-100 text-red-800',
      MEDIO: 'bg-yellow-100 text-yellow-800',
      BAIXO: 'bg-green-100 text-green-800',
    };

    return (
      <Badge className={colors[riskLevel]}>
        {riskLevel}
      </Badge>
    );
  };

  // Formatar moeda
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Formatar data
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  // Exportar CSV
  const exportCSV = () => {
    const headers = ['Data', 'Tipo', 'Fornecedor', 'CNPJ', 'Valor', 'Risco'];
    const rows = notes.map((note) => [
      formatDate(note.data_emissao),
      note.tipo_despesa,
      note.fornecedor,
      note.cnpj_cpf_fornecedor,
      note.valor_liquido,
      note.flag_valor,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceap_${parlamentarId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Notas CEAP — {parlamentarNome}</h2>
          <p className="text-sm text-gray-600 mt-1">
            Clique em qualquer nota para ver o recibo original
          </p>
        </div>
        <Button onClick={exportCSV} disabled={notes.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Resumo (gratuito) */}
      {summary && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total de Notas</p>
              <p className="text-2xl font-bold">{summary.total_notas}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Valor Total</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.valor_total)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Valor Médio</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.valor_medio)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Tipo Mais Comum</p>
              <p className="text-lg font-semibold">{summary.tipo_despesa_mais_comum}</p>
            </div>
          </div>
        </Card>
      )}

      {/* CTA para carregar notas */}
      {notes.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-600" />
          <h3 className="text-lg font-semibold mb-2">Carregar Notas CEAP Completas</h3>
          <p className="text-gray-600 mb-4">
            Clique abaixo para acessar a lista completa de notas CEAP com links para recibos originais.
          </p>
          <p className="text-sm font-semibold text-blue-600 mb-4">Custo: 100 créditos</p>
          <Button
            onClick={() => fetchNotes(0)}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Carregando...' : 'Carregar Notas (100 cr)'}
          </Button>
          {creditsRemaining > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Créditos restantes: {creditsRemaining}
            </p>
          )}
        </Card>
      )}

      {/* Tabela de notas */}
      {notes.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Data</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Fornecedor</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-center">Risco</th>
                  <th className="px-4 py-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{formatDate(note.data_emissao)}</td>
                    <td className="px-4 py-3 text-xs">{note.tipo_despesa}</td>
                    <td className="px-4 py-3 text-xs">{note.fornecedor}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(note.valor_liquido)}
                    </td>
                    <td className="px-4 py-3 text-center">{getRiskBadge(note)}</td>
                    <td className="px-4 py-3 text-center">
                      {note.url_documento && (
                        <a
                          href={note.url_documento}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Mostrando {pagination.offset + 1} a{' '}
              {Math.min(pagination.offset + pagination.limit, pagination.total)} de{' '}
              {pagination.total} notas
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => fetchNotes(Math.max(0, pagination.offset - pagination.limit))}
                disabled={pagination.offset === 0 || loading}
                variant="outline"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => fetchNotes(pagination.offset + pagination.limit)}
                disabled={!pagination.hasMore || loading}
                variant="outline"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
