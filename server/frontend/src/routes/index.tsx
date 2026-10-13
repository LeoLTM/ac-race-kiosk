import { Link, createFileRoute } from '@tanstack/react-router'
import { Flag, Gauge, ShieldCheck, Trophy, UserPlus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Flag className="w-24 h-24 text-primary" />
          </div>
          <h1 className="text-6xl font-bold mb-4 text-foreground">
            Assetto Corsa Race Kiosk
          </h1>
          <p className="text-2xl text-muted-foreground max-w-3xl mx-auto">
            Welcome to the ultimate racing experience. Join the queue, hit the
            track, and compete for glory!
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          <Link to="/register" className="block group">
            <Card className="bg-primary text-primary-foreground hover:scale-105 transition-all duration-300 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-4 text-3xl">
                  <UserPlus className="w-12 h-12" />
                  Register
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-primary-foreground/80 text-lg">
                  New here? Sign up and get assigned to a racing rig. Start your
                  journey to the podium!
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link to="/dashboard" className="block group">
            <Card className="border-border hover:border-primary/50 hover:scale-105 transition-all duration-300 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-4 text-foreground text-3xl">
                  <Gauge className="w-12 h-12 text-primary" />
                  Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground text-lg">
                  Check the live status of all racing rigs, current drivers, and
                  queue positions.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link to="/lap-times" className="block group">
            <Card className="border-border hover:border-primary/50 hover:scale-105 transition-all duration-300 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-4 text-foreground text-3xl">
                  <Trophy className="w-12 h-12 text-amber-500" />
                  Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground text-lg">
                  View the leaderboard and see who holds the fastest lap times
                  on the track!
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="text-center">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Staff
          </Link>
        </div>
      </div>
    </div>
  )
}
