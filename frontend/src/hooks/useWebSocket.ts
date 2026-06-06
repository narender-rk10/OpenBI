/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'

type WSMessage = {
  type: string
  [key: string]: any
}

interface UseWebSocketReturn {
  isConnected: boolean
  sendMessage: (msg: WSMessage) => void
  lastMessage: WSMessage | null
  connect: (dashboardId: string) => void
  disconnect: () => void
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)
  const dashboardIdRef = useRef<string | null>(null)
  const shouldReconnect = useRef(true)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connect = useCallback((dashboardId: string) => {
    dashboardIdRef.current = dashboardId
    shouldReconnect.current = true
    reconnectDelay.current = 1000
    _connect(dashboardId)
  }, [])

  const _connect = useCallback((dashboardId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const token = localStorage.getItem('openbi_token')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`
    const wsUrl = `${wsBase}/ws/dashboard/${dashboardId}?token=${token}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      reconnectDelay.current = 1000
      // Clear previous heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        } else {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'pong') return
        setLastMessage(msg)
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      setIsConnected(false)
      if (shouldReconnect.current && dashboardIdRef.current) {
        reconnectTimeout.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
          _connect(dashboardIdRef.current!)
        }, reconnectDelay.current)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  const disconnect = useCallback(() => {
    shouldReconnect.current = false
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
  }, [])

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    return () => {
      shouldReconnect.current = false
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      wsRef.current?.close()
    }
  }, [])

  return { isConnected, sendMessage, lastMessage, connect, disconnect }
}
