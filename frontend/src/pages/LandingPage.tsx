import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChartColumn, BarChart3, MessageSquare, LayoutDashboard,
  Zap, Shield, ArrowRight, Sun, Moon, Database,
  Brain, Clock, Activity,
} from 'lucide-react'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

/* ── Scroll-reveal hook ─────────────────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

/* ── Data ───────────────────────────────────────────────────── */
const STATS = [
  { value: '90+', label: 'Data Sources' },
  { value: '25+', label: 'Chart Types' },
  { value: '3',   label: 'LLM Providers' },
  { value: '9',   label: 'Vector Stores' },
]

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Chat with your data',
    desc: 'Ask questions in plain English. AI agents translate them to SQL, execute against your live database, and stream results back instantly.',
    accent: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: BarChart3,
    title: '25+ chart types',
    desc: 'AI picks the perfect visualization automatically — bar, line, scatter, heatmap, treemap, gauge, funnel, radar, and more via AntV G2.',
    accent: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  {
    icon: LayoutDashboard,
    title: 'Drag & drop dashboards',
    desc: 'Build interactive dashboards with real-time filters, auto-refresh over WebSocket, multi-user sharing, and version history.',
    accent: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Database,
    title: '90+ data sources',
    desc: 'Connect any database, warehouse, SaaS, or file — PostgreSQL, MySQL, MongoDB, Snowflake, BigQuery, Stripe, HubSpot, GitHub, S3, and more.',
    accent: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Zap,
    title: 'Automated reports',
    desc: 'Schedule PDF/PPTX reports via cron, deliver by email, Telegram, or webhook. AI-generated executive summaries included.',
    accent: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
  {
    icon: Shield,
    title: 'Self-hosted & secure',
    desc: 'Your data stays on your servers. Credentials encrypted at rest with Fernet. No vendor lock-in, full control.',
    accent: 'text-rose-500',
    bg: 'bg-rose-500/10',
  },
]

const SOURCES = [
  'PostgreSQL', 'MySQL', 'MongoDB', 'Snowflake', 'BigQuery', 'Redshift',
  'ClickHouse', 'DuckDB', 'Stripe', 'HubSpot', 'Salesforce', 'GitHub',
  'Slack', 'Google Sheets', 'S3', 'Elasticsearch', 'InfluxDB', 'Databricks',
  'Shopify', 'Airtable', 'Notion', 'Jira', 'Dropbox', 'Supabase',
  'DynamoDB', 'Cassandra', 'MariaDB', 'Couchbase', 'Redis', 'Trino',
]

const STEPS = [
  {
    num: '01',
    title: 'Connect a data source',
    desc: 'Pick from 90+ connectors. Enter credentials in the UI — no config files, no YAML, no secrets in code.',
    icon: Database,
  },
  {
    num: '02',
    title: 'Create an AI agent',
    desc: 'Link your connection to an agent. Choose a LLM (Gemini, GPT-4o, Claude), set a prompt template, attach a knowledge base.',
    icon: Brain,
  },
  {
    num: '03',
    title: 'Chat, visualize, schedule',
    desc: 'Ask anything in plain English. Build dashboards from answers. Schedule automated reports to email, Telegram, or webhook.',
    icon: ChartColumn,
  },
]

/* ── Chart bars animation ───────────────────────────────────── */
const BAR_HEIGHTS = [38, 62, 44, 88, 55, 78, 48, 92]
const BAR_COLORS  = ['#3b82f6','#6366f1','#3b82f6','#6366f1','#3b82f6','#6366f1','#3b82f6','#6366f1']

