import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { Flag, User, CheckCircle, Loader, AlertCircle } from 'lucide-react'
import { useJoinQueue } from '../hooks/useQueue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Footer } from '@/components/Footer'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const [playerName, setPlayerName] = useState('')
  const [countdown, setCountdown] = useState(10)
  const inputRef = useRef<HTMLInputElement>(null)
  const joinQueueMutation = useJoinQueue()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (playerName.trim().length >= 1 && playerName.trim().length <= 50) {
      joinQueueMutation.mutate(playerName.trim())
    }
  }

  const handleReset = () => {
    setPlayerName('')
    setCountdown(10)
    joinQueueMutation.reset()
  }

  const isSuccess = joinQueueMutation.isSuccess
  const isLoading = joinQueueMutation.isPending
  const isError = joinQueueMutation.isError

  // Auto-redirect countdown when success
  useEffect(() => {
    if (isSuccess) {
      setCountdown(10)
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            handleReset()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [isSuccess])

  // Auto-focus input when form is shown
  useEffect(() => {
    if (!isSuccess && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isSuccess])

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-red-950/30 to-slate-900 text-white flex flex-col relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-3xl animate-pulse [animation-delay:1000ms]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-500/5 rounded-full blur-3xl" />
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl w-full relative z-10 my-4">
        {/* Success State */}
        {isSuccess && joinQueueMutation.data && (
          <Card className="bg-slate-900/80 backdrop-blur-xl border-emerald-500 border-2 text-center shadow-2xl shadow-emerald-500/20">
            <CardContent className="pt-8 pb-8 px-6 md:px-10">
              <CheckCircle className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
              <h1 className="text-3xl md:text-4xl font-extrabold mb-3 text-emerald-400 leading-tight tracking-tight">
                You're In!
              </h1>
              <p className="text-lg md:text-xl text-slate-300 mb-6 leading-relaxed">
                Welcome to the track, <span className="font-bold text-white bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">{playerName}</span>
              </p>

              <div className="bg-slate-950/60 rounded-2xl p-4 md:p-6 mb-6 border border-slate-700/50 hover:border-slate-600/50 transition-all backdrop-blur-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 text-center">
                  <div className="py-4 px-4 rounded-xl bg-slate-800/40 group hover:scale-105 hover:bg-slate-800/60 transition-all duration-300">
                    <p className="text-slate-400 text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Your Rig</p>
                    <p className="text-5xl md:text-6xl font-black text-red-500 group-hover:text-red-400 transition-colors drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                      #{joinQueueMutation.data.rigId}
                    </p>
                  </div>
                  <div className="py-4 px-4 rounded-xl bg-slate-800/40 group hover:scale-105 hover:bg-slate-800/60 transition-all duration-300">
                    <p className="text-slate-400 text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Position</p>
                    <p className="text-5xl md:text-6xl font-black text-amber-500 group-hover:text-amber-400 transition-colors drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                      {joinQueueMutation.data.queuePosition === 0 
                        ? 'Next!' 
                        : `#${joinQueueMutation.data.queuePosition}`}
                    </p>
                  </div>
                  <div className="py-4 px-4 rounded-xl bg-slate-800/40 group hover:scale-105 hover:bg-slate-800/60 transition-all duration-300">
                    <p className="text-slate-400 text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Player ID</p>
                    <p className="text-sm md:text-base font-mono text-slate-300 mt-2 break-all leading-relaxed group-hover:text-white transition-colors">
                      {joinQueueMutation.data.playerId}
                    </p>
                  </div>
                </div>
              </div>

              <Alert className="bg-amber-500/10 border-amber-500/40 border mb-6 p-4 md:p-5 rounded-xl backdrop-blur-sm">
                <AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-amber-400" />
                <div className="text-amber-200 text-sm md:text-base leading-relaxed">
                  <strong className="text-base md:text-lg font-bold block mb-1">Next Steps</strong>
                  <p>Head to <span className="font-bold text-amber-100">Rig #{joinQueueMutation.data.rigId}</span> and wait for your turn. The rig operator will call you when it's time to race!</p>
                </div>
              </Alert>

              <Button
                onClick={handleReset}
                size="lg"
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:from-red-700 active:to-red-800 text-white font-bold text-base md:text-lg py-5 px-8 h-auto min-h-[50px] w-full md:w-auto touch-manipulation hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-red-500/50 rounded-xl"
              >
                Register Another Player ({countdown}s)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Registration Form */}
        {!isSuccess && (
          <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-700/50 border-2 shadow-2xl shadow-red-500/10 hover:border-slate-600/50 transition-all">
            <CardHeader className="text-center pt-12 pb-8">
              <Flag className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
              <CardTitle className="text-4xl md:text-5xl text-white font-extrabold leading-tight tracking-tight">Join the Race</CardTitle>
              <CardDescription className="text-slate-400 text-lg md:text-xl mt-3 font-medium">
                Enter your name to get in the queue
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 md:px-10 pb-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="playerName"
                    className="block text-sm md:text-base font-bold text-slate-300 mb-3 uppercase tracking-widest"
                  >
                    Driver Name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5 md:w-6 md:h-6 z-10 group-focus-within:text-red-400 transition-colors duration-300" />
                    <Input
                      ref={inputRef}
                      type="text"
                      id="playerName"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Enter your name"
                      minLength={1}
                      maxLength={50}
                      required
                      disabled={isLoading}
                      className="pl-14 md:pl-16 pr-5 py-6 md:py-7 bg-slate-950/60 border-slate-700 border-2 text-white placeholder-slate-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 text-xl md:text-2xl h-auto rounded-xl touch-manipulation transition-all duration-300 hover:border-slate-600 focus:scale-[1.02] font-medium backdrop-blur-sm"
                    />
                  </div>
                  <p className="text-sm md:text-base text-slate-500 mt-3 leading-relaxed">
                    1-50 characters • This name will appear on the leaderboards
                  </p>
                </div>

                {isError && (
                  <Alert className="bg-red-500/10 border-red-500/50 border p-5 rounded-xl backdrop-blur-sm">
                    <AlertCircle className="h-6 w-6 md:h-7 md:w-7 text-red-400" />
                    <div>
                      <p className="font-bold text-red-400 text-lg md:text-xl">Registration Failed</p>
                      <p className="text-base md:text-lg text-slate-300 mt-1 leading-relaxed">
                        {joinQueueMutation.error?.message || 'An error occurred. Please try again.'}
                      </p>
                    </div>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={
                    isLoading ||
                    playerName.trim().length < 1 ||
                    playerName.trim().length > 50
                  }
                  className="w-full py-6 md:py-7 h-auto min-h-[70px] bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:from-red-700 active:to-red-800 disabled:from-slate-700 disabled:to-slate-800 disabled:opacity-50 text-white font-bold text-xl md:text-2xl rounded-xl touch-manipulation transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-xl hover:shadow-red-500/50 disabled:hover:scale-100 disabled:shadow-none"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-7 h-7 md:w-8 md:h-8 animate-spin mr-3" />
                      Joining Queue...
                    </>
                  ) : (
                    <>
                      <Flag className="w-7 h-7 md:w-8 md:h-8 mr-3" />
                      Join the Queue
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  )
}
