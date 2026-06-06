import { Bot, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Agent } from '../../lib/types'

interface AgentPickerDialogProps {
  agents: Agent[]
  /** Optional context line, e.g. the message that triggered the prompt. */
  prompt?: string
  reason?: string
  onSelect: (agent: Agent) => void
  onCancel: () => void
}

/**
 * Shown when the user sends a message with no @-mention and there is no active
 * agent, and the LLM router could not confidently pick one. Asks the user to
 * choose which agent should handle the question.
 */
export default function AgentPickerDialog({
  agents, prompt, reason, onSelect, onCancel,
}: AgentPickerDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-up"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Which agent should I use?</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {reason || 'Your question could match more than one agent. Pick one to continue.'}
            </p>
          </div>
          <button onClick={onCancel} className="p-1" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {prompt && (
          <div className="px-5 pt-4">
            <p className="text-xs italic px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              “{prompt}”
            </p>
          </div>
        )}

        <div className="p-3 max-h-72 overflow-y-auto space-y-1">
          {agents.map(a => (
            <button
              key={a._id}
              onClick={() => onSelect(a)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-[#e94560]/10"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#e94560]/10">
                <Bot className="w-4 h-4 text-[#e94560]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{a.description || 'Data agent'}</div>
              </div>
            </button>
          ))}
          {agents.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
              No agents available. Create one from the Agents tab.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