export default function LandingPage() {
  const { isAuthenticated } = useAuth()
  const { theme, toggle } = useTheme()

  const featuresReveal = useReveal()
  const stepsReveal    = useReveal()
  const statsReveal    = useReveal()
  const ctaReveal      = useReveal()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border-color)] bg-[var(--bg-primary)]/90 backdrop-blur-md animate-fade-in">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center shadow-sm">
              <ChartColumn className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">OpenBI</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-lg flex items-center justify-center border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {isAuthenticated ? (
              <Link to="/projects" className="px-4 py-2 rounded-lg gradient-primary text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5">
                Go to Workspace <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all">
                  Sign In
                </Link>
                <Link to="/signup" className="px-4 py-2 rounded-lg gradient-primary text-sm font-medium transition-all hover:opacity-90">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">

        <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] mb-6">
            AI-Native · Self-Hosted · Open Source
          </span>
        </div>

        <h1
          className="animate-fade-up text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.08] mb-6"
          style={{ animationDelay: '0.12s' }}
        >
          The BI platform that<br className="hidden sm:block" />
          <span className="text-[var(--text-secondary)]"> understands your data.</span>
        </h1>

        <p
          className="animate-fade-up text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed"
          style={{ animationDelay: '0.2s' }}
        >
          Connect 90+ data sources, chat with AI agents, build interactive dashboards,
          and schedule smart reports — all without writing a single line of SQL.
        </p>

        <div
          className="animate-fade-up flex flex-col sm:flex-row items-center justify-center gap-3 mb-20"
          style={{ animationDelay: '0.28s' }}
        >
          <Link
            to={isAuthenticated ? '/projects' : '/signup'}
            className="w-full sm:w-auto px-6 py-3 rounded-xl gradient-primary text-base font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            Start Building Free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://github.com/narender-rk10/openbi"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 rounded-xl text-base font-medium bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-all flex items-center justify-center gap-2"
          >
            <GithubIcon className="w-4 h-4" />
            View on GitHub
          </a>
        </div>

        {/* ── Mock Dashboard ── */}
        <div
          className="animate-fade-up-slow relative rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.25)] bg-[var(--bg-secondary)]"
          style={{ animationDelay: '0.36s' }}
        >
          {/* Window chrome */}
          <div className="h-10 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center px-4 gap-2 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400/70" />
            <div className="w-3 h-3 rounded-full bg-amber-400/70" />
            <div className="w-3 h-3 rounded-full bg-green-400/70" />
            <div className="flex-1" />
            <div className="w-32 h-4 rounded-full bg-[var(--border-color)]" />
            <div className="flex-1" />
          </div>

          {/* Dashboard body */}
          <div className="flex h-[420px] sm:h-[500px]">
            {/* Sidebar */}
            <div className="hidden sm:flex w-14 border-r border-[var(--border-color)] bg-[var(--bg-primary)] flex-col items-center py-4 gap-3">
              {[ChartColumn, MessageSquare, LayoutDashboard, Database, Brain, Clock, Activity].map((Icon, i) => (
                <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${i === 0 ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3 shrink-0">
                {[
                  { label: 'Total Revenue', val: '$2.4M', trend: '+12%', up: true },
                  { label: 'Active Users',  val: '18,492', trend: '+8%', up: true },
                  { label: 'Churn Rate',    val: '2.1%', trend: '-0.3%', up: false },
                ].map((kpi, i) => (
                  <div key={i} className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-3">
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{kpi.label}</p>
                    <p className="text-base sm:text-lg font-bold text-[var(--text-primary)]">{kpi.val}</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${kpi.up ? 'text-emerald-500' : 'text-rose-500'}`}>{kpi.trend}</p>
                  </div>
                ))}
              </div>

              {/* Chart + table row */}
              <div className="flex gap-3 flex-1 min-h-0">
                {/* Bar chart */}
                <div className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Revenue by Month</p>
                    <div className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border-color)]">2024</div>
                  </div>
                  <div className="flex-1 flex items-end gap-1.5 pb-1">
                    {BAR_HEIGHTS.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm transition-all duration-1000"
                        style={{
                          height: `${h}%`,
                          background: BAR_COLORS[i],
                          opacity: 0.75 + (i % 2) * 0.15,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    {['Jan','Mar','May','Jul','Aug','Oct','Nov','Dec'].map(m => (
                      <span key={m} className="text-[8px] text-[var(--text-muted)]">{m}</span>
                    ))}
                  </div>
                </div>

                {/* Table preview */}
                <div className="hidden sm:flex w-44 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-3 flex-col gap-1.5">
                  <p className="text-[10px] font-semibold text-[var(--text-primary)] mb-1">Top Products</p>
                  {['Pro Plan','Enterprise','Starter','Add-ons'].map((name, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--text-secondary)]">{name}</span>
                      <span className="text-[10px] font-semibold text-[var(--text-primary)]">{['$820K','$640K','$490K','$230K'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Chat bar */}
              <div className="shrink-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-[var(--text-primary)] flex items-center justify-center shrink-0">
                  <ChartColumn className="w-3 h-3 text-[var(--bg-primary)]" />
                </div>
                <span className="text-xs text-[var(--text-muted)] flex-1">
                  Show me total revenue by region for Q3 2024...
                </span>
                <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <div ref={statsReveal.ref} className="border-y border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div
              key={i}
              className="text-center transition-all duration-700"
              style={{
                opacity: statsReveal.visible ? 1 : 0,
                transform: statsReveal.visible ? 'translateY(0)' : 'translateY(16px)',
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <p className="text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">{s.value}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <section ref={stepsReveal.ref} className="max-w-5xl mx-auto px-6 py-24">
        <div
          className="text-center mb-16 transition-all duration-700"
          style={{ opacity: stepsReveal.visible ? 1 : 0, transform: stepsReveal.visible ? 'none' : 'translateY(16px)' }}
        >
          <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-muted)] mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight">Up and running in minutes.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="relative transition-all duration-700"
              style={{
                opacity: stepsReveal.visible ? 1 : 0,
                transform: stepsReveal.visible ? 'translateY(0)' : 'translateY(24px)',
                transitionDelay: `${i * 120}ms`,
              }}
            >
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-8 left-full w-full h-px border-t border-dashed border-[var(--border-color)] z-0 -translate-x-4" />
              )}
              <div className="relative z-10 p-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)] transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">{step.num}</span>
                  <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center">
                    <step.icon className="w-4 h-4" />
                  </div>
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section ref={featuresReveal.ref} className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{ opacity: featuresReveal.visible ? 1 : 0, transform: featuresReveal.visible ? 'none' : 'translateY(16px)' }}
          >
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-muted)] mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight">Everything you need.</h2>
            <p className="text-base text-[var(--text-secondary)] mt-3 max-w-xl mx-auto">
              A complete analytics stack — without the sprawl.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--text-muted)] hover:shadow-[var(--shadow-md)] transition-all duration-300"
                style={{
                  opacity: featuresReveal.visible ? 1 : 0,
                  transform: featuresReveal.visible ? 'translateY(0)' : 'translateY(24px)',
                  transitionDelay: `${i * 80}ms`,
                  transition: `opacity 0.6s ease ${i * 80}ms, transform 0.6s ease ${i * 80}ms, border-color 0.2s, box-shadow 0.2s`,
                }}
              >
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <f.icon className={`w-5 h-5 ${f.accent}`} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Data sources marquee ─────────────────────────────── */}
      <section className="py-16 border-t border-[var(--border-color)] overflow-hidden">
        <p className="text-center text-xs font-bold tracking-widest uppercase text-[var(--text-muted)] mb-8">
          Connect to 90+ data sources
        </p>
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-[var(--bg-primary)] to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-[var(--bg-primary)] to-transparent pointer-events-none" />

          <div className="flex animate-marquee whitespace-nowrap">
            {[...SOURCES, ...SOURCES].map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center mx-3 px-4 py-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm font-medium text-[var(--text-secondary)] shrink-0"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section ref={ctaReveal.ref} className="border-t border-[var(--border-color)] py-24">
        <div
          className="max-w-3xl mx-auto px-6 text-center transition-all duration-700"
          style={{ opacity: ctaReveal.visible ? 1 : 0, transform: ctaReveal.visible ? 'none' : 'translateY(20px)' }}
        >
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[var(--text-primary)] tracking-tight mb-5">
            Ready to talk to your data?
          </h2>
          <p className="text-lg text-[var(--text-secondary)] mb-10">
            Deploy in minutes with Docker Compose. No cloud account required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={isAuthenticated ? '/projects' : '/signup'}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl gradient-primary text-base font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Get Started — It's Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/narender-rk10/openbi"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base font-medium bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-all flex items-center justify-center gap-2"
            >
              <GithubIcon className="w-4 h-4" />
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center">
              <ChartColumn className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">OpenBI</span>
            <span className="text-xs text-[var(--text-muted)] ml-1">AI-Native BI</span>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} OpenBI · CC BY-NC-ND 4.0 · Built by{' '}
            <a href="https://github.com/narender-rk10" className="hover:text-[var(--text-secondary)] transition-colors underline underline-offset-2">
              Narender Keswani
            </a>
          </p>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/narender-rk10/openbi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <GithubIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
