import React, { createContext, useContext, useState, useEffect } from 'react'

interface LayoutContextType {
  isSidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  isDashboardFullView: boolean
  setDashboardFullView: (fullView: boolean) => void
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    const saved = localStorage.getItem('openbi_sidebar_collapsed')
    return saved === 'true'
  })

  const [isDashboardFullView, setDashboardFullView] = useState<boolean>(false)

  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed)
    localStorage.setItem('openbi_sidebar_collapsed', String(collapsed))
  }

  // Handle ESC key to exit dashboard full view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDashboardFullView) {
        setDashboardFullView(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDashboardFullView])

  return (
    <LayoutContext.Provider
      value={{
        isSidebarCollapsed,
        setSidebarCollapsed,
        isDashboardFullView,
        setDashboardFullView,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}
