/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Auth ──
export interface User {
  _id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'member'
  org_id: string
  is_active: boolean
  preferences: { theme: string; default_project_id: string | null }
  telegram_id?: string
  created_at: string
  last_login_at: string | null
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

// ── Projects ──
export interface Project {
  _id: string
  name: string
  description: string
  org_id: string
  created_by: string
  mindsdb_project_name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Connections ──
export interface Connection {
  _id: string
  project_id: string
  name: string
  engine: string
  category: string
  mindsdb_db_name: string
  connection_params: Record<string, any>
  status: string
  tables: string[]
  last_synced_at: string
  created_at: string
}

// ── Knowledge Bases ──
export interface VectorStoreConfig {
  type: string
  params: Record<string, string>
  mindsdb_db_name?: string
}

export interface KnowledgeBase {
  _id: string
  project_id: string
  name: string
  mindsdb_kb_name: string
  sources: KBSource[]
  vector_store?: VectorStoreConfig
  created_at: string
}

export interface KBSource {
  type: 'file' | 'url'
  name?: string
  url?: string
  file_id?: string
  status: string
  added_at: string
}

// ── Agents ──
export interface Agent {
  _id: string
  project_id: string
  name: string
  description: string
  icon: string
  mindsdb_agent_name: string
  model_config: Record<string, any>
  skills: AgentSkill[]
  prompt_template: string
  created_at: string
}

export interface AgentSkill {
  name: string
  type: 'text2sql' | 'knowledge_base'
  connection_id?: string
  kb_id?: string
  tables?: string[]
  description: string
}

// ── Chat ──
export interface ChatSession {
  _id: string
  project_id: string
  user_id: string
  title: string
  agent_id: string | null
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agent_name?: string
  sql_query?: string
  data?: { columns: string[]; rows: any[][] }
  chart_config?: AnyChartConfig | null
  table_config?: any
  timestamp: string
  isStreaming?: boolean
}

// ── Charts ──

/** AntV G2 chart specification produced by the Chart Agent. */
export interface G2ChartConfig {
  chart_type: string
  g2_spec: {
    type: string
    data?: any[]
    encode?: {
      x?: string
      y?: string
      color?: string
      size?: string | number
      shape?: string
      [key: string]: any
    }
    transform?: any[]
    coordinate?: { type?: string; outerRadius?: number; [key: string]: any }
    scale?: Record<string, any>
    axis?: { x?: any; y?: any; [key: string]: any }
    legend?: any
    title?: string | { title?: string; style?: any }
    style?: any
    theme?: any
    [key: string]: any
  }
  reasoning?: string
}

/** @deprecated Use G2ChartConfig. Kept for backward compatibility with old widgets. */
export interface PlotlyChartConfig {
  chart_type: string
  plotly_data: any[]
  plotly_layout: any
  plotly_config: any
  reasoning?: string
}

/** Union of both chart config formats — new G2 or legacy Plotly. */
export type AnyChartConfig = G2ChartConfig | PlotlyChartConfig

// ── Dashboards ──
export interface Dashboard {
  _id: string
  project_id: string
  user_id: string
  name: string
  description: string
  is_shared: boolean
  global_filters: DashboardFilter[]
  auto_refresh: { enabled: boolean; interval_seconds: number }
  widgets?: Widget[]
  created_at: string
  updated_at: string
}

export interface Widget {
  _id: string
  dashboard_id: string
  widget_id: string
  source_type: 'chat' | 'manual'
  data_binding: Record<string, any>
  display_type: 'chart' | 'table' | 'kpi' | 'ai_summary'
  chart_config?: AnyChartConfig | null
  table_config?: any
  position: { x: number; y: number; w: number; h: number }
  title: string
  cached_data?: { columns: string[]; rows: any[][]; fetched_at: string }
  cached_text?: string
  created_at: string
}

export interface DashboardFilter {
  id: string
  column: string
  type: 'select' | 'multi_select' | 'date_range' | 'number_range' | 'search'
  options: any
  current_value: any
  bound_widget_ids: string[]
}

// ── Schedules ──
export interface Schedule {
  _id: string
  project_id: string
  /** Re-runs the dashboard's queries on schedule and delivers a snapshot */
  dashboard_id?: string | null
  name: string
  cron: string
  parameters: Record<string, any>
  delivery: Record<string, any>
  is_active: boolean
  last_run_at: string | null
  last_run_status: string | null
  last_run_error?: string | null
  next_run_at: string | null
  created_at: string
}

// ── Settings ──
export interface OrgSettings {
  org_name: string
  settings: {
    llm_provider: string
    llm_model: string
    llm_api_key_masked: string
    branding: {
      primary_color: string
      secondary_color: string
      accent_color: string
      chart_palette: string[]
      logo_url: string | null
      title?: string | null
      description?: string | null
    }
    smtp?: {
      host?: string
      port?: number
      username?: string
      from_addr?: string
      password_masked?: string
    }
  }
}

// ── Source Catalog ──
export interface SourceDefinition {
  name: string
  engine: string
  category: string
  icon: string
  fields: SourceField[]
}

export interface SourceField {
  name: string
  label: string
  type: 'text' | 'password' | 'number' | 'textarea' | 'file'
  required: boolean
  placeholder?: string
}
