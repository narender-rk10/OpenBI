/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { MessageSquare, ChevronUp, ChevronDown, Bot, Send, Loader2, User } from 'lucide-react'
import api from '../../lib/api'

interface DashboardChatProps {
  projectId: string
  dashboardId: string
  selectedWidgetId: string | null
  onWidgetUpdated: (widgetId: string, update: any) => void
}

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
}

export default function DashboardChat({
  projectId,
  dashboardId,
  selectedWidgetId,
  onWidgetUpdated,
}: DashboardChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyLoaded = useRef(false)

  // Load persisted chat history the first time the panel is opened.
  useEffect(() => {
    if (!isOpen || historyLoaded.current) return
    historyLoaded.current = true
    api.get(`/api/projects/${projectId}/dashboards/${dashboardId}/chat/history`)
      .then(({ data }) => {
        const msgs = (data.messages || []).map((m: any) => ({ role: m.role, content: m.content }))
        if (msgs.length) setChatHistory(msgs)
      })
      .catch(() => { /* history is best-effort */ })
  }, [isOpen, projectId, dashboardId])

  const handleSend = async () => {
    const msg = inputValue.trim()
    if (!msg || loading) return
    setInputValue('')

    if (!selectedWidgetId) {
      setChatHistory(prev => [...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: '⚠ Please click a widget first to select it, then I can modify it.' },
      ])
      return
    }

    setChatHistory(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/dashboards/${dashboardId}/chat`,
        { message: msg, widget_id: selectedWidgetId },
      )

      if (data.needs_selection) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }])
        return
      }

      // Operation not supported by AntV G2 / S2 — show the helpful hint.
      if (data.unsupported) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }])
        return
      }

      const displayType = data.display_type as 'chart' | 'table'
      const update: any = { display_type: displayType }
      if (displayType === 'chart' && data.chart_config) update.chart_config = data.chart_config
      if (displayType === 'table' && data.table_config) update.table_config = data.table_config

      onWidgetUpdated(selectedWidgetId, update)
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `✓ ${data.changes_made || 'Widget updated successfully'}`,
      }])
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${detail}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="border-t shrink-0 transition-all"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}
    >
      {/* Toggle bar */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-all"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-[#e94560]" />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Dashboard Chat</span>
          {selectedWidgetId && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#e94560]/10 text-[#e94560]">
              Widget selected
            </span>
          )}
        </div>
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          : <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div>
          {/* History */}
          <div className="max-h-40 overflow-y-auto px-4 space-y-2 pb-2">
            {chatHistory.length === 0 && (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
                {selectedWidgetId
                  ? 'Describe what you want to change, e.g. "make it a pie chart" or "sort by revenue desc".'
                  : 'Click a widget on the dashboard to select it, then describe your changes here.'}
              </p>
            )}
            {chatHistory.map((entry, i) => (
              <div key={i} className={`flex gap-2 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5
                  ${entry.role === 'user' ? 'bg-[#0f3460]/20' : 'bg-[#e94560]/10'}`}>
                  {entry.role === 'user'
                    ? <User className="w-2.5 h-2.5 text-[#0f3460]" />
                    : <Bot className="w-2.5 h-2.5 text-[#e94560]" />}
                </div>
                <p className="text-xs py-1.5 px-2.5 rounded-lg max-w-[85%]"
                  style={{
                    background: entry.role === 'user' ? '#0f3460' : 'var(--bg-secondary)',
                    color: entry.role === 'user' ? 'white' : 'var(--text-primary)',
                  }}>
                  {entry.content}
                </p>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-4 pb-3">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={selectedWidgetId
                ? 'Make it a pie chart, sort by revenue...'
                : 'Click a widget first...'}
              className="flex-1 px-3 py-2 rounded-lg border text-xs outline-none"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || loading}
              className="w-7 h-7 rounded-lg bg-[#e94560] text-white flex items-center justify-center hover:bg-[#e94560]/90 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
