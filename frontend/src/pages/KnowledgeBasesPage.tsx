/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Brain, Plus, Trash2, Upload, Globe, FileText, Loader2,
  CheckCircle2, Database, X, ChevronRight, Eye, Layers,
  Search,
} from 'lucide-react'
import api from '../lib/api'
import type { KnowledgeBase, KBSource } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import DataTableModal from '../components/shared/DataTableModal'
import { useErrorModal } from '../lib/errorModal'

interface VectorStoreField { name: string; label: string; placeholder?: string; required: boolean; type?: string }
interface VectorStoreDef { id: string; label: string; description: string; fields: VectorStoreField[] }

const VECTOR_STORES: VectorStoreDef[] = [
  { id: 'default', label: 'Default (built-in)', description: 'ChromaDB managed by MindsDB', fields: [] },
  { id: 'chromadb', label: 'ChromaDB', description: 'External ChromaDB instance', fields: [
    { name: 'host', label: 'Host', placeholder: 'localhost', required: true },
    { name: 'port', label: 'Port', placeholder: '8000', required: true },
    { name: 'distance', label: 'Distance', placeholder: 'cosine (default)', required: false },
  ]},
  { id: 'qdrant', label: 'Qdrant', description: 'High-performance vector search engine', fields: [
    { name: 'url', label: 'URL', placeholder: 'http://localhost:6333', required: true },
    { name: 'api_key', label: 'API Key', required: false, type: 'password' },
  ]},
  { id: 'milvus', label: 'Milvus', description: 'Cloud-native vector database', fields: [
    { name: 'host', label: 'Host', placeholder: 'localhost', required: true },
    { name: 'port', label: 'Port', placeholder: '19530', required: true },
    { name: 'user', label: 'User', required: false },
    { name: 'password', label: 'Password', required: false, type: 'password' },
  ]},
  { id: 'pgvector', label: 'PGVector', description: 'PostgreSQL with pgvector extension', fields: [
    { name: 'host', label: 'Host', required: true },
    { name: 'port', label: 'Port', placeholder: '5432', required: true },
    { name: 'database', label: 'Database', required: true },
    { name: 'user', label: 'User', required: true },
    { name: 'password', label: 'Password', required: true, type: 'password' },
    { name: 'distance', label: 'Distance', placeholder: 'cosine (default)', required: false },
  ]},
  { id: 'lancedb', label: 'LanceDB', description: 'Serverless vector database', fields: [
    { name: 'uri', label: 'URI', placeholder: '/path/to/db or s3://bucket/path', required: true },
  ]},
  { id: 'weaviate', label: 'Weaviate', description: 'AI-native vector database', fields: [
    { name: 'weaviate_url', label: 'URL', placeholder: 'http://localhost:8080', required: true },
    { name: 'weaviate_api_key', label: 'API Key', required: false, type: 'password' },
  ]},
  { id: 'pinecone', label: 'Pinecone', description: 'Managed vector database', fields: [
    { name: 'api_key', label: 'API Key', required: true, type: 'password' },
  ]},
  { id: 'couchbase', label: 'Couchbase', description: 'Couchbase Vector Search', fields: [
    { name: 'connection_string', label: 'Connection String', placeholder: 'couchbases://...', required: true },
    { name: 'bucket', label: 'Bucket', required: true },
    { name: 'user', label: 'User', required: true },
    { name: 'password', label: 'Password', required: true, type: 'password' },
    { name: 'scope', label: 'Scope', placeholder: '_default', required: false },
  ]},
]

