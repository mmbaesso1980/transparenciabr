import React, { useRef, useEffect, useState, useCallback } from 'react';
import ForensicPanel from './ForensicPanel';

export default function Galaxy3D() {
  const fgRef = useRef();

  const [data, setData] = useState({ nodes: [], links: [] });
  const [statusMsg, setStatusMsg] = useState('Buscando telemetria forense...');
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [ForceGraph3D, setForceGraph3D] = useState(null);

  const isPremium = false;

  useEffect(() => {
    import('react-force-graph-3d').then(mod => {
      setForceGraph3D(() => mod.default);
    }).catch(e => {
        console.error(e)
    });
  }, [])

  useEffect(() => {
    async function hydrateGraph() {
      try {
        setLoading(true);
        setStatusMsg('Conectado à Cloud (us-central1). Mapeando rede...');
        // Mocking the call since we don't have the backend running to hit firebase functions
        setTimeout(() => {
            const mockNodes = [
                {id: 1, name: "Deputado A", partido: "XYZ", value: 500000, score_risco: 8.5},
                {id: 2, name: "Empresa Fantasma B", partido: null, value: 250000, score_risco: 9.2},
                {id: 3, name: "Assessor C", partido: "XYZ", value: 50000, score_risco: 4.1},
                {id: 4, name: "Deputado D", partido: "ABC", value: 100000, score_risco: 2.1},
            ];
            const mockLinks = [
                {source: 1, target: 2, value: 100000, score_risco: 8.5},
                {source: 1, target: 3, value: 20000, score_risco: 4.1},
            ];
            setData({ nodes: mockNodes, links: mockLinks });
            setStatusMsg('');
            setLoading(false);
        }, 1000);
      } catch (error) {
         console.error('Erro na conexão do Radar:', error);
         setStatusMsg('Erro de conectividade com o Backend (us-central1).');
         setLoading(false);
      }
    }

    hydrateGraph();
  }, []);

  // ⚡ Bolt: Wrap callback in useCallback to prevent recreating function reference on every render.
  // Impact: Prevents heavy ForceGraph3D WebGL component from re-rendering unnecessarily.
  const handleNodeClick = useCallback((node) => {
    if (node && node.id) setSelectedNode(node);
  }, []);

  return (
    <div className="w-full h-full bg-slate-900 relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 text-white bg-slate-800/80 p-4 rounded shadow">
        <h3 className="font-cabinet font-bold text-lg">Asmodeus v2.0 - Radar</h3>

        {loading || statusMsg ? (
           <div className="mt-2 text-sm font-satoshi text-amber-300 font-bold border border-amber-500/50 bg-amber-500/10 p-2 rounded">
              {statusMsg}
           </div>
        ) : (
           <p className="text-sm font-satoshi text-slate-300 max-w-xs mt-2">
             Radar operante. Linhas vermelhas indicarão Triangulação de Culpa (processos judiciais associados a emendas).
           </p>
        )}
      </div>
      {ForceGraph3D && (
          <ForceGraph3D
            ref={fgRef}
            graphData={data}
            nodeId="id"
            nodeLabel="name"
            nodeAutoColorBy="id"
            nodeVal={(node) => Math.sqrt(node.value || 0) / 100}
            linkWidth={(link) => link.value || 1}
            linkColor={(link) => (link.score_risco && link.score_risco > 7.5 ? '#ef4444' : '#cbd5e1')}
            linkDirectionalParticles={(link) => (link.score_risco && link.score_risco > 7.5 ? 4 : 0)}
            linkDirectionalParticleSpeed={0.01}
            onNodeClick={handleNodeClick}
            backgroundColor="#0f172a"
            showNavInfo={false}
          />
      )}

      {selectedNode && (
        <ForensicPanel
          node={selectedNode}
          isPremium={isPremium}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
