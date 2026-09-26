import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types/database'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  mustChangePassword: boolean
  // Message shown on the login page after a forced sign-out (e.g. deactivated account)
  authNotice: string | null
  signIn: (username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Please contact your admin.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Deactivated accounts are signed out immediately (also covers sessions that were already open)
    if (data && data.is_active === false) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setMustChangePassword(false)
      setAuthNotice(DEACTIVATED_MESSAGE)
      setLoading(false)
      return
    }

    setProfile(data as Profile | null)
    setMustChangePassword(data?.must_change_password ?? false)
    setLoading(false)
  }

  async function signIn(username: string, password: string) {
    setAuthNotice(null)
    // Use email format for Supabase auth: username@ksmn.local
    const email = `${username}@ksmn.local`
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) return { error: error.message }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .single()
    if (profileData && profileData.is_active === false) {
      await supabase.auth.signOut()
      return { error: DEACTIVATED_MESSAGE }
    }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setMustChangePassword(false)
  }

  async function updatePassword(newPassword: string) {
    if (!user) return { error: 'No user logged in' }
    
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) return { error: error.message }

    // Clear the must_change_password flag
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return { error: updateError.message }
    }

    setMustChangePassword(false)
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      mustChangePassword,
      authNotice,
      signIn,
      signOut,
      updatePassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}