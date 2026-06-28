/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import {
  Save, Key, Palette, Loader2, Users, MessageCircle,
  Copy, CheckCircle2, UserPlus, Fingerprint, Eye, EyeOff,
  RefreshCw, AlertTriangle, Trash2, Mail
} from 'lucide-react'
import api from '../lib/api'
import type { OrgSettings } from '../lib/types'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import ConfirmDialog from '../components/shared/ConfirmDialog'

const PROVIDER_MODELS: Record<string, { id: string; label: string; tier: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   tier: 'Flagship' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Fast · Balanced' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'Fast' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   tier: 'Previous gen' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', tier: 'Previous gen · Fast' },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o',      tier: 'Flagship' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'Fast · Cheap' },
    { id: 'o3',          label: 'o3',           tier: 'Reasoning' },
    { id: 'o4-mini',     label: 'o4 Mini',      tier: 'Reasoning · Fast' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'Previous gen' },
  ],
  anthropic: [
    { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   tier: 'Flagship' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', tier: 'Balanced' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  tier: 'Fast · Cheap' },
  ],
}
const CUSTOM_ID = '__custom__'

export default function SettingsPage() {
  const { isSuperAdmin, user, updateUser } = useAuth()
  const { refreshBranding } = useBranding()
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'telegram' | 'llm' | 'branding' | 'users' | 'smtp'>('profile')

  // Profile Form
  const [profileName, setProfileName] = useState(user?.name || '')
  
  // Telegram Form
  const [telegramKey, setTelegramKey] = useState('')
  const [copiedKey, setCopiedKey] = useState(false)

  // LLM form — start blank so the form doesn't masquerade defaults as saved values.
  // Real values are populated from the backend in fetchData() once settings load.
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')         // dropdown value (or CUSTOM_ID)
  const [customModel, setCustomModel] = useState('') // free-text when model === CUSTOM_ID
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [llmResyncResult, setLlmResyncResult] = useState<{
    agents_synced: number
    agents_failed: { name: string, error: string }[]
    kbs_need_recreate: { _id: string, project_id: string, name: string, source_count: number }[]
  } | null>(null)
  const [recreatingKbId, setRecreatingKbId] = useState<string | null>(null)
  const [llmError, setLlmError] = useState<string | null>(null)
  const [llmSuccess, setLlmSuccess] = useState<string | null>(null)

  // Branding
  const [primaryColor, setPrimaryColor] = useState('#1a1a2e')
  const [secondaryColor, setSecondaryColor] = useState('#e94560')
  const [accentColor, setAccentColor] = useState('#0f3460')
  const [customTitle, setCustomTitle] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Invite User Form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ email: string, tempPwd: string } | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ userId: string; userName: string } | null>(null)

  // SMTP Form
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpHasPassword, setSmtpHasPassword] = useState(false)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpSuccess, setSmtpSuccess] = useState(false)
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [settingsRes, usersRes] = await Promise.all([
        api.get('/api/settings'),
        isSuperAdmin ? api.get('/api/users') : Promise.resolve({ data: [] })
      ])
      
      const data = settingsRes.data
      setSettings(data)
      const savedProvider = data.settings.llm_provider || ''
      const savedModel = data.settings.llm_model || ''
      setProvider(savedProvider)
      const knownIds = (PROVIDER_MODELS[savedProvider] || []).map(m => m.id)
      if (savedModel && !knownIds.includes(savedModel)) {
        setModel(CUSTOM_ID)
        setCustomModel(savedModel)
      } else {
        setModel(savedModel)
        setCustomModel('')
      }
      setPrimaryColor(data.settings.branding?.primary_color || '#1a1a2e')
      setSecondaryColor(data.settings.branding?.secondary_color || '#e94560')
      setAccentColor(data.settings.branding?.accent_color || '#0f3460')
      setCustomTitle(data.settings.branding?.title || '')
      setCustomDescription(data.settings.branding?.description || '')
      setLogoUrl(data.settings.branding?.logo_url || null)

      if (isSuperAdmin) {
        setUsers(usersRes.data)
        const smtp = data.settings.smtp || {}
        setSmtpHost(smtp.host || '')
        setSmtpPort(String(smtp.port || 587))
        setSmtpUsername(smtp.username || '')
        setSmtpFrom(smtp.from_addr || '')
        setSmtpHasPassword(!!smtp.password_masked)
      }
    } finally {
      setLoading(false)
    }
  }


  const saveProfile = async () => {
    setSaving(true)
    try {
      await api.put('/api/auth/me', { name: profileName })
      updateUser({ name: profileName })
    } finally {
      setSaving(false)
    }
  }

  const generateTelegramKey = async () => {
    setSaving(true)
    try {
      const { data } = await api.post('/api/auth/telegram/generate-key', {})
      setTelegramKey(data.api_key)
    } finally {
      setSaving(false)
    }
  }

  const copyKey = () => {
    if (!telegramKey) return
    navigator.clipboard.writeText(telegramKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const saveLLM = async () => {
    setSaving(true)
    setLlmError(null)
    setLlmSuccess(null)
    try {
      const resolvedModel = model === CUSTOM_ID ? customModel : model
      const { data } = await api.put('/api/settings/llm', {
        provider,
        model: resolvedModel,
        ...(apiKey ? { api_key: apiKey } : {}),
      })
      setApiKey('')
      // Only show the resync banner when the key actually changed
      if (data.kbs_need_recreate !== undefined && (apiKey || data.kbs_need_recreate.length)) {
        setLlmResyncResult({
          agents_synced: data.agents_synced || 0,
          agents_failed: data.agents_failed || [],
          kbs_need_recreate: data.kbs_need_recreate || [],
        })
      }
      setLlmSuccess('LLM settings saved.')
      await fetchData()
    } catch (err: any) {
      setLlmError(err.response?.data?.detail || err.message || 'Failed to save LLM settings')
    } finally {
      setSaving(false)
    }
  }

  const recreateKb = async (projectId: string, kbId: string) => {
    setRecreatingKbId(kbId)
    setLlmError(null)
    try {
      await api.post(`/api/projects/${projectId}/knowledge-bases/${kbId}/recreate`)
      setLlmResyncResult((prev) =>
        prev
          ? { ...prev, kbs_need_recreate: prev.kbs_need_recreate.filter((k) => k._id !== kbId) }
          : prev,
      )
    } catch (err: any) {
      setLlmError(err.response?.data?.detail || err.message || 'Failed to recreate knowledge base')
    } finally {
      setRecreatingKbId(null)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post('/api/settings/logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      setLogoUrl(data.logo_url)
      await refreshBranding()
      await fetchData()
    } catch (err) {
      console.error('Failed to upload logo:', err)
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleLogoDelete = async () => {
    setUploadingLogo(true)
    try {
      await api.delete('/api/settings/logo')
      setLogoUrl(null)
      await refreshBranding()
      await fetchData()
    } catch (err) {
      console.error('Failed to delete logo:', err)
    } finally {
      setUploadingLogo(false)
    }
  }

  const saveBranding = async () => {
    setSaving(true)
    try {
      await api.put('/api/settings/branding', {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        title: customTitle,
        description: customDescription,
      })
      await refreshBranding()
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setInviteResult(null)
    try {
      const { data } = await api.post('/api/auth/invite', {
        email: inviteEmail,
        name: inviteName,
        role: inviteRole
      })
      setInviteResult({ email: inviteEmail, tempPwd: data.temporary_password })
      setInviteEmail('')
      setInviteName('')
      setInviteRole('member')
      fetchData()
    } catch { /* handled globally */ } finally {
      setInviting(false)
    }
  }

  const deleteUser = (userId: string, userName: string) => {
    setConfirmDelete({ userId, userName })
  }

  const confirmDeleteUser = async () => {
    if (!confirmDelete) return
    setDeletingUserId(confirmDelete.userId)
    setConfirmDelete(null)
    try {
      await api.delete(`/api/users/${confirmDelete.userId}`)
      setUsers(prev => prev.filter(u => u._id !== confirmDelete.userId))
    } catch { /* handled globally */ } finally {
      setDeletingUserId(null)
    }
  }

  const saveSMTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setSmtpSaving(true)
    setSmtpSuccess(false)
    try {
      await api.put('/api/settings/smtp', {
        host: smtpHost,
        port: parseInt(smtpPort) || 587,
        username: smtpUsername,
        password: smtpPassword || undefined,
        from_addr: smtpFrom,
      })
      setSmtpPassword('')
      setSmtpHasPassword(true)
      setSmtpSuccess(true)
      setTimeout(() => setSmtpSuccess(false), 3000)
    } catch { /* handled globally */ } finally {
      setSmtpSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 flex gap-6 items-start animate-[fade-in_0.5s_ease-out]">
      {/* Sidebar Nav */}
      <div className="w-48 shrink-0 flex flex-col gap-1">
        <h1 className="text-xl font-bold mb-4 px-3" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <TabButton id="profile" label="Your Profile" icon={Fingerprint} active={activeTab} onClick={setActiveTab} />
        <TabButton id="telegram" label="Telegram Bot" icon={MessageCircle} active={activeTab} onClick={setActiveTab} />
        
        {isSuperAdmin && (
          <>
            <div className="mt-4 mb-2 px-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Workspace Setup</span>
            </div>
            <TabButton id="llm" label="LLM Configuration" icon={Key} active={activeTab} onClick={setActiveTab} />
            <TabButton id="branding" label="Branding" icon={Palette} active={activeTab} onClick={setActiveTab} />
            <TabButton id="smtp" label="Email (SMTP)" icon={Mail} active={activeTab} onClick={setActiveTab} />
            <TabButton id="users" label="User Management" icon={Users} active={activeTab} onClick={setActiveTab} />
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 card min-h-[500px]">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="p-6">
            <h2 className="font-semibold text-lg mb-5" style={{ color: 'var(--text-primary)' }}>Your Profile</h2>
            <div className="space-y-4 max-w-sm">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Full Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Email</label>
                <input
                  type="text"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none opacity-50 cursor-not-allowed"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#0f3460] text-white rounded-lg text-sm font-medium hover:bg-[#e94560] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Telegram Tab */}
        {activeTab === 'telegram' && (
          <div className="p-6">
            <h2 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Telegram Integration</h2>
            <p className="text-sm mb-6 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              Chat with OpenBI from Telegram. Ask questions, view charts, and get scheduled reports directly to your phone.
            </p>

            <div className="p-5 rounded-xl border mb-6 max-w-lg" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#e94560]/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-[#e94560]" />
                </div>
                <div>
                  <h3 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Link Your Account</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Generate a key to link your Telegram profile.</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={generateTelegramKey}
                  disabled={saving}
                  className="w-full py-2.5 rounded-lg bg-[#0f3460] text-white text-sm font-medium hover:bg-[#e94560] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Generating...' : 'Generate Secret Key'}
                </button>
                
                {telegramKey && (
                  <div className="animate-fade-in space-y-3 mt-4">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Copy this key and paste it to the Telegram bot to connect your accounts.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={telegramKey}
                        readOnly
                        className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      />
                      <button onClick={copyKey} className="w-10 h-10 rounded-lg flex items-center justify-center border hover:bg-white/5 transition-all" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                        {copiedKey ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="max-w-lg">
              <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>Setup Instructions</h3>
              <ol className="list-decimal pl-4 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>Start a chat with the <a href="https://t.me/OpenBIChatBot" target="_blank" rel="noreferrer" className="text-[#e94560] hover:underline font-medium">@OpenBIChatBot</a> on Telegram.</li>
                <li>Generate a Secret Key above and copy it.</li>
                <li>In Telegram, send the command: <code className="px-1.5 py-0.5 rounded ml-1 bg-black/20 font-mono text-xs">/connect YOUR_KEY_HERE</code></li>
              </ol>
            </div>
          </div>
        )}

        {/* LLM Config Tab */}
        {isSuperAdmin && activeTab === 'llm' && (
          <div className="p-6">
            <h2 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>LLM Configuration</h2>
            <p className="text-sm mb-6 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              Configure the default language model used for query generation, agents, and data summarization.
            </p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Provider</label>
                <select
                  value={provider}
                  onChange={(e) => { setProvider(e.target.value); setModel(''); setCustomModel('') }}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="" disabled>Select a provider…</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Model</label>
                <select
                  value={model}
                  onChange={(e) => { setModel(e.target.value); if (e.target.value !== CUSTOM_ID) setCustomModel('') }}
                  disabled={!provider}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none disabled:opacity-40"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="" disabled>{provider ? 'Select a model…' : 'Select a provider first'}</option>
                  {(PROVIDER_MODELS[provider] || []).map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
                  ))}
                  <option value={CUSTOM_ID}>Custom model ID…</option>
                </select>
                {model === CUSTOM_ID && (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Enter exact model ID, e.g. gpt-4-turbo-preview"
                    className="w-full mt-2 px-4 py-2.5 rounded-lg border text-sm outline-none font-mono"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>API Key</label>
                  {settings?.settings.llm_api_key_masked && (
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      Current: {settings.settings.llm_api_key_masked}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter new API key to update..."
                    className="w-full pl-4 pr-10 py-2.5 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-3" 
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={saveLLM}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 mt-2 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#e94560]/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save LLM Settings
              </button>

              {llmError && (
                <div className="mt-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="break-words">{llmError}</span>
                </div>
              )}
              {llmSuccess && !llmError && (
                <div className="mt-4 p-3 rounded-lg border border-green-500/40 bg-green-500/10 text-sm text-green-400 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{llmSuccess}</span>
                </div>
              )}

              {llmResyncResult && (
                <div className="mt-5 p-4 rounded-xl border space-y-3 animate-fade-in" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p style={{ color: 'var(--text-primary)' }}>
                        <span className="font-semibold">{llmResyncResult.agents_synced}</span> agent(s) updated with the new key.
                      </p>
                      {llmResyncResult.agents_failed.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-amber-500">
                            {llmResyncResult.agents_failed.length} agent(s) failed to sync:
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {llmResyncResult.agents_failed.map((f, i) => (
                              <li
                                key={`${f.name}-${i}`}
                                className="text-xs p-2 rounded-md border border-amber-500/30 bg-amber-500/10"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <span className="font-semibold">{f.name}:</span>{' '}
                                <span className="font-mono break-words" style={{ color: 'var(--text-muted)' }}>
                                  {f.error}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {llmResyncResult.kbs_need_recreate.length > 0 && (
                    <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {llmResyncResult.kbs_need_recreate.length} knowledge base(s) still use the old key.
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            Embeddings are tied to the original key, so each KB must be dropped and re-ingested. Tracked sources will be re-added automatically.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 ml-8">
                        {llmResyncResult.kbs_need_recreate.map((kb) => (
                          <div key={kb._id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                            <div className="text-sm min-w-0">
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{kb.name}</span>
                              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                {kb.source_count} source{kb.source_count === 1 ? '' : 's'}
                              </span>
                            </div>
                            <button
                              onClick={() => recreateKb(kb.project_id, kb._id)}
                              disabled={recreatingKbId === kb._id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#0f3460] text-white hover:bg-[#e94560] transition-colors disabled:opacity-50"
                            >
                              {recreatingKbId === kb._id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <RefreshCw className="w-3.5 h-3.5" />}
                              Recreate
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Branding Tab */}
        {isSuperAdmin && activeTab === 'branding' && (
          <div className="p-6">
            <h2 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>White-label Branding</h2>
            <p className="text-sm mb-6 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              Customize the look and feel of the platform and the charts generated by the AI.
            </p>

            <div className="space-y-6 max-w-xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Primary Color', value: primaryColor, set: setPrimaryColor, desc: 'Backgrounds & panels' },
                  { label: 'Secondary Color', value: secondaryColor, set: setSecondaryColor, desc: 'Buttons & highlights' },
                  { label: 'Accent Color', value: accentColor, set: setAccentColor, desc: 'Sidebar & nav' },
                ].map((c) => (
                  <div key={c.label}>
                    <label className="block text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{c.label}</label>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                    <div className="flex items-center gap-2">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
                        <input
                          type="color"
                          value={c.value}
                          onChange={(e) => c.set(e.target.value)}
                          className="absolute -top-2 -left-2 w-14 h-14 cursor-pointer border-none p-0 bg-transparent"
                        />
                      </div>
                      <input
                        type="text"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono uppercase"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Logo and Text Branding Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                {/* Logo Upload */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Logo Icon</label>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Upload your company logo. Suggested size: square, min 100x100px.</p>
                  
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border flex items-center justify-center bg-[var(--bg-card)] overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="Workspace Logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>No Logo</span>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-[#0f3460] hover:bg-[#0f3460]/80 text-white text-xs font-semibold rounded-lg transition-colors inline-block text-center">
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={handleLogoDelete}
                          disabled={uploadingLogo}
                          className="px-3 py-1.5 border border-red-500/40 hover:bg-red-500/10 text-red-400 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Workspace Name & Description */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Branding Title</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="OpenBI"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-[var(--bg-card)]"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Branding Description</label>
                    <input
                      type="text"
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      placeholder="AI-Native BI"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-[var(--bg-card)]"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Visualization Preview */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Chart Palette Preview</label>
                <div className="flex gap-2">
                  {[primaryColor, secondaryColor, accentColor, '#16a34a', '#f59e0b', '#8b5cf6'].map((c, i) => (
                    <div key={i} className="w-8 h-8 rounded-md" style={{ background: c }} />
                  ))}
                </div>
              </div>

              <button
                onClick={saveBranding}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#e94560]/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                Apply Branding Updates
              </button>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {isSuperAdmin && activeTab === 'users' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>User Management</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Invite and manage team members.</p>
              </div>
            </div>

            {/* Invite Form */}
            <form onSubmit={inviteUser} className="p-4 rounded-xl border mb-6" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-[#e94560]" />
                <h3 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Invite New User</h3>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-[var(--bg-card)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-[var(--bg-card)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-[var(--bg-card)]"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50"
                  style={{ height: '38px' }}
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
                </button>
              </div>

              {inviteResult && (
                <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
                  User <span className="font-semibold text-green-400">{inviteResult.email}</span> invited successfully! 
                  <br/> Temporary password: <code className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-green-300 mx-1">{inviteResult.tempPwd}</code>
                  <br/> <span className="text-xs text-green-500/80">Make sure to securely share this password with them.</span>
                </div>
              )}
            </form>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>User</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Role</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Telegram Linked</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Last Login</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{u.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        u.role === 'super_admin' ? 'bg-[#e94560]/10 text-[#e94560]' :
                        u.role === 'admin' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {u.telegram_username ? `@${u.telegram_username}` : <span className="text-xs italic opacity-50">Not linked</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u._id !== user?._id && (
                        <button
                          onClick={() => deleteUser(u._id, u.name)}
                          disabled={deletingUserId === u._id}
                          title="Remove user"
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-500/10 text-red-500/60 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          {deletingUserId === u._id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      No other users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SMTP Tab */}
        {isSuperAdmin && activeTab === 'smtp' && (
          <div className="p-6 max-w-lg">
            <div className="mb-6">
              <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Email (SMTP)</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Configure outgoing email for scheduled reports. Settings are stored securely in your workspace.</p>
            </div>

            <form onSubmit={saveSMTP} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>SMTP Host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={e => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Port</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={e => setSmtpPort(e.target.value)}
                    placeholder="587"
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Username</label>
                <input
                  type="text"
                  value={smtpUsername}
                  onChange={e => setSmtpUsername(e.target.value)}
                  placeholder="you@gmail.com"
                  required
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Password{smtpHasPassword && <span className="ml-1 normal-case font-normal text-green-500">— saved</span>}
                </label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtpPassword}
                    onChange={e => setSmtpPassword(e.target.value)}
                    placeholder={smtpHasPassword ? 'Leave blank to keep existing' : 'App password or SMTP password'}
                    className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button type="button" onClick={() => setShowSmtpPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100">
                    {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>From Address</label>
                <input
                  type="email"
                  value={smtpFrom}
                  onChange={e => setSmtpFrom(e.target.value)}
                  placeholder="noreply@yourcompany.com"
                  required
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={smtpSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#e94560]/90 disabled:opacity-50"
                >
                  {smtpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save SMTP Settings
                </button>
                {smtpSuccess && (
                  <span className="flex items-center gap-1.5 text-sm text-green-500">
                    <CheckCircle2 className="w-4 h-4" /> Saved
                  </span>
                )}
              </div>

              <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                Port 587 uses STARTTLS. Port 465 uses SSL. For Gmail, use an App Password (not your account password).
              </p>
            </form>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Remove Team Member"
        message={confirmDelete ? `Remove "${confirmDelete.userName}" from the team? Their account will be deactivated and they will no longer be able to log in.` : ''}
        confirmText="Remove"
        onConfirm={confirmDeleteUser}
        onCancel={() => setConfirmDelete(null)}
        isLoading={!!deletingUserId}
      />
    </div>
  )
}

function TabButton({ id, label, icon: Icon, active, onClick }: { id: any, label: string, icon: any, active: string, onClick: (id: any) => void }) {
  const isActive = active === id
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all focus:outline-none ${
        isActive ? 'bg-[#0f3460] font-semibold text-white' : 'font-medium hover:bg-white/5 text-[var(--text-secondary)]'
      }`}
    >
      <Icon className="w-4.5 h-4.5" />
      {label}
    </button>
  )
}
