/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ChatMessageState {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent_name?: string
  sql_query?: string
  data?: { columns: string[]; rows: any[][] }
  chart_config?: any
  table_config?: any
  timestamp: string
  isStreaming?: boolean
  pendingChart?: boolean
  latency_ms?: number
}

interface UseChatReturn {
  messages: ChatMessageState[]
  isLoading: boolean
  currentStatus: string
  sessionId: string | null
  sendMessage: (params: {
    projectId: string
    agentId: string
    message: string
    existingSessionId?: string | null
    routingSource?: string
  }) => Promise<void>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageState[]>>
  clearMessages: () => void
  updateMessageChart: (messageId: string, chartConfig: any) => void
  updateMessageTable: (messageId: string, tableConfig: any) => void
  clearPendingChart: (messageId: string) => void
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageState[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentStatus, setCurrentStatus] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isLoadingRef = useRef(false)

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setCurrentStatus('')
  }, [])

  const updateMessageChart = useCallback((messageId: string, chartConfig: any) => {
    setMessages(prev =>
      prev.map(m => (m.id === messageId ? { ...m, chart_config: chartConfig } : m))
    )
  }, [])

  const updateMessageTable = useCallback((messageId: string, tableConfig: any) => {
    setMessages(prev =>
      prev.map(m => (m.id === messageId ? { ...m, table_config: tableConfig } : m))
    )
  }, [])

  const clearPendingChart = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m => (m.id === messageId ? { ...m, pendingChart: false } : m))
    )
  }, [])

  const sendMessage = useCallback(async ({
    projectId,
    agentId,
    message,
    existingSessionId,
    routingSource = 'unknown',
  }: {
    projectId: string
    agentId: string
    message: string
    existingSessionId?: string | null
    routingSource?: string
  }) => {
    if (isLoadingRef.current) return

    // Add user message immediately
    const userMsg: ChatMessageState = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setCurrentStatus('Thinking...')

    // Placeholder assistant message for streaming
    const assistantId = `asst_${Date.now()}`
    const assistantMsg: ChatMessageState = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      abortRef.current = new AbortController()
      const token = localStorage.getItem('openbi_token')

      const resp = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: existingSessionId || null,
          agent_id: agentId,
          message,
          stream: true,
          routing_source: routingSource,
        }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      }

      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumSql = ''
      let accumContent = ''
      let accumData: { columns: string[]; rows: any[][] } | null = null
      let finalMessageId = assistantId
      let newSessionId = existingSessionId || null
      let accumLatencyMs: number | undefined

      if (reader) {
        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
              continue
            }
            if (!line.startsWith('data: ')) continue

            try {
              const payload = JSON.parse(line.slice(6))

              switch (currentEvent) {
                case 'thinking':
                  setCurrentStatus(payload.step || 'Thinking...')
                  break
                case 'sql':
                  accumSql = payload.query || ''
                  setCurrentStatus('Executing query...')
                  break
                case 'data':
                  accumData = { columns: payload.columns || [], rows: payload.rows || [] }
                  setCurrentStatus('Processing results...')
                  break
                case 'answer':
                  accumContent = payload.content || ''
                  break
                case 'done':
                  if (payload.session_id) newSessionId = payload.session_id
                  if (payload.message_id) finalMessageId = payload.message_id
                  if (payload.latency_ms != null) accumLatencyMs = payload.latency_ms
                  break outer
                default:
                  // Handle flat data events
                  if (payload.query) accumSql = payload.query
                  if (payload.columns) accumData = { columns: payload.columns, rows: payload.rows || [] }
                  if (payload.content) accumContent = payload.content
                  if (payload.session_id) newSessionId = payload.session_id
                  if (payload.message_id) finalMessageId = payload.message_id
              }

              setMessages(prev => {
                const updated = [...prev]
                const idx = updated.findIndex(m => m.id === assistantId)
                if (idx !== -1) {
                  updated[idx] = {
                    ...updated[idx],
                    id: finalMessageId,
                    content: accumContent || updated[idx].content,
                    sql_query: accumSql || updated[idx].sql_query,
                    data: accumData || updated[idx].data,
                    isStreaming: true,
                  }
                }
                return updated
              })
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // Finalize message — pendingChart=true if data present (chart auto-gen will clear it)
      setMessages(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(m => m.id === assistantId || m.id === finalMessageId)
        if (idx !== -1) {
          const hasData = accumData != null && accumData.columns.length > 0
          updated[idx] = {
            ...updated[idx],
            id: finalMessageId,
            content: accumContent,
            sql_query: accumSql || undefined,
            data: accumData || undefined,
            isStreaming: false,
            pendingChart: hasData,
            latency_ms: accumLatencyMs,
          }
        }
        return updated
      })

      if (newSessionId) setSessionId(newSessionId)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setMessages(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(m => m.id === assistantId)
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            content: `Error: ${err.message || 'Failed to get response'}`,
            isStreaming: false,
          }
        }
        return updated
      })
    } finally {
      setIsLoading(false)
      setCurrentStatus('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    messages,
    isLoading,
    currentStatus,
    sessionId,
    sendMessage,
    setMessages,
    clearMessages,
    updateMessageChart,
    updateMessageTable,
    clearPendingChart,
  }
}
