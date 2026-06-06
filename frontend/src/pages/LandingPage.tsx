import { Link } from 'react-router-dom'
import { BarChart3, MessageSquare, LayoutDashboard, Zap, Globe2, Shield, ArrowRight, ChevronRight, Sun, Moon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

const features = [
  { icon: MessageSquare, title: 'Chat with your data', desc: 'Ask questions in plain English. AI agents query your databases and return answers instantly.' },
  { icon: BarChart3, title: '25+ chart types', desc: 'AI picks the perfect visualization. Bar, line, scatter, heatmap, treemap, gauge, and more.' },
  { icon: LayoutDashboard, title: 'Drag & drop dashboards', desc: 'Build interactive dashboards with real-time filters, auto-refresh, and multi-user collaboration.' },
  { icon: Globe2, title: '200+ data sources', desc: 'Connect any database, API, or file. PostgreSQL, MySQL, MongoDB, Snowflake, S3, Google Sheets.' },
  { icon: Zap, title: 'Automated reports', desc: 'Schedule PDF reports, deliver via email or Telegram, with AI-generated executive summaries.' },
  { icon: Shield, title: 'Self-hosted & secure', desc: 'Your data stays on your servers. No vendor lock-in. Full control over credentials.' },
]

export default function LandingPage() {
  const { isAuthenticated } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--bg-primary)]">

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto animate-fade-in border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center shadow-sm">
            <BarChart3 className="w-5 h-5 text-[var(--text-primary)]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            OpenBI
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] shadow-sm bg-[var(--bg-primary)]"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {isAuthenticated ? (
            <Link
              to="/projects"
              className="px-5 py-2.5 rounded-lg gradient-primary text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2"
            >
              Go to Workspace
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:block px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-color)]"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2.5 rounded-lg gradient-primary text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 shadow-sm"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pt-20 pb-24 text-center animate-fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] mb-8 shadow-sm">
          High-performance analytics
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight mb-6 text-[var(--text-primary)]">
          The BI platform that <br className="hidden sm:block" /> understands your data.
        </h1>
        
        <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed text-[var(--text-secondary)]">
          Connect databases, chat with AI agents, build stunning dashboards, and schedule smart reports — all without writing a single line of SQL.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={isAuthenticated ? '/projects' : '/signup'}
            className="w-full sm:w-auto px-6 py-3 rounded-xl gradient-primary font-medium text-base hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            Start Building
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://github.com/openbi"
            target="_blank"
            rel="noopener"
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-medium text-base bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] transition-all hover:border-[var(--border-highlight)] shadow-sm flex items-center justify-center gap-2"
          >
            View on GitHub
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          </a>
        </div>

        {/* Mock dashboard visual */}
        <div className="mt-20 relative max-w-4xl mx-auto">
          <div className="relative rounded-xl p-1 bg-[var(--border-color)] shadow-[var(--shadow-lg)] transform transition-transform duration-700 hover:scale-[1.01]">
            <div className="rounded-lg overflow-hidden h-[350px] sm:h-[500px] flex flex-col bg-[var(--bg-secondary)] relative">
              
              {/* Mock Topbar */}
              <div className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center px-4 gap-3">
                <div className="w-24 h-4 rounded bg-[var(--border-color)]" />
                <div className="w-16 h-4 rounded bg-[var(--border-color)] ml-auto" />
                <div className="w-6 h-6 rounded-full bg-[var(--border-color)]" />
              </div>
              
              {/* Mock Content */}
              <div className="flex-1 p-6 flex flex-col gap-4">
                <div className="flex gap-4 h-1/2">
                  <div className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col justify-end gap-2">
                    <div className="w-full h-2/3 flex items-end justify-between gap-1">
                      {[40, 70, 45, 90, 60, 85].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t-sm bg-blue-600/80" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className="w-1/3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col gap-3">
                    <div className="w-full h-4 rounded bg-[var(--border-color)]" />
                    <div className="w-3/4 h-8 rounded bg-[var(--text-primary)] opacity-10" />
                    <div className="w-1/2 h-4 rounded bg-[var(--border-color)] mt-auto" />
                  </div>
                </div>
                <div className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4">
                  <div className="w-[150px] h-4 rounded bg-[var(--border-color)] mb-4" />
                  <div className="w-full h-full flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex-1 rounded bg-[var(--border-color)] opacity-50" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-32 pt-10 border-t border-[var(--border-color)]">
        <div className="text-center max-w-2xl mx-auto mb-16 mt-10">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Everything you need.
          </h2>
          <p className="text-base text-[var(--text-secondary)]">
            Powered by modern infrastructure. Sleek, fast, and entirely collaborative.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="p-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)] transition-colors shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-[var(--text-primary)]" />
              </div>
              <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] py-8 px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--text-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">OpenBI</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} OpenBI Platform. Open source.
          </p>
          <div className="flex gap-4">
            <a href="#" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><Globe2 className="w-4 h-4" /></a>
            <a href="https://github.com/openbi" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><Shield className="w-4 h-4" /></a>
          </div>
        </div>
      </footer>
    </div>
  )
}
