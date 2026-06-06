/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { Bot, Plus, Trash2, Database, Brain, X, Loader2, Search, Check, ChevronDown, Table as TableIcon, Pencil } from 'lucide-react'
import api from '../lib/api'
import type { Agent, Connection, KnowledgeBase } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'

export default function AgentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [agents, setAgents] = useState<Agent[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [kbs, setKBs] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('')
  const [description, setDescription] = useState('')
  const [promptTemplate, setPromptTemplate] = useState('You are a helpful data analyst.')
  const [skills, setSkills] = useState<any[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => { fetchAll() }, [projectId])

  const fetchAll = async () => {
    try {
      const [a, c, k] = await Promise.all([
        api.get(`/api/projects/${projectId}/agents`),
        api.get(`/api/projects/${projectId}/connections`),
        api.get(`/api/projects/${projectId}/knowledge-bases`),
      ])
      setAgents(a.data); setConnections(c.data); setKBs(k.data)
    } finally { setLoading(false) }
  }

  const addSkill = (type: string) => setSkills([...skills, { type, connection_id: '', kb_id: '', tables: [], description: '' }])
  const removeSkill = (i: number) => setSkills(skills.filter((_, idx) => idx !== i))
  const updateSkill = (i: number, f: string, v: any) => setSkills(skills.map((s, idx) => idx === i ? { ...s, [f]: v } : s))
  const updateConnection = (i: number, connId: string) => setSkills(skills.map((s, idx) => idx === i ? { ...s, connection_id: connId, tables: [] } : s))

  const resetForm = () => {
    setEditingAgentId(null)
    setAgentName(''); setDescription(''); setSkills([])
    setPromptTemplate('You are a helpful data analyst.')
    setShowCreate(false)
  }

  const startEdit = (agent: Agent) => {
    setEditingAgentId(agent._id)
    setAgentName(agent.name)
    setDescription(agent.description || '')
    setPromptTemplate(agent.prompt_template || 'You are a helpful data analyst.')
    setSkills((agent.skills || []).map(s => ({
      type: s.type,
      connection_id: s.connection_id || '',
      kb_id: s.kb_id || '',
      tables: s.tables || [],
      description: s.description || '',
    })))
    setShowCreate(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true)
    try {
      if (editingAgentId) {
        await api.put(`/api/projects/${projectId}/agents/${editingAgentId}`, {
          description, prompt_template: promptTemplate, skills,
        })
      } else {
        await api.post(`/api/projects/${projectId}/agents`, {
          name: agentName, description, prompt_template: promptTemplate, skills,
        })
      }
      resetForm(); fetchAll()
    } catch (err: any) {
      setToast({ message: err.response?.data?.detail || `Failed to ${editingAgentId ? 'update' : 'create'} agent`, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally { setCreating(false) }
  }

  const handleDeleteClick = (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation()
    setDeleteTarget(agent)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/agents/${deleteTarget._id}`)
      fetchAll()
    } catch { /* ignore */ }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-5xl mx-auto animate-[fade-in_0.5s_ease-out]">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slide-up_0.3s_ease-out] ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <Bot className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>AI Agents</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Create agents that query your data sources.</p>
          </div>
        </div>
        <button onClick={() => showCreate ? resetForm() : setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20 active:scale-95 shrink-0">
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {editingAgentId ? `Edit Agent — ${agentName}` : 'New Agent'}
            </h2>
            <button type="button" onClick={resetForm} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Agent name" required disabled={!!editingAgentId} className="px-4 py-2.5 rounded-lg border text-sm outline-none disabled:opacity-60" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="px-4 py-2.5 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <textarea value={promptTemplate} onChange={e => setPromptTemplate(e.target.value)} rows={2} placeholder="System prompt" className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />

          <div className="flex gap-2">
            <button type="button" onClick={() => addSkill('text2sql')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}><Database className="w-3 h-3" /> + SQL Skill</button>
            <button type="button" onClick={() => addSkill('knowledge_base')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}><Brain className="w-3 h-3" /> + KB Skill</button>
          </div>

          {skills.map((skill, i) => {
            const selectedConn = connections.find(c => c._id === skill.connection_id)
            return (
              <div key={i} className="p-3 rounded-lg space-y-2.5" style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2">
                  {skill.type === 'text2sql'
                    ? <Database className="w-4 h-4 text-[#0f3460] shrink-0" />
                    : <Brain className="w-4 h-4 text-[#8b5cf6] shrink-0" />}
                  {skill.type === 'text2sql' ? (
                    <ConnectionPicker
                      value={skill.connection_id}
                      connections={connections}
                      onChange={(id) => updateConnection(i, id)}
                    />
                  ) : (
                    <KbPicker
                      value={skill.kb_id}
                      kbs={kbs}
                      onChange={(id) => updateSkill(i, 'kb_id', id)}
                    />
                  )}
                  <button type="button" onClick={() => removeSkill(i)} className="text-red-400 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                </div>

                {skill.type === 'text2sql' && selectedConn && (
                  <TableMultiSelect
                    tables={selectedConn.tables || []}
                    selected={skill.tables || []}
                    onChange={(tables) => updateSkill(i, 'tables', tables)}
                  />
                )}
              </div>
            )
          })}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={creating} className="px-5 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {creating ? (editingAgentId ? 'Saving...' : 'Creating...') : (editingAgentId ? 'Save Changes' : 'Create Agent')}
            </button>
          </div>
        </form>
      )}

      {agents.length === 0 ? (
        <div className="card p-16 text-center">
          <Bot className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No agents</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create an agent to start chatting.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent._id} className="card p-5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#e94560]/10 flex items-center justify-center"><Bot className="w-5 h-5 text-[#e94560]" /></div>
                <div className="flex items-center gap-1 transition-all">
                  <button onClick={() => startEdit(agent)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-[var(--text-secondary)] transition-all">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => handleDeleteClick(e, agent)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-[var(--text-secondary)] transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{agent.description || 'No description'}</p>
              <div className="flex gap-1 mt-3">
                {agent.skills?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: s.type === 'text2sql' ? 'rgba(15,52,96,0.15)' : 'rgba(139,92,246,0.15)', color: s.type === 'text2sql' ? '#0f3460' : '#8b5cf6' }}>
                    {s.type === 'text2sql' ? 'SQL' : 'KB'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Agent"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? You will not be able to use this agent anymore.`}
        confirmText="Delete Agent"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}

// ── Reusable pickers ──────────────────────────────────────────────────

/** Floating menu rendered into <body> via portal. Anchored to a trigger ref,
 *  re-positioned on scroll/resize, closes on outside click. */
function PortalMenu({
  triggerRef, open, onClose, children, width,
}: {
  triggerRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: number  // override; defaults to trigger width
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number, left: number, width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const t = triggerRef.current
      if (!t) return
      const r = t.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: width ?? r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, triggerRef, width])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, triggerRef])

  if (!open || !pos) return null
  return createPortal(
    <div ref={menuRef}
      className="fixed rounded-lg border shadow-2xl animate-[fade-in_0.15s_ease-out]"
      style={{
        top: pos.top, left: pos.left, width: pos.width,
        background: 'var(--bg-card)', borderColor: 'var(--border-color)',
        zIndex: 9999,
      }}>
      {children}
    </div>,
    document.body,
  )
}

