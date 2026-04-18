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
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        alert("Account created! Open Mailpit at http://localhost:54324 to confirm your email before signing in.")
        toast.success("Account created! Open Mailpit at http://localhost:54324 to confirm your email before signing in.", {
          duration: 10000
        })
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
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
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mb-6">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400 tracking-tight">
          Nexus Deckbuilder
        </h1>
        <p className="text-zinc-400 mt-2 text-lg">Next-gen MTG companion powered by AI.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <Card className="bg-zinc-900/50 border-white/10 backdrop-blur-xl shadow-2xl shadow-black/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">Welcome back</CardTitle>
            <CardDescription className="text-zinc-400">Sign in to your account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <Input 
                type="email" 
                placeholder="Email address" 
                className="pl-9 bg-black/40 border-white/10 text-zinc-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2 relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <Input 
                type="password" 
                placeholder="Password" 
                className="pl-9 bg-black/40 border-white/10 text-zinc-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button 
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white" 
                onClick={() => handleAuth('login')}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Sign In'}
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 border-white/10 hover:bg-white/5 text-zinc-300"
                onClick={() => handleAuth('signup')}
                disabled={loading}
              >
                Sign Up
              </Button>
            </div>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900 px-2 text-zinc-500">Or continue with</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full border-white/10 hover:bg-white/5 text-zinc-300"
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
