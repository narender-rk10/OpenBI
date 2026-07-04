/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Send, Bot, User, Code2, Plus, Sparkles,
  Loader2, Copy, Check, X, Clock,
} from 'lucide-react'
import api from '../lib/api'
import type { Agent, ChatSession, Dashboard } from '../lib/types'
import { useChat } from '../hooks/useChat'
import QueryResultCard from '../components/chat/QueryResultCard'
import AgentPickerDialog from '../components/chat/AgentPickerDialog'
import { useErrorModal } from '../lib/errorModal'

interface MentionOption {
  label: string
  value: string
  description: string
}

const GREETING_RE = /^\s*(hi+|hello+|hey+|howdy|good\s+(morning|afternoon|evening|day)|what'?s\s+up|how\s+are\s+you|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|help\s*m?e?|greetings?|yo+|hiya|sup)\s*[!?.]*\s*$/i

function stripMarkdown(content: string): string {
  return content
    // Fenced code blocks — keep content, remove fences
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    // Inline code — remove backticks
    .replace(/`([^`]+)`/g, '$1')
    // Headers
    .replace(/^#{1,6}\s+/gm, '')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Italic
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    // Markdown table rows and separator lines
    .split('\n')
    .filter(line => !/^\s*\|/.test(line) && !/^\s*[-:]+[-| :]*$/.test(line))
    .join('\n')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Bullet list markers
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    // Numbered list markers
    .replace(/^[ \t]*\d+[.)]\s+/gm, '')
    // Blockquotes
    .replace(/^>\s*/gm, '')
    // Links — keep text, drop URL
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Collapse excess blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [agents, setAgents] = useState<Agent[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [hasInput, setHasInput] = useState(false)  // only for send button enabled state
  const generatingChart: string | null = null  // chart generation now happens inline in useChat
  const [activeDataMsgId, setActiveDataMsgId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [copiedSql, setCopiedSql] = useState<string | null>(null)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({})
  const [summaryLoadingIds, setSummaryLoadingIds] = useState<Set<string>>(new Set())
  const [routing, setRouting] = useState(false)
  const [agentPicker, setAgentPicker] = useState<{ message: string; reason?: string } | null>(null)

  useErrorModal()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)
  const autoChartedIds = useRef(new Set<string>())  // still used for summary dedup
  const processedSummaryIds = useRef(new Set<string>())

  const { messages, isLoading, currentStatus, sessionId, sendMessage, sendMultiMessage, setMessages, clearMessages } = useChat()

  const mentionOptions = useMemo<MentionOption[]>(() => {
    return agents.map(a => ({
      label: `@${a.name}`,
      value: `@${a.name} `,
      description: a.description || 'Data agent',
    }))
  }, [agents])

  const filteredMentions = useMemo(() => {
    if (!mentionFilter) return mentionOptions
    const q = mentionFilter.toLowerCase()
    return mentionOptions.filter(o => o.label.toLowerCase().includes(q))
  }, [mentionOptions, mentionFilter])

  const insertMention = (option: MentionOption) => {
    const cur = inputRef.current?.value ?? ''
    const atIdx = cur.lastIndexOf('@')
    const before = atIdx >= 0 ? cur.slice(0, atIdx) : cur
    const newVal = before + option.value
    if (inputRef.current) inputRef.current.value = newVal
    setHasInput(newVal.trim().length > 0)
    setShowMentions(false)
    setMentionFilter('')
    setMentionIndex(0)
    const mentioned = agents.find(a => `@${a.name} ` === option.value)
    if (mentioned) setSelectedAgentId(mentioned._id)
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (!projectId) return
    // Note: we intentionally do NOT default to the first agent. The active agent
    // is established by an @-mention, by LLM routing, or by an explicit pick.
    Promise.all([
      api.get(`/api/projects/${projectId}/agents`).then(({ data }) => setAgents(data)).catch(() => {}),
      api.get(`/api/projects/${projectId}/chat/sessions`).then(({ data }) => setSessions(data)).catch(() => {}),
    ]).finally(() => setPageLoading(false))
    api.get(`/api/projects/${projectId}/dashboards`).then(({ data }) => setDashboards(data)).catch(() => {})
  }, [projectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!showMentions) return
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setShowMentions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMentions])

  // Auto-generate AI summary per data message
  useEffect(() => {
    messages.forEach(m => {
      if (!m.data?.columns?.length || m.isStreaming || processedSummaryIds.current.has(m.id)) return
      processedSummaryIds.current.add(m.id)
      setSummaryLoadingIds(prev => new Set([...prev, m.id]))
      api.post('/api/llm/summarize', {
        columns: m.data.columns,
        rows: m.data.rows.slice(0, 50),
      }).then(({ data }) => {
        setAiSummaries(prev => ({ ...prev, [m.id]: data.summary || '' }))
      }).catch(() => {})
        .finally(() => {
          setSummaryLoadingIds(prev => { const s = new Set(prev); s.delete(m.id); return s })
        })
    })
  }, [messages])

  // Chart generation is now handled directly in useChat.sendMessage after stream ends.

  const loadSession = async (s: ChatSession) => {
    const { data } = await api.get(`/api/projects/${projectId}/chat/sessions/${s._id}`)
    setActiveSession(data)
    const msgs = data.messages || []
    // Mark historical messages as already processed so they don't get auto-charted/summarized
    msgs.forEach((m: any) => {
      const id = m.id || m._id
      autoChartedIds.current.add(id)
      processedSummaryIds.current.add(id)
    })
    setMessages(msgs)
    setAiSummaries({})
    setSummaryLoadingIds(new Set())

    // For messages with data but no stored chart_config (e.g. created via API),
    // generate chart configs in parallel — UI is immediately responsive, charts appear as they arrive.
    msgs
      .filter((m: any) => m.role === 'assistant' && m.data?.columns?.length > 0 && !m.chart_config)
      .forEach(async (m: any) => {
        const msgId = m.id || m._id
        try {
          const resp = await api.post(
            `/api/projects/${projectId}/chat/sessions/${s._id}/chart`,
            { message_id: msgId }
          )
          if (resp.data?.chart_config) {
            setMessages(prev => prev.map(pm =>
              pm.id === msgId ? { ...pm, chart_config: resp.data.chart_config } : pm
            ))
          }
        } catch { /* chart generation is optional */ }
      })
  }

  const startNew = () => {
    setActiveSession(null)
    clearMessages()
    setSelectedAgentId('')
    setActiveDataMsgId(null)
    setAiSummaries({})
    setSummaryLoadingIds(new Set())
    inputRef.current?.focus()
  }

  /** Dispatch a message to a single resolved agent. */
  const dispatch = async (message: string, agentId: string, routingSource = 'unknown') => {
    setSelectedAgentId(agentId)
    await sendMessage({
      projectId: projectId!,
      agentId,
      message,
      existingSessionId: activeSession?._id || sessionId,
      routingSource,
    })
    api.get(`/api/projects/${projectId}/chat/sessions`).then(({ data }) => setSessions(data)).catch(() => {})
  }

  /** Dispatch a message to multiple agents in parallel — results are consolidated server-side. */
  const dispatchMulti = async (message: string, agentIds: string[]) => {
    setSelectedAgentId(agentIds[0])
    await sendMultiMessage({
      projectId: projectId!,
      agentIds,
      message,
      existingSessionId: activeSession?._id || sessionId,
    })
    api.get(`/api/projects/${projectId}/chat/sessions`).then(({ data }) => setSessions(data)).catch(() => {})
  }

  const clearInput = () => {
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = 'auto'
    }
    setHasInput(false)
  }

  const handleSend = async () => {
    const raw = inputRef.current?.value ?? ''
    if (!raw.trim() || isLoading || routing || agents.length === 0) return
    const msg = raw.trim()

    // 1. Parse ALL @-mentions in the message.
    const allMentionNames = [...msg.matchAll(/@(\S+)/g)].map(m => m[1])
    if (allMentionNames.length > 0) {
      const matched = allMentionNames
        .map(name => agents.find(a => a.name.toLowerCase() === name.toLowerCase()))
        .filter(Boolean) as typeof agents
      const unmatched = allMentionNames.filter(
        name => !agents.find(a => a.name.toLowerCase() === name.toLowerCase())
      )

      if (matched.length > 1) {
        // Multiple valid agents → fire in parallel and consolidate
        clearInput()
        await dispatchMulti(msg, matched.map(a => a._id))
        return
      }
      if (matched.length === 1) {
        clearInput()
        await dispatch(msg, matched[0]._id, 'at_mention')
        return
      }
      // Only unmatched @mentions
      setAgentPicker({ message: msg, reason: `No agent named “${unmatched[0]}”. Choose one:` })
      clearInput()
      return
    }

    // 2. Reuse the active agent if the conversation already has one.
    if (selectedAgentId) {
      clearInput()
      await dispatch(msg, selectedAgentId, 'continuation')
      return
    }

    // 3. Single agent — route automatically, no LLM call needed.
    if (agents.length === 1) {
      clearInput()
      await dispatch(msg, agents[0]._id, 'single_agent')
      return
    }

    // 4. Greeting — no need to call LLM router, any agent will respond correctly.
    if (GREETING_RE.test(msg)) {
      clearInput()
      await dispatch(msg, agents[0]._id, 'greeting')
      return
    }

    // 5. No @-mention, no active agent, non-greeting — ask the LLM to route.
    clearInput()
    setRouting(true)
    try {
      const { data } = await api.post('/api/llm/route-agent', {
        message: msg,
        agents: agents.map(a => ({ id: a._id, name: a.name, description: a.description || '' })),
      })
      if (data.confident && data.agent_id) {
        await dispatch(msg, data.agent_id, 'auto_routed')
      } else {
        // LLM ambiguous — ask user to choose via modal.
        setAgentPicker({ message: msg, reason: data.reason || 'Which agent should handle this?' })
      }
    } catch {
      // LLM router failed — fall back to picker modal.
      setAgentPicker({ message: msg, reason: 'Could not automatically identify an agent. Please choose one:' })
    } finally {
      setRouting(false)
    }
  }

  const copySql = async (sql: string, id: string) => {
    await navigator.clipboard.writeText(sql)
    setCopiedSql(id)
    setTimeout(() => setCopiedSql(null), 2000)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setHasInput(val.trim().length > 0)
    const atIdx = val.lastIndexOf('@')
    if (atIdx >= 0) {
      const beforeAt = val.slice(0, atIdx)
      if (atIdx === 0 || beforeAt.endsWith(' ') || beforeAt.endsWith('\n')) {
        const partial = val.slice(atIdx + 1)
        if (!partial.includes(' ')) {
          setMentionFilter(partial ? `@${partial}` : '')
          setShowMentions(true)
          setMentionIndex(0)
          return
        }
      }
    }
    setShowMentions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredMentions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredMentions.length) % filteredMentions.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const activeAgent = agents.find(a => a._id === selectedAgentId)
  const viewingMsg = activeDataMsgId ? messages.find(m => m.id === activeDataMsgId) : null

  return (
    <div className="flex h-full -m-6 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
      {/* ── Sessions sidebar ── */}
      <div className="w-56 border-r flex flex-col shrink-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={startNew}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#e94560] text-white text-xs font-semibold hover:bg-[#e94560]/90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {pageLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No chats yet</p>
          ) : null}
          {sessions.map(s => (
            <button
              key={s._id}
              onClick={() => loadSession(s)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all truncate
                ${activeSession?._id === s._id ? 'bg-[#e94560]/10 text-[#e94560]' : 'hover:bg-white/5'}`}
              style={{ color: activeSession?._id !== s._id ? 'var(--text-secondary)' : undefined }}
            >
              {s.title || 'New Chat'}
            </button>
          ))}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Active agent</p>
          {activeAgent ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <Bot className="w-3 h-3 text-[#e94560] shrink-0" />
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{activeAgent.name}</span>
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {pageLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : agents.length === 0 ? 'No agents' : 'Type @ to select'}
            </p>
          )}
        </div>
      </div>

      {/* ── Chat column ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="h-11 flex items-center px-4 border-b shrink-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <Bot className="w-4 h-4 text-[#e94560] mr-2" />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {activeAgent?.name || 'Select Agent'}
          </span>
          {(isLoading || routing) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#e94560]/10 text-[#e94560] animate-pulse ml-2">
              {routing ? 'Choosing agent…' : (currentStatus || 'Thinking...')}
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#e94560]/10 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-[#e94560]" />
              </div>
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Chat with your data</h2>
              <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                Ask anything in plain English. Type <code className="text-[#e94560] text-xs">@</code> to switch agents.
              </p>
              {!pageLoading && agents.length === 0 && (
                <p className="mt-4 text-xs px-4 py-2 rounded-lg bg-amber-500/10 text-amber-500">
                  ⚠ Create an agent first from the Agents tab
                </p>
              )}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                  ${msg.role === 'user' ? 'bg-[#0f3460]/20' : 'bg-[#e94560]/10'}`}>
                  {msg.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-[#0f3460]" />
                    : <Bot className="w-3.5 h-3.5 text-[#e94560]" />}
                </div>
                {msg.role === 'assistant' && msg.agent_name && (
                  <span
                    className="text-[9px] font-semibold text-center leading-tight"
                    style={{ color: 'var(--text-muted)', maxWidth: '48px', wordBreak: 'break-word' }}
                  >
                    {msg.agent_name}
                  </span>
                )}
              </div>

              <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'text-right' : ''}`}>
                {/* Hold the full response behind a spinner only while SSE is still streaming */}
                {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
                  <div
                    className="inline-block max-w-[90%] rounded-xl px-4 py-2.5 text-sm leading-relaxed rounded-bl-sm"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e94560]" />
                      <span style={{ color: 'var(--text-muted)' }}>
                        {msg.pendingChart ? 'Generating visualization...' : (currentStatus || 'Thinking...')}
                      </span>
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Message text — always strip markdown from assistant answers */}
                    {(() => {
                      const displayContent = msg.role === 'assistant' ? stripMarkdown(msg.content) : msg.content
                      if (!displayContent) return null
                      return (
                        <div
                          className={`inline-block max-w-[90%] rounded-xl px-4 py-2.5 text-sm leading-relaxed
                            ${msg.role === 'user' ? 'bg-[#0f3460] text-white rounded-br-sm' : 'rounded-bl-sm'}`}
                          style={msg.role === 'assistant' ? {
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                          } : undefined}
                        >
                          <span style={{ whiteSpace: 'pre-wrap' }}>{displayContent}</span>
                        </div>
                      )
                    })()}

                    {/* Inline SQL only when there's no data card (card has its own SQL tab) */}
                    {msg.sql_query && !(msg.data && msg.data.columns.length > 0) && (
                      <div className="mt-2 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <Code2 className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>SQL</span>
                          <button
                            onClick={() => copySql(msg.sql_query!, msg.id)}
                            className="ml-auto text-[10px] flex items-center gap-1 hover:text-[#e94560] transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {copiedSql === msg.id ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                            {copiedSql === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="text-[11px] p-2.5 rounded-lg overflow-x-auto leading-relaxed"
                          style={{ background: 'var(--bg-secondary)', color: '#7dd3fc', border: '1px solid var(--border-color)', fontFamily: 'Monaco, monospace' }}>
                          {msg.sql_query}
                        </pre>
                      </div>
                    )}

                    {msg.data && msg.data.columns.length > 0 && (
                      <QueryResultCard
                        columns={msg.data.columns}
                        rows={msg.data.rows}
                        sqlQuery={msg.sql_query}
                        chartConfig={msg.chart_config}
                        agentName={msg.agent_name}
                        messageId={msg.id}
                        generatingChart={generatingChart === msg.id}
                        aiSummary={aiSummaries[msg.id]}
                        summaryLoading={summaryLoadingIds.has(msg.id)}
                        onAddToDashboard={() => { setActiveDataMsgId(msg.id); setShowAddModal(true) }}
                      />
                    )}

                    {msg.role === 'assistant' && msg.latency_ms != null && (
                      <div className="flex items-center gap-1 mt-1 ml-1">
                        <Clock className="w-2.5 h-2.5" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          answered in {(msg.latency_ms / 1000).toFixed(1)}s
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t shrink-0 relative" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          {showMentions && filteredMentions.length > 0 && (
            <div
              ref={mentionRef}
              className="absolute bottom-full left-4 right-16 mb-1 rounded-xl shadow-2xl border overflow-hidden z-50"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <div className="py-1 max-h-48 overflow-y-auto">
                {filteredMentions.map((opt, i) => (
                  <button
                    key={opt.label}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(opt) }}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      i === mentionIndex ? 'bg-[#e94560]/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[#e94560]/10">
                      <Bot className="w-3.5 h-3.5 text-[#e94560]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t text-[10px]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: 'var(--bg-secondary)' }}>↑↓</kbd> navigate ·{' '}
                <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: 'var(--bg-secondary)' }}>Tab</kbd> select ·{' '}
                <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: 'var(--bg-secondary)' }}>Esc</kbd> dismiss
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pageLoading ? 'Loading...' : agents.length === 0 ? 'Create an agent first...' : 'Ask anything... type @ to switch agents'}
              rows={1}
              disabled={pageLoading || agents.length === 0}
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none resize-none transition-all focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', maxHeight: '120px' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!hasInput || isLoading || routing || pageLoading || agents.length === 0}
              className="w-10 h-10 rounded-xl bg-[#e94560] text-white flex items-center justify-center hover:bg-[#e94560]/90 transition-all disabled:opacity-50 shrink-0"
            >
              {(isLoading || routing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Agent picker (no @-mention, no active agent, ambiguous route) ── */}
      {agentPicker && (
        <AgentPickerDialog
          agents={agents}
          prompt={agentPicker.message}
          reason={agentPicker.reason}
          onSelect={(agent) => {
            const pending = agentPicker.message
            setAgentPicker(null)
            void dispatch(pending, agent._id, 'picker')
          }}
          onCancel={() => {
            // Restore the text so the user can edit or @-mention explicitly.
            if (inputRef.current && !inputRef.current.value) {
              inputRef.current.value = agentPicker.message
              setHasInput(true)
            }
            setAgentPicker(null)
          }}
        />
      )}

      {/* ── Add to Dashboard Modal ── */}
      {showAddModal && viewingMsg?.data && (
        <AddToDashboardModal
          projectId={projectId!}
          dashboards={dashboards}
          messageData={viewingMsg}
          sessionId={sessionId || activeSession?._id || ''}
          onClose={() => setShowAddModal(false)}
          onDashboardCreated={(d) => setDashboards(prev => [...prev, d])}
        />
      )}
    </div>
  )
}

