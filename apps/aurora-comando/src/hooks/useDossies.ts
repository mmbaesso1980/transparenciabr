import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export type DossieStatus = 'queued' | 'running' | 'reviewing' | 'done' | 'error'
export type Phase = 'ingest' | 'analyze' | 'synthesize' | 'review' | 'publish'

export interface Dossie {
  id: string
  slug: string
  status: DossieStatus
  phase?: Phase
  alvo?: { nome?: string; cpf_mask?: string; partido?: string; cargo?: string }
  pdf_url?: string
  created_at?: any
  updated_at?: any
  review_warnings?: string[]
}

export function useDossies(): { dossies: Dossie[]; loading: boolean } {
  const [dossies, setDossies] = useState<Dossie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'dossies_v1'), orderBy('created_at', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setDossies(snap.docs.map((d) => ({ id: d.id, slug: d.id, ...(d.data() as Omit<Dossie, 'id' | 'slug'>) })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { dossies, loading }
}

export function useDossie(slug: string): { dossie: Dossie | null; loading: boolean } {
  const [dossie, setDossie] = useState<Dossie | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    const unsub = onSnapshot(doc(db, 'dossies_v1', slug), (snap) => {
      setDossie(snap.exists() ? ({ id: snap.id, slug: snap.id, ...(snap.data() as any) }) : null)
      setLoading(false)
    })
    return () => unsub()
  }, [slug])

  return { dossie, loading }
}

export interface AgentDoc {
  id: string
  state: 'idle' | 'working' | 'calling_vertex' | 'done' | 'error'
  progress?: number
  last_msg?: string
}

export function useAgents(slug: string): AgentDoc[] {
  const [agents, setAgents] = useState<AgentDoc[]>([])
  useEffect(() => {
    if (!slug) return
    const unsub = onSnapshot(collection(db, 'dossies_v1', slug, 'agents'), (snap) => {
      setAgents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    })
    return () => unsub()
  }, [slug])
  return agents
}

export interface ReviewerDoc {
  id: string
  state: 'idle' | 'reviewing' | 'approved' | 'warnings' | 'rejected'
  warnings?: any[]
  retries?: number
}

export function useReviewers(slug: string): ReviewerDoc[] {
  const [reviewers, setReviewers] = useState<ReviewerDoc[]>([])
  useEffect(() => {
    if (!slug) return
    const unsub = onSnapshot(collection(db, 'dossies_v1', slug, 'review'), (snap) => {
      setReviewers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    })
    return () => unsub()
  }, [slug])
  return reviewers
}
