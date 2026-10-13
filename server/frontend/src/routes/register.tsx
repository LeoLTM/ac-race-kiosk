import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, Flag, Loader, User } from 'lucide-react'
import { useJoinQueue } from '../hooks/useQueue'
import { formatEta } from '@/lib/format'
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
    <div className="h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl w-full relative z-10 my-4">
        {/* Success State */}
        {isSuccess && joinQueueMutation.data && (
          <Card className="border-green-500 border-2 text-center shadow-lg">
            <CardContent className="pt-8 pb-8 px-6 md:px-10">
              <CheckCircle className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 text-green-500" />
              <h1 className="text-3xl md:text-4xl font-extrabold mb-3 text-green-600 leading-tight tracking-tight">
                You're In!
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-6 leading-relaxed">
                Welcome to the track, <span className="font-bold text-foreground">{joinQueueMutation.data.driverName}</span>
              </p>

              <div className="bg-muted rounded-xl p-4 md:p-6 mb-6 border border-border">
                {joinQueueMutation.data.calledRigId !== null ? (
                  <div className="py-4 px-4 rounded-lg bg-card border border-border">
                    <p className="text-muted-foreground text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Go to</p>
                    <p className="text-5xl md:text-6xl font-black text-primary">
                      Rig #{joinQueueMutation.data.calledRigId}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 text-center">
                    <div className="py-4 px-4 rounded-lg bg-card border border-border hover:scale-105 transition-all duration-300">
                      <p className="text-muted-foreground text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Position</p>
                      <p className="text-5xl md:text-6xl font-black text-amber-500">
                        #{joinQueueMutation.data.position}
                      </p>
                    </div>
                    <div className="py-4 px-4 rounded-lg bg-card border border-border hover:scale-105 transition-all duration-300">
                      <p className="text-muted-foreground text-base md:text-lg mb-2 font-medium uppercase tracking-wider">Estimated Wait</p>
                      <p className="text-5xl md:text-6xl font-black text-primary">
                        {formatEta(joinQueueMutation.data.etaSec)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 border mb-6 p-4 md:p-5 rounded-lg">
                <AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                <div className="text-amber-800 dark:text-amber-200 text-sm md:text-base leading-relaxed">
                  <strong className="text-base md:text-lg font-bold block mb-1">Next Steps</strong>
                  {joinQueueMutation.data.calledRigId !== null ? (
                    <p>Rig <span className="font-bold">#{joinQueueMutation.data.calledRigId}</span> is ready for you. Take a seat and press <span className="font-bold">START</span> on the screen!</p>
                  ) : (
                    <p>Keep an eye on the screen - you'll be called to the next free rig. Don't wander off too far: if you miss your call, you move back in line.</p>
                  )}
                </div>
              </Alert>

              <Button
                onClick={handleReset}
                size="lg"
                className="font-bold text-base md:text-lg py-5 px-8 h-auto min-h-[50px] w-full md:w-auto touch-manipulation hover:scale-105 active:scale-95 transition-all rounded-lg"
              >
                Register Another Player ({countdown}s)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Registration Form */}
        {!isSuccess && (
          <Card className="border-border shadow-lg">
            <CardHeader className="text-center pt-12 pb-8">
              <Flag className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 text-primary" />
              <CardTitle className="text-4xl md:text-5xl text-foreground font-extrabold leading-tight tracking-tight">Join the Race</CardTitle>
              <CardDescription className="text-muted-foreground text-lg md:text-xl mt-3 font-medium">
                Enter your name to get in the queue
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 md:px-10 pb-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="playerName"
                    className="block text-sm md:text-base font-bold text-muted-foreground mb-3 uppercase tracking-widest"
                  >
                    Driver Name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 md:w-6 md:h-6 z-10 group-focus-within:text-primary transition-colors duration-300" />
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
                      className="pl-14 md:pl-16 pr-5 py-6 md:py-7 bg-card border-border border-2 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 text-xl md:text-2xl h-auto rounded-lg touch-manipulation transition-all duration-300 hover:border-muted-foreground focus:scale-[1.02] font-medium"
                    />
                  </div>
                  <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
                    1-50 characters • This name will appear on the leaderboards
                  </p>
                </div>

                {isError && (
                  <Alert className="bg-destructive/10 border-destructive/50 border p-5 rounded-lg">
                    <AlertCircle className="h-6 w-6 md:h-7 md:w-7 text-destructive" />
                    <div>
                      <p className="font-bold text-destructive text-lg md:text-xl">Registration Failed</p>
                      <p className="text-base md:text-lg text-muted-foreground mt-1 leading-relaxed">
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
                  className="w-full py-6 md:py-7 h-auto min-h-[70px] disabled:opacity-50 font-bold text-xl md:text-2xl rounded-lg touch-manipulation transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-md disabled:hover:scale-100 disabled:shadow-none"
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
