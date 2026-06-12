import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import api from './api'

interface BrandingContextType {
  logoUrl: string | null
  title: string
  description: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  refreshBranding: () => Promise<void>
  isLoadingBranding: boolean
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('OpenBI')
  const [description, setDescription] = useState('AI-Native BI')
  const [primaryColor, setPrimaryColor] = useState('#1a1a2e')
  const [secondaryColor, setSecondaryColor] = useState('#e94560')
  const [accentColor, setAccentColor] = useState('#0f3460')
  const [isLoadingBranding, setIsLoadingBranding] = useState(false)

  const fetchBranding = async () => {
    if (!isAuthenticated) return
    setIsLoadingBranding(true)
    try {
      const { data } = await api.get('/api/settings')
      const branding = data?.settings?.branding
      if (branding) {
        setLogoUrl(branding.logo_url || null)
        setTitle(branding.title || 'OpenBI')
        setDescription(branding.description || 'AI-Native BI')
        setPrimaryColor(branding.primary_color || '#1a1a2e')
        setSecondaryColor(branding.secondary_color || '#e94560')
        setAccentColor(branding.accent_color || '#0f3460')
      }
    } catch (error) {
      console.error('Failed to fetch branding settings:', error)
    } finally {
      setIsLoadingBranding(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchBranding()
    } else {
      // Reset to defaults on logout
      setLogoUrl(null)
      setTitle('OpenBI')
      setDescription('AI-Native BI')
      setPrimaryColor('#1a1a2e')
      setSecondaryColor('#e94560')
      setAccentColor('#0f3460')
    }
  }, [isAuthenticated])

  return (
    <BrandingContext.Provider
      value={{
        logoUrl,
        title,
        description,
        primaryColor,
        secondaryColor,
        accentColor,
        refreshBranding: fetchBranding,
        isLoadingBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const ctx = useContext(BrandingContext)
  if (ctx === undefined) {
    throw new Error('useBranding must be used within BrandingProvider')
  }
  return ctx
}
