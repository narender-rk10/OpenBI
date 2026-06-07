import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChartColumn, Mail, Lock, User, Building2, AlertCircle, Sun, Moon, ArrowLeft } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signup } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(email, password, name, orgName)
      navigate('/projects')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[var(--bg-primary)]">
      
      {/* Top Nav Bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-50 animate-fade-in">
        <Link 
          to="/" 
          className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        {/* Theme Toggle */}
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] shadow-sm bg-[var(--bg-primary)]"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-[400px] animate-fade-up z-10 pb-12">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm">
            <ChartColumn className="w-6 h-6 text-[var(--text-primary)]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">Create an account</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--text-primary)] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Form Card */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] p-8 rounded-2xl shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Full Name</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--text-primary)] transition-colors" />
                <input
                  id="signup-name"
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)]"
                  placeholder="Jane Doe" required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Organization</label>
              <div className="relative group">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--text-primary)] transition-colors" />
                <input
                  id="signup-org"
                  type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)]"
                  placeholder="Acme Inc." required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Work Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--text-primary)] transition-colors" />
                <input
                  id="signup-email"
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)]"
                  placeholder="you@company.com" required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--text-primary)] transition-colors" />
                <input
                  id="signup-password"
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)]"
                  placeholder="••••••••" required minLength={6}
                />
              </div>
            </div>

            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-4 rounded-lg gradient-primary font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          By signing up, you agree to our Terms of Service.
        </p>
      </div>
    </div>
  )
}