const FORMAT_INFO: Record<string, { label: string; color: string; note: string }> = {
  pdf:     { label: 'PDF',     color: '#e94560', note: 'Text extracted page by page' },
  csv:     { label: 'CSV',     color: '#10b981', note: 'Each row becomes searchable' },
  tsv:     { label: 'TSV',     color: '#10b981', note: 'Tab-separated rows' },
  xlsx:    { label: 'Excel',   color: '#3b82f6', note: 'First sheet extracted' },
  xls:     { label: 'Excel',   color: '#3b82f6', note: 'First sheet extracted' },
  txt:     { label: 'TXT',     color: '#8b5cf6', note: 'Plain text, chunked by paragraph' },
  md:      { label: 'MD',      color: '#8b5cf6', note: 'Markdown, headers preserved' },
  json:    { label: 'JSON',    color: '#f59e0b', note: 'Formatted JSON text' },
  parquet: { label: 'Parquet', color: '#06b6d4', note: 'Columnar data rows' },
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LocalChunk { index: number; text: string; length: number; words: number }
interface LocalPreviewData {
  filename: string; file_size: number; total_chars: number
  text_preview: string; chunks: LocalChunk[]; total_chunks: number
  metadata: Record<string, any>
}

interface ActualChunk { id?: string; content?: string; metadata?: string; [key: string]: any }
interface ActualChunksData { chunks: ActualChunk[]; total: number; kb_name: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Local pre-upload preview modal (approximate) ─────────────────────────────

function LocalPreviewModal({
  data, onConfirm, onCancel, uploading,
}: {
  data: LocalPreviewData; onConfirm: () => void; onCancel: () => void; uploading: boolean
}) {
  const [tab, setTab] = useState<'content' | 'chunks'>('content')
  const ext = data.metadata.ext || ''
  const fmt = FORMAT_INFO[ext]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-3xl rounded-xl border flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', maxHeight: '88vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <FileText className="w-4 h-4 shrink-0" style={{ color: '#e94560' }} />
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {data.filename}
              </span>
              {fmt && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: fmt.color + '22', color: fmt.color }}>
                  {fmt.label}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                Approximate preview
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{fmtSize(data.file_size)}</span>
              <span>·</span>
              <span>{data.total_chars.toLocaleString()} chars</span>
              {data.metadata.pages != null && <><span>·</span><span>{data.metadata.pages} pages</span></>}
              {data.metadata.rows != null && <><span>·</span><span>{data.metadata.rows.toLocaleString()} rows</span></>}
              {data.metadata.columns && <><span>·</span><span>{data.metadata.columns.length} cols</span></>}
              <span>·</span>
              <span style={{ color: '#e94560' }}>~{data.total_chunks} estimated chunks</span>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[#e94560]/10 transition-colors shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Note */}
        <div className="mx-5 mt-4 mb-0 px-3 py-2.5 rounded-lg text-xs flex items-start gap-2" style={{ background: '#f59e0b18', color: '#f59e0b' }}>
          <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            This is a <strong>local approximation</strong> — MindsDB applies its own chunking when embedding.
            After uploading, use <strong>View Chunks</strong> on the source to see the actual vectors stored.
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 mt-3" style={{ borderColor: 'var(--border-color)' }}>
          {(['content', 'chunks'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors"
              style={{ borderBottomColor: tab === t ? '#e94560' : 'transparent', color: tab === t ? '#e94560' : 'var(--text-secondary)' }}
            >
              {t === 'content' ? <><Eye className="w-3.5 h-3.5" />Content</> : <><Layers className="w-3.5 h-3.5" />Est. Chunks ({data.total_chunks})</>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {tab === 'content' ? (
            <pre className="text-xs whitespace-pre-wrap font-mono rounded-lg p-4 leading-relaxed" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {data.text_preview}
              {data.total_chars > 3000 && (
                <span style={{ color: 'var(--text-muted)' }}>{'\n\n'}… and {(data.total_chars - 3000).toLocaleString()} more characters</span>
              )}
            </pre>
          ) : (
            <div className="space-y-2.5">
              {data.chunks.map((chunk) => (
                <div key={chunk.index} className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#e94560' + '22', color: '#e94560' }}>
                      Chunk {chunk.index + 1}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{chunk.length} chars · {chunk.words} words</span>
                  </div>
                  <div className="w-full h-1 rounded-full mb-2.5" style={{ background: 'var(--border-color)' }}>
                    <div className="h-1 rounded-full" style={{ width: `${Math.min(100, (chunk.length / 500) * 100)}%`, background: chunk.length > 450 ? '#e94560' : chunk.length > 300 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <p className="text-xs font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>{chunk.text}</p>
                </div>
              ))}
              {data.total_chunks > data.chunks.length && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>Showing first {data.chunks.length} of {data.total_chunks} estimated chunks</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Confirm to upload and embed into MindsDB.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button
              onClick={onConfirm} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50 transition-all hover:bg-[#e94560]/90"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload to KB
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Actual chunks panel (post-upload, real MindsDB data) ─────────────────────

function ActualChunksPanel({
  data, onClose,
}: {
  data: ActualChunksData; onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const allChunks = data.chunks
  const contentKey = allChunks[0] ? Object.keys(allChunks[0]).find(k => k === 'content') ?? Object.keys(allChunks[0])[0] : 'content'
  const idKey = allChunks[0] ? Object.keys(allChunks[0]).find(k => k === 'id') ?? null : null
  const metaKey = allChunks[0] ? Object.keys(allChunks[0]).find(k => k === 'metadata') ?? null : null

  const filtered = search.trim()
    ? allChunks.filter(c => (c[contentKey] ?? '').toString().toLowerCase().includes(search.toLowerCase()))
    : allChunks

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-3xl rounded-xl border flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Database className="w-4 h-4" style={{ color: '#8b5cf6' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Actual Chunks — {data.kb_name}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#10b981]/15 text-[#10b981]">
                Live from MindsDB
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {data.total} chunks stored in the vector DB · these are the exact text segments that were embedded
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#e94560]/10 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chunks…"
              className="w-full pl-8 pr-4 py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-[#8b5cf6]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Chunk list */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>No chunks match your search.</p>
          ) : filtered.map((chunk, i) => {
            const content = (chunk[contentKey] ?? '').toString()
            const chunkId = idKey ? chunk[idKey] : null
            const meta = metaKey ? chunk[metaKey] : null
            const wordCount = content.split(/\s+/).filter(Boolean).length

            return (
              <div key={i} className="rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                {/* Chunk header */}
                <div
                  className="flex items-center justify-between px-3.5 py-2 border-b rounded-t-lg"
                  style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#8b5cf6' + '22', color: '#8b5cf6' }}>
                      #{i + 1}
                    </span>
                    {chunkId && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        id: {String(chunkId).slice(0, 20)}{String(chunkId).length > 20 ? '…' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{content.length} chars</span>
                    <span>·</span>
                    <span>{wordCount} words</span>
                    {/* fill bar */}
                    <div className="w-16 h-1.5 rounded-full" style={{ background: 'var(--border-color)' }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(100, (content.length / 1000) * 100)}%`,
                          background: content.length > 800 ? '#e94560' : content.length > 400 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <pre className="px-3.5 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {content}
                </pre>

                {/* Metadata */}
                {meta && (
                  <div className="px-3.5 py-2 border-t text-[10px] font-mono rounded-b-lg" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                    metadata: {typeof meta === 'string' ? meta : JSON.stringify(meta)}
                  </div>
                )}
              </div>
            )
          })}
          {search && filtered.length < allChunks.length && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
              Showing {filtered.length} of {allChunks.length} chunks
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-[#8b5cf6]/15 text-[#8b5cf6] hover:bg-[#8b5cf6]/25 transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Original file content viewer (document text) ─────────────────────────────

function FileContentModal({ name, text, onClose }: { name: string; text: string; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const chars = text.length
  const words = text.split(/\s+/).filter(Boolean).length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl border flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', maxHeight: '88vh' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <FileText className="w-4 h-4 shrink-0" style={{ color: '#e94560' }} />
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: '#10b981' + '15', color: '#10b981' }}>Original file</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{chars.toLocaleString()} chars · {words.toLocaleString()} words</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#e94560]/10 transition-colors shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find in document…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed rounded-lg p-4"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            {search.trim()
              ? text.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase())).join('\n') || '(no matching lines)'
              : text}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { showApiError } = useErrorModal()
  const [kbs, setKBs] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [vectorStoreType, setVectorStoreType] = useState('default')
  const [vectorStoreParams, setVectorStoreParams] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)

  // Upload
  const [uploadingKB, setUploadingKB] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Local approximate preview (pre-upload)
  const [previewing, setPreviewing] = useState(false)
  const [localPreview, setLocalPreview] = useState<LocalPreviewData | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewKbId, setPreviewKbId] = useState<string | null>(null)

  // Actual chunks panel (post-upload, from MindsDB)
  const [chunksPanel, setChunksPanel] = useState<ActualChunksData | null>(null)
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [chunksKbId, setChunksKbId] = useState<string | null>(null)

  // Crawl
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [showCrawl, setShowCrawl] = useState<string | null>(null)

  // View original file content
  const [fileView, setFileView] = useState<{ name: string; isDocument: boolean; text: string; columns: string[]; rows: any[][] } | null>(null)
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => { fetchKBs() }, [projectId])

  const fetchKBs = async () => {
    try {
      const { data } = await api.get(`/api/projects/${projectId}/knowledge-bases`)
      setKBs(data)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const payload: any = { name }
      if (vectorStoreType !== 'default') payload.vector_store = { type: vectorStoreType, params: vectorStoreParams }
      await api.post(`/api/projects/${projectId}/knowledge-bases`, payload)
      setName(''); setVectorStoreType('default'); setVectorStoreParams({}); setShowCreate(false)
      fetchKBs()
    } catch (err: any) {
      showApiError(err, 'Failed to create knowledge base')
    } finally {
      setCreating(false)
    }
  }

  const fetchLocalPreview = async (kbId: string, file: File) => {
    setPreviewing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(
        `/api/projects/${projectId}/knowledge-bases/${kbId}/preview`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      setLocalPreview(data)
      setPreviewFile(file)
      setPreviewKbId(kbId)
    } catch (err: any) {
      showApiError(err, 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  const handleFileUpload = async (kbId: string, file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/api/projects/${projectId}/knowledge-bases/${kbId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      fetchKBs()
      // Auto-open actual chunks after upload
      openChunksPanel(kbId)
    } catch (err: any) {
      showApiError(err, 'Upload failed')
    } finally {
      setUploading(false)
      setUploadingKB(null)
    }
  }

  const confirmUpload = async () => {
    if (!previewFile || !previewKbId) return
    setLocalPreview(null)
    await handleFileUpload(previewKbId, previewFile)
    setPreviewFile(null)
    setPreviewKbId(null)
  }

  const openChunksPanel = async (kbId: string) => {
    setLoadingChunks(true)
    setChunksKbId(kbId)
    try {
      const { data } = await api.get(`/api/projects/${projectId}/knowledge-bases/${kbId}/chunks`)
      setChunksPanel(data)
    } catch (err: any) {
      showApiError(err, 'Failed to load chunks from MindsDB')
    } finally {
      setLoadingChunks(false)
      setChunksKbId(null)
    }
  }

  const openFileView = async (kbId: string, source: KBSource) => {
    if (!source.file_id) return
    setLoadingFileId(source.file_id)
    try {
      const { data } = await api.get(
        `/api/projects/${projectId}/knowledge-bases/${kbId}/sources/${source.file_id}/content`,
      )
      const text = data.is_document
        ? (data.rows || []).map((r: any[]) => r[0]).join('\n\n')
        : ''
      setFileView({ name: data.name || source.name || 'File', isDocument: !!data.is_document, text, columns: data.columns || [], rows: data.rows || [] })
    } catch (err: any) {
      showApiError(err, 'Failed to load file content')
    } finally {
      setLoadingFileId(null)
    }
  }

  const handleCrawl = async (kbId: string) => {
    if (!crawlUrl.trim()) return
    setCrawling(true)
    try {
      await api.post(`/api/projects/${projectId}/knowledge-bases/${kbId}/crawl`, { url: crawlUrl, recurring: false })
      setCrawlUrl(''); setShowCrawl(null)
      fetchKBs()
    } catch (err: any) {
      showApiError(err, 'Crawl failed')
    } finally {
      setCrawling(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/knowledge-bases/${deleteTarget._id}`)
      fetchKBs()
    } catch { /* ignore */ }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto animate-[fade-in_0.5s_ease-out]">
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Brain className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Knowledge Bases</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Upload documents and crawl websites for RAG-powered AI answers.
            </p>
          </div>
        </div>
        <button
          id="create-kb-btn"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />New KB
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out] space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Docs" required
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              <Database className="w-3.5 h-3.5" /> Vector Store
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VECTOR_STORES.map((vs) => (
                <button
                  key={vs.id} type="button"
                  onClick={() => { setVectorStoreType(vs.id); setVectorStoreParams({}) }}
                  className={`px-3 py-2 rounded-lg border text-xs text-left transition-all ${vectorStoreType === vs.id ? 'border-[#e94560] bg-[#e94560]/10' : 'hover:border-[#e94560]/40'}`}
                  style={{ borderColor: vectorStoreType === vs.id ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <div className="font-medium">{vs.label}</div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{vs.description}</div>
                </button>
              ))}
            </div>
            {vectorStoreType !== 'default' && (() => {
              const vs = VECTOR_STORES.find(v => v.id === vectorStoreType)!
              return (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {vs.fields.map((f) => (
                    <div key={f.name}>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                        {f.label}{f.required && <span className="text-[#e94560] ml-0.5">*</span>}
                      </label>
                      <input
                        type={f.type || 'text'} placeholder={f.placeholder} required={f.required}
                        value={vectorStoreParams[f.name] || ''}
                        onChange={(e) => setVectorStoreParams(p => ({ ...p, [f.name]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-[#e94560]/30"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setShowCreate(false); setVectorStoreType('default'); setVectorStoreParams({}) }}
              className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={creating}
              className="px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Format strip */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(FORMAT_INFO).map(([ext, info]) => (
          <span key={ext} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: info.color + '18', color: info.color }} title={info.note}>
            {info.label}
          </span>
        ))}
      </div>

      {kbs.length === 0 ? (
        <div className="card p-16 text-center">
          <Brain className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No knowledge bases</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create one to upload PDFs, CSVs, or crawl websites.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {kbs.map((kb) => (
            <div key={kb._id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/20 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-[#8b5cf6]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{kb.name}</h3>
                    <p className="flex items-center gap-2 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {(() => {
                        const files = (kb.sources || []).filter(s => s.type === 'file').length
                        const webs = (kb.sources || []).filter(s => s.type === 'url').length
                        if (!files && !webs) return <span>No sources yet</span>
                        return (
                          <span className="flex items-center gap-2">
                            {files > 0 && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{files} file{files > 1 ? 's' : ''}</span>}
                            {webs > 0 && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{webs} web</span>}
                          </span>
                        )
                      })()}
                      {kb.vector_store && kb.vector_store.type !== 'default' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#8b5cf6]/20 text-[#8b5cf6]">{kb.vector_store.type}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {/* View all chunks for this KB */}
                  {kb.sources && kb.sources.length > 0 && (
                    <button
                      onClick={() => openChunksPanel(kb._id)}
                      disabled={loadingChunks && chunksKbId === kb._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#8b5cf6]/10 transition-all disabled:opacity-50"
                      style={{ color: '#8b5cf6' }}
                      title="View actual chunks stored in MindsDB"
                    >
                      {loadingChunks && chunksKbId === kb._id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Database className="w-3.5 h-3.5" />}
                      Chunks
                    </button>
                  )}
                  <button
                    onClick={() => { setUploadingKB(kb._id); fileInputRef.current?.click() }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#e94560]/10 transition-all"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </button>
                  <button
                    onClick={() => setShowCrawl(showCrawl === kb._id ? null : kb._id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#e94560]/10 transition-all"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Globe className="w-3.5 h-3.5" /> Crawl
                  </button>
                  <button
                    onClick={() => setDeleteTarget(kb)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-[var(--text-secondary)] transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showCrawl === kb._id && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="url" value={crawlUrl} onChange={(e) => setCrawlUrl(e.target.value)}
                    placeholder="https://docs.example.com"
                    className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => handleCrawl(kb._id)} disabled={crawling}
                    className="px-4 py-2 rounded-lg bg-[#e94560] text-white text-xs font-medium disabled:opacity-50">
                    {crawling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crawl'}
                  </button>
                </div>
              )}

              {kb.sources && kb.sources.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {kb.sources.map((source, i) => {
                    const srcExt = (source.name || '').split('.').pop()?.toLowerCase() || ''
                    const srcFmt = FORMAT_INFO[srcExt]
                    return (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {source.type === 'file'
                          ? <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                          : <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
                        {source.type === 'url' && source.url
                          ? <a href={source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="truncate flex-1 hover:underline" style={{ color: 'var(--text-secondary)' }}>{source.url}</a>
                          : <span className="truncate flex-1">{source.name || source.url || 'Unknown'}</span>}
                        {srcFmt && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: srcFmt.color + '22', color: srcFmt.color }}>
                            {srcFmt.label}
                          </span>
                        )}
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        {/* View original file content (documents as text, tabular as grid) */}
                        {source.type === 'file' && source.file_id && (
                          <button
                            onClick={() => openFileView(kb._id, source)}
                            disabled={loadingFileId === source.file_id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium hover:bg-[#e94560]/15 transition-all disabled:opacity-50"
                            style={{ color: '#e94560' }}
                            title="View the original uploaded file content"
                          >
                            {loadingFileId === source.file_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} View file
                          </button>
                        )}
                        {/* Per-source "View Chunks" — opens the KB-level panel (MindsDB doesn't expose per-file chunk queries) */}
                        <button
                          onClick={() => openChunksPanel(kb._id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium hover:bg-[#8b5cf6]/15 transition-all"
                          style={{ color: '#8b5cf6' }}
                          title="View actual chunks stored in MindsDB vector DB"
                        >
                          <Eye className="w-3 h-3" /> View chunks
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.csv,.tsv,.xlsx,.xls,.txt,.md,.json,.parquet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadingKB) fetchLocalPreview(uploadingKB, file)
          e.target.value = ''
        }}
      />

      {/* Local approximate preview modal */}
      {localPreview && (
        <LocalPreviewModal
          data={localPreview}
          onConfirm={confirmUpload}
          onCancel={() => { setLocalPreview(null); setPreviewFile(null); setPreviewKbId(null) }}
          uploading={uploading}
        />
      )}

      {/* Actual chunks panel (live from MindsDB) */}
      {chunksPanel && <ActualChunksPanel data={chunksPanel} onClose={() => setChunksPanel(null)} />}

      {/* Original file content viewer */}
      {fileView && (fileView.isDocument
        ? <FileContentModal name={fileView.name} text={fileView.text} onClose={() => setFileView(null)} />
        : <DataTableModal title={fileView.name} subtitle="Original file contents" columns={fileView.columns} rows={fileView.rows} accent="#e94560" onClose={() => setFileView(null)} />
      )}

      {/* Extracting overlay */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card p-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 animate-spin text-[#e94560]" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Extracting text and estimating chunks…</span>
          </div>
        </div>
      )}

      {/* Uploading overlay */}
      {uploading && !localPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card p-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 animate-spin text-[#e94560]" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Uploading and embedding document…</span>
          </div>
        </div>
      )}

      {/* Loading chunks overlay */}
      {loadingChunks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card p-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 animate-spin text-[#8b5cf6]" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fetching chunks from MindsDB…</span>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Knowledge Base"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All associated documents and vector data will be permanently removed.`}
        confirmText="Delete KB"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
