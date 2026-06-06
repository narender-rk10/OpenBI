import { Link, useLocation, useParams } from 'react-router-dom'
import { BarChart3, MessageSquare, LayoutDashboard, Settings, FolderOpen, Database, Brain, Bot, Clock, Activity, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLayout } from '../../lib/layout'
import { useBranding } from '../../lib/branding'

const NAV_ITEMS = [
  { label: 'Projects', icon: FolderOpen, path: '/projects', requiresProject: false },
]

const PROJECT_NAV = [
  { label: 'Chat', icon: MessageSquare, path: 'chat' },
  { label: 'Data Sources', icon: Database, path: 'connections' },
  { label: 'Knowledge', icon: Brain, path: 'knowledge-bases' },
  { label: 'Agents', icon: Bot, path: 'agents' },
  { label: 'Dashboards', icon: LayoutDashboard, path: 'dashboards' },
  { label: 'Schedules', icon: Clock, path: 'schedules' },
  { label: 'Analytics', icon: Activity, path: 'analytics' },
]

export default function Sidebar() {
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { isSidebarCollapsed, setSidebarCollapsed } = useLayout()
  const { logoUrl, title, description } = useBranding()

  return (
    <div
      className={cn(
        "shrink-0 transition-all duration-300 ease-in-out relative z-20 m-4 mr-0",
        isSidebarCollapsed ? "w-[72px]" : "w-60"
      )}
    >
      <aside
        className={cn(
          "absolute top-0 bottom-0 left-0 h-full flex flex-col glass rounded-2xl overflow-hidden transition-all duration-300 ease-in-out group border border-[var(--border-color)]/30",
          isSidebarCollapsed 
            ? "w-[72px] hover:w-[240px] hover:shadow-2xl hover:shadow-black/50" 
            : "w-60"
        )}
      >
        {/* Dynamic Top Fade */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[var(--bg-card)] to-transparent pointer-events-none z-10" />

        {/* Logo and Collapse Toggle */}
        <div className={cn(
          "relative z-20 p-6 pb-2 flex items-center transition-all duration-300", 
          isSidebarCollapsed ? "px-2.5 justify-center group-hover:justify-between group-hover:px-6" : "px-6 justify-between"
        )}>
          <Link to="/projects" className="flex items-center group/logo shrink-0 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center shadow-md transition-transform duration-300 group-hover/logo:scale-105 shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <BarChart3 className="w-5 h-5" />
              )}
            </div>
            <div className={cn(
              "overflow-hidden transition-all duration-300 flex flex-col justify-center min-w-0",
              isSidebarCollapsed
                ? "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-3"
                : "opacity-100 max-w-[150px] ml-3"
            )}>
              <span className="text-xl font-bold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{title}</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">{description}</p>
            </div>
          </Link>
          
          {isSidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all hidden group-hover:block shrink-0"
              title="Pin Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all shrink-0"
              title="Collapse Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "flex-1 pt-6 space-y-2 overflow-y-auto relative z-20 custom-scrollbar",
            isSidebarCollapsed ? "px-2.5 py-4 group-hover:p-4" : "p-4"
          )}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center py-3 rounded-lg text-sm font-semibold transition-all duration-200 relative group/item overflow-hidden',
                  isSidebarCollapsed 
                    ? 'px-3 justify-center group-hover:justify-start group-hover:px-4' 
                    : 'px-4',
                  isActive
                    ? 'bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border-color)]'
                )}
              >
                <item.icon className={cn("w-5 h-5 relative z-10 transition-transform duration-300 text-[var(--text-primary)] shrink-0", isActive ? "" : "group-hover/item:scale-110")} />
                <span className={cn(
                  "relative z-10 whitespace-nowrap overflow-hidden transition-all duration-300",
                  isSidebarCollapsed
                    ? "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-3"
                    : "opacity-100 max-w-[150px] ml-3"
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* Project-scoped nav */}
          {projectId && (
            <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
              <div className="pt-6 pb-2 px-4 flex items-center gap-2">
                <div className="flex-1 h-px bg-[var(--border-color)]" />
                <p className={cn(
                  "text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] overflow-hidden transition-all duration-300 whitespace-nowrap",
                  isSidebarCollapsed ? "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[100px]" : "opacity-100 max-w-[100px]"
                )}>
                  Project
                </p>
                <div className="flex-1 h-px bg-[var(--border-color)]" />
              </div>
              <div className="space-y-1">
                {PROJECT_NAV.map((item) => {
                  const fullPath = `/projects/${projectId}/${item.path}`
                  const isActive = location.pathname.startsWith(fullPath)
                  return (
                    <Link
                      key={item.path}
                      to={fullPath}
                      className={cn(
                        'flex items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group/item',
                        isSidebarCollapsed 
                          ? 'px-3 justify-center group-hover:justify-start group-hover:px-4' 
                          : 'px-4',
                        isActive
                          ? 'text-[var(--text-primary)] bg-[var(--border-highlight)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/50'
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-[#e94560] shadow-[0_0_10px_#e94560]" />
                      )}
                      <item.icon className={cn("w-4.5 h-4.5 transition-transform duration-300 shrink-0", isActive ? "text-[#e94560]" : "group-hover/item:scale-110")} />
                      <span className={cn(
                        "whitespace-nowrap overflow-hidden transition-all duration-300",
                        isSidebarCollapsed
                          ? "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-3"
                          : "opacity-100 max-w-[150px] ml-3"
                      )}>
                        {item.label}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Settings */}
        <div className={cn("relative z-20", isSidebarCollapsed ? "px-2.5 py-4 group-hover:p-4" : "p-4")}>
          <Link
            to="/settings"
            className={cn(
              'flex items-center py-3 rounded-xl text-sm font-medium transition-all duration-300 group/item hover:background-[var(--border-color)]',
              isSidebarCollapsed 
                ? 'px-3 justify-center group-hover:justify-start group-hover:px-4' 
                : 'px-4',
              location.pathname === '/settings' ? 'text-[var(--text-primary)] bg-[var(--border-highlight)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/80'
            )}
          >
            <Settings className="w-5 h-5 transition-transform duration-300 group-hover/item:rotate-90 group-hover/item:text-[var(--text-primary)] shrink-0" />
            <span className={cn(
              "whitespace-nowrap overflow-hidden transition-all duration-300",
              isSidebarCollapsed
                ? "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-3"
                : "opacity-100 max-w-[150px] ml-3"
            )}>
              Settings
            </span>
          </Link>
        </div>
      </aside>
    </div>
  )
}
