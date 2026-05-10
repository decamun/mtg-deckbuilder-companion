'use client'

import { useState } from 'react'
import { Mail, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface Props {
  clientName: string
}

/**
 * Inline sign-in for the OAuth authorize page. We can't use the existing
 * LoginDialog because it hard-redirects to /brew on success; here we want to
 * stay on the same URL so the server component re-renders the consent screen.
 */
export function AuthorizeLoginRequired({ clientName }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password })
      if (error) throw error
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sign in to your idlebrew account to authorize{' '}
        <span className="font-medium text-foreground">{clientName}</span>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs">
          Email
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs">
          Password
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            className="pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Button>
      </div>
    </form>
  )
}