function ConnectionPicker({ value, connections, onChange }: { value: string, connections: Connection[], onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = connections.find(c => c._id === value)

  return (
    <div className="flex-1 min-w-0">
      <button ref={triggerRef} type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm outline-none hover:border-[#e94560]/50 transition-colors"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
        <span className="flex items-center gap-2 min-w-0">
          <Database className="w-3.5 h-3.5 text-[#0f3460] shrink-0" />
          {selected ? (
            <>
              <span className="truncate">{selected.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                {selected.engine}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Select a data source...</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>

      <PortalMenu triggerRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <div className="max-h-64 overflow-y-auto py-1">
          {connections.length === 0 ? (
            <div className="px-3 py-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              No data sources yet. Add one in Connections.
            </div>
          ) : connections.map(c => (
            <button key={c._id} type="button" onClick={() => { onChange(c._id); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors ${value === c._id ? 'bg-[#e94560]/10' : ''}`}
              style={{ color: 'var(--text-primary)' }}>
              <span className="flex items-center gap-2 min-w-0">
                <Database className="w-3.5 h-3.5 text-[#0f3460] shrink-0" />
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                  {c.engine}
                </span>
              </span>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                {c.tables?.length || 0} tables
              </span>
            </button>
          ))}
        </div>
      </PortalMenu>
    </div>
  )
}

function KbPicker({ value, kbs, onChange }: { value: string, kbs: KnowledgeBase[], onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = kbs.find(k => k._id === value)

  return (
    <div className="flex-1 min-w-0">
      <button ref={triggerRef} type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm outline-none hover:border-[#e94560]/50 transition-colors"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
        <span className="flex items-center gap-2 min-w-0">
          <Brain className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />
          {selected
            ? <span className="truncate">{selected.name}</span>
            : <span style={{ color: 'var(--text-muted)' }}>Select a knowledge base...</span>}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>

      <PortalMenu triggerRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <div className="max-h-64 overflow-y-auto py-1">
          {kbs.length === 0 ? (
            <div className="px-3 py-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              No knowledge bases yet.
            </div>
          ) : kbs.map(k => (
            <button key={k._id} type="button" onClick={() => { onChange(k._id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors ${value === k._id ? 'bg-[#e94560]/10' : ''}`}
              style={{ color: 'var(--text-primary)' }}>
              <Brain className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />
              <span className="truncate font-medium">{k.name}</span>
            </button>
          ))}
        </div>
      </PortalMenu>
    </div>
  )
}

function TableMultiSelect({ tables, selected, onChange }: { tables: string[], selected: string[], onChange: (tables: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const allSelected = selected.length === 0
  const filtered = tables.filter(t => t.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t])

  return (
    <div className="ml-6">
      <div className="flex items-center gap-2 flex-wrap">
        <button ref={triggerRef} type="button" onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border hover:border-[#e94560]/50 transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
          <TableIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          {allSelected
            ? <span>All tables</span>
            : <span><span className="font-semibold">{selected.length}</span> of {tables.length} tables</span>}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
        </button>

        {!allSelected && selected.slice(0, 4).map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            {t}
            <button type="button" onClick={() => toggle(t)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
        {selected.length > 4 && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>+{selected.length - 4} more</span>
        )}
      </div>

      <PortalMenu triggerRef={triggerRef} open={open} onClose={() => setOpen(false)} width={288}>
        <div className="p-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Search tables..." autoFocus
              className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs outline-none"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 border-b text-[11px]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
          <button type="button" onClick={() => onChange([])} className="hover:text-[#e94560]">All tables (default)</button>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange([...tables])} className="hover:text-[#e94560]">Select all</button>
            <button type="button" onClick={() => onChange([])} className="hover:text-[#e94560]">Clear</button>
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto">
          {tables.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No tables found. Refresh the connection.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No matches for "{filter}".
            </div>
          ) : filtered.map(t => {
            const isOn = selected.includes(t)
            return (
              <button key={t} type="button" onClick={() => toggle(t)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5 transition-colors"
                style={{ color: 'var(--text-primary)' }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isOn ? 'bg-[#e94560] border-[#e94560]' : ''}`}
                  style={{ borderColor: isOn ? '#e94560' : 'var(--border-color)' }}>
                  {isOn && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <TableIcon className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="truncate">{t}</span>
              </button>
            )
          })}
        </div>
      </PortalMenu>
    </div>
  )
}
