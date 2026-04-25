"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, Lock, Component, ArrowLeft } from "lucide-react"
import { IdlebrewLogo } from "@/components/IdlebrewLogo"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type Mode = 'auth' | 'forgot'

export default function Splash() {
  const [mode, setMode] = useState<Mode>('auth')
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleAuth = async (action: 'login' | 'signup') => {
    setLoading(true)
    try {
      if (action === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/decks')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success("Account created! Check your email to confirm your account.", { duration: 8000 })
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Please enter your email address")
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
      toast.success("Password reset email sent! Check your inbox.", { duration: 8000 })
      setMode('auth')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) toast.error(error.message)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary/30">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <IdlebrewLogo className="h-10 w-auto text-foreground" />
          <h1 className="text-4xl font-extrabold text-foreground tracking-tight">
            idlebrew
          </h1>
        </div>
        <p className="text-muted-foreground mt-2 text-lg">AI-powered deck brewing for Magic: The Gathering.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <Card className="bg-card/50 border-border backdrop-blur-xl shadow-2xl shadow-black/50">
          {mode === 'auth' ? (
            <>
              <CardHeader>
                <CardTitle className="text-foreground">Welcome back</CardTitle>
                <CardDescription className="text-muted-foreground">Sign in to your account to continue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email address"
                    className="pl-9 bg-background/50 border-border text-foreground"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Password"
                    className="pl-9 bg-background/50 border-border text-foreground"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="flex gap-3 pt-1">
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => handleAuth('login')}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Sign In'}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-border hover:bg-accent hover:text-accent-foreground text-foreground"
                    onClick={() => handleAuth('signup')}
                    disabled={loading}
                  >
                    Sign Up
                  </Button>
                </div>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-border hover:bg-accent hover:text-accent-foreground text-foreground"
                  onClick={handleOAuth}
                >
                  <Component className="w-4 h-4 mr-2" />
                  Google
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-foreground">Forgot Password</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Enter your email and we&apos;ll send you a reset link.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email address"
                    className="pl-9 bg-background/50 border-border text-foreground"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleForgotPassword}
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send Reset Email'}
                </Button>
                <button
                  type="button"
                  onClick={() => setMode('auth')}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors w-full justify-center pt-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </CardContent>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
