/**
 * UniversoPage.jsx — Página Universo com grafo 3D
 * 
 * Features:
 * - Grafo 3D de parlamentares
 * - Empresas/pessoas comuns entre parlamentares
 * - Clique em nó → abre detalhes
 * - Filtros: por partido, por tipo de conexão
 * - On-demand com créditos
 */

import React, { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Network, Filter, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

// Importar ForceGraph3D dinamicamente
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
});

export default function UniversoPage() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filters, setFilters] = useState({
    partido: '',
    tipoConexao: 'todos',
  });
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const graphRef = useRef();

  // Buscar grafo de conexões
  const fetchGraph = async () => {
    setLoading(true);
    try {
      const getUniversoGraph = httpsCallable(functions, 'getUniversoGraph');
      const result = await getUniversoGraph({
        filtro_partido: filters.partido || undefined,
        filtro_tipo_conexao: filters.tipoConexao === 'todos' ? undefined : filters.tipoConexao,
      });

      setGraphData(result.data.graph);
      setCreditsRemaining(result.data.credits_remaining);
      toast.success(`Grafo carregado: ${result.data.graph.nodes.length} nós`);
    } catch (error) {
      console.error('Erro ao buscar grafo:', error);
      toast.error(error.message || 'Erro ao carregar grafo');
    } finally {
      setLoading(false);
    }
  };

  // Renderizar nó
  const nodeCanvasObject = (node, ctx) => {
    const label = node.id;
    const size = node.size || 5;

    // Cor baseada no tipo
    let color = '#3b82f6'; // azul padrão
    if (node.type === 'parlamentar') color = '#ef4444'; // vermelho
    if (node.type === 'empresa') color = '#10b981'; // verde
    if (node.type === 'pessoa') color = '#f59e0b'; // laranja

    // Desenhar nó
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fill();

    // Desenhar label
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, node.x, node.y + size + 15);
  };

  // Renderizar link
  const linkCanvasObject = (link, ctx) => {
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // Renderizar detalhes do nó selecionado
  const renderNodeDetails = () => {
    if (!selectedNode) return null;

    return (
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">{selectedNode.id}</h3>
            <Badge className="mt-2">
              {selectedNode.type === 'parlamentar'
                ? '👤 Parlamentar'
                : selectedNode.type === 'empresa'
                  ? '🏢 Empresa'
                  : '👥 Pessoa'}
            </Badge>
          </div>

          {selectedNode.type === 'parlamentar' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Partido</p>
                <p className="font-semibold">{selectedNode.partido}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">UF</p>
                <p className="font-semibold">{selectedNode.uf}</p>
              </div>
            </div>
          )}

          {selectedNode.type === 'empresa' && (
            <div>
              <p className="text-sm text-gray-600">CNPJ</p>
              <p className="font-semibold">{selectedNode.cnpj}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-600 mb-2">Conexões</p>
            <div className="flex flex-wrap gap-2">
              {graphData.links
                .filter((link) => link.source.id === selectedNode.id || link.target.id === selectedNode.id)
                .map((link, idx) => {
                  const outro = link.source.id === selectedNode.id ? link.target : link.source;
                  return (
                    <Badge key={idx} variant="outline">
                      {outro.id}
                    </Badge>
                  );
                })}
            </div>
          </div>

          <Button
            onClick={() => {
              if (selectedNode.type === 'parlamentar') {
                window.location.href = `/politico/${selectedNode.id}`;
              }
            }}
            className="w-full"
            disabled={selectedNode.type !== 'parlamentar'}
          >
            Ver Dossier
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Universo</h1>
          <p className="text-gray-300">
            Explore as conexões entre parlamentares, empresas e pessoas
          </p>
        </div>

        {/* Filtros */}
        <Card className="p-6 mb-6 bg-slate-800 border-slate-700">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-semibold text-gray-300 block mb-2">
                Filtrar por Partido
              </label>
              <input
                type="text"
                placeholder="Ex: PT, PL, PSDB..."
                value={filters.partido}
                onChange={(e) => setFilters({ ...filters, partido: e.target.value })}
                className="w-full px-4 py-2 rounded bg-slate-700 text-white border border-slate-600"
              />
            </div>

            <div className="flex-1">
              <label className="text-sm font-semibold text-gray-300 block mb-2">
                Tipo de Conexão
              </label>
              <select
                value={filters.tipoConexao}
                onChange={(e) => setFilters({ ...filters, tipoConexao: e.target.value })}
                className="w-full px-4 py-2 rounded bg-slate-700 text-white border border-slate-600"
              >
                <option value="todos">Todos</option>
                <option value="empresa_comum">Empresa Comum</option>
                <option value="pessoa_comum">Pessoa Comum</option>
                <option value="fornecedor">Fornecedor</option>
              </select>
            </div>

            <Button
              onClick={fetchGraph}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Filter className="w-4 h-4 mr-2" />
              {loading ? 'Carregando...' : 'Carregar Grafo'}
            </Button>
          </div>
        </Card>

        {/* CTA para carregar */}
        {graphData.nodes.length === 0 && !loading && (
          <Card className="p-8 text-center bg-slate-800 border-slate-700 mb-6">
            <Network className="w-12 h-12 mx-auto mb-4 text-blue-400" />
            <h3 className="text-lg font-semibold text-white mb-2">
              Explorar Grafo de Conexões
            </h3>
            <p className="text-gray-300 mb-4">
              Descubra as conexões entre parlamentares, empresas e pessoas
            </p>
            <p className="text-sm font-semibold text-blue-400 mb-4">Custo: 200 créditos</p>
            <Button
              onClick={fetchGraph}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Carregar Grafo (200 cr)
            </Button>
          </Card>
        )}

        {/* Grafo 3D */}
        {graphData.nodes.length > 0 && (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <Card className="p-4 bg-slate-800 border-slate-700 h-96">
                <ForceGraph3D
                  ref={graphRef}
                  graphData={graphData}
                  nodeCanvasObject={nodeCanvasObject}
                  linkCanvasObject={linkCanvasObject}
                  onNodeClick={(node) => setSelectedNode(node)}
                  nodeRelSize={6}
                  linkWidth={1}
                  linkOpacity={0.2}
                  backgroundColor="#1e293b"
                  width={800}
                  height={400}
                />
              </Card>

              <div className="mt-4 flex gap-2 justify-center">
                <Button
                  onClick={() => graphRef.current?.zoomToFit(400)}
                  variant="outline"
                  className="bg-slate-700 border-slate-600"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Detalhes do nó */}
            <div>{renderNodeDetails()}</div>
          </div>
        )}

        {/* Legenda */}
        {graphData.nodes.length > 0 && (
          <Card className="p-6 mt-6 bg-slate-800 border-slate-700">
            <h3 className="font-semibold text-white mb-4">Legenda</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                <span className="text-gray-300">Parlamentar</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                <span className="text-gray-300">Empresa</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                <span className="text-gray-300">Pessoa</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