// ── Add to Dashboard Modal ──────────────────────────────────────────────────
interface AddModalProps {
  projectId: string
  dashboards: Dashboard[]
  messageData: any
  sessionId: string
  onClose: () => void
  onDashboardCreated: (d: Dashboard) => void
}

function AddToDashboardModal({ projectId, dashboards, messageData, sessionId, onClose, onDashboardCreated }: AddModalProps) {
  const [selected, setSelected] = useState<string>(dashboards[0]?._id || '__new__')
  const [newName, setNewName] = useState('')
  const [displayType, setDisplayType] = useState<'chart' | 'table'>(messageData.chart_config ? 'chart' : 'table')
  const [title, setTitle] = useState(messageData.sql_query?.split('FROM')[1]?.split(/\s+/)[1]?.replace(/[^a-z0-9]/gi, ' ').trim() || 'Widget')
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState('')

  const handleAdd = async () => {
    setAdding(true)
    try {
      let dashId = selected
      if (selected === '__new__') {
        const { data } = await api.post(`/api/projects/${projectId}/dashboards`, { name: newName || 'New Dashboard', description: '' })
        dashId = data._id
        onDashboardCreated(data)
      }
      await api.post(`/api/projects/${projectId}/dashboards/${dashId}/widgets`, {
        source_type: 'chat',
        source_session_id: sessionId,
        source_message_id: messageData.id,
        data_binding: {
          query: messageData.sql_query || '',
          agent_id: null,
          agent_name: messageData.agent_name || '',
        },
        display_type: displayType,
        chart_config: displayType === 'chart' ? messageData.chart_config : null,
        table_config: displayType === 'table' ? messageData.table_config : null,
        title,
        position: { x: 0, y: 0, w: 6, h: 4 },
      })
      setSuccess(selected === '__new__' ? `Added to "${newName || 'New Dashboard'}"` : 'Widget added!')
      setTimeout(onClose, 1500)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-md shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Add to Dashboard</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{messageData.data?.rows.length} rows · {messageData.data?.columns.length} columns</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{success}</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>Dashboard</label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {dashboards.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                <option value="__new__">+ Create New Dashboard</option>
              </select>
            </div>
            {selected === '__new__' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>Dashboard Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="My Dashboard"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>Widget Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>Display As</label>
              <div className="flex gap-2">
                {(['chart', 'table'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setDisplayType(type)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      displayType === type ? 'bg-[#e94560] text-white border-[#e94560]' : 'hover:bg-white/5'
                    }`}
                    style={displayType !== type ? { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {type === 'chart' ? '📊 Chart' : '📋 Table'}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || (selected === '__new__' && !newName)}
              className="w-full py-2.5 rounded-xl bg-[#e94560] text-white font-semibold text-sm hover:bg-[#e94560]/90 transition-all disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Widget'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
