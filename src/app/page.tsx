"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Layers, Mail, Lock, LogIn, Component } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const AUTH_CALLBACK_PATH = "/auth/callback"

export default function Splash() {
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
          },
        })
        if (error) throw error
        toast.success("Account created! Check your email to confirm your account.", {
          duration: 10000
        })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Enter your email first.")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}?next=/auth/reset-password`,
      })
      if (error) throw error

      toast.success("Password reset email sent. Check your inbox.")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred"
      toast.error(message)
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
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent flex items-center justify-center shadow-2xl shadow-primary/30 mb-6">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-foreground tracking-tight">
          Nexus Deckbuilder
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">Next-gen MTG companion powered by AI.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <Card className="bg-card/50 border-border backdrop-blur-xl shadow-2xl shadow-black/50">
          <CardHeader>
            <CardTitle className="text-foreground">Welcome back</CardTitle>
            <CardDescription className="text-muted-foreground">Sign in to your account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input 
                type="email" 
                placeholder="Email address" 
                className="pl-9 bg-background/50 border-border text-foreground"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2 relative">
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
              <Button
                variant="link"
                className="px-0 h-auto text-muted-foreground hover:text-foreground"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Forgot password?
              </Button>
            </div>
            <div className="flex gap-3 pt-2">
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
        </Card>
      </motion.div>
    </div>
  )
}
