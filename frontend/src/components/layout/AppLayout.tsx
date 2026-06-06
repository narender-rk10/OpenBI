import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useLayout } from '../../lib/layout'

export default function AppLayout() {
  const { isDashboardFullView } = useLayout()

  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: 'var(--bg-primary)' }}>
      {/* Background ambient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-1000">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] gradient-orb rounded-full animate-float blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] gradient-orb rounded-full animate-float blur-[120px]" style={{ animationDelay: '-3s' }} />
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full h-full">
        {!isDashboardFullView && <Sidebar />}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {!isDashboardFullView && <Topbar />}
          <main 
            className={`flex-1 overflow-auto animate-fade-in transition-all duration-300 ${
              isDashboardFullView ? 'p-0' : 'p-6 md:p-8'
            }`} 
            style={{ background: 'transparent' }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

