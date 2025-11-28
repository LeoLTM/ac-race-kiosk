import { createFileRoute, Link } from '@tanstack/react-router'
import { Flag, Gauge, UserPlus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900/20 to-black text-white">
      <div className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Flag className="w-24 h-24 text-red-500 animate-[pulse_2s_ease-in-out_infinite]" />
          </div>
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-red-500 via-red-400 to-orange-500 bg-clip-text text-transparent">
            Assetto Corsa Race Kiosk
          </h1>
          <p className="text-2xl text-gray-300 max-w-3xl mx-auto">
            Welcome to the ultimate racing experience. Join the queue, hit the
            track, and compete for glory!
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          <Link to="/register" className="block group">
            <Card className="bg-gradient-to-br from-red-600 to-red-800 border-red-500/50 hover:border-red-400 hover:scale-105 transition-all duration-300 shadow-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-4 text-white text-3xl">
                  <UserPlus className="w-12 h-12" />
                  Register
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-200 text-lg">
                  New here? Sign up and get assigned to a racing rig. Start your
                  journey to the podium!
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link to="/dashboard" className="block group">
            <Card className="bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:border-red-500/50 hover:scale-105 transition-all duration-300 shadow-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-4 text-white text-3xl">
                  <Gauge className="w-12 h-12 text-cyan-400" />
                  Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-200 text-lg">
                  Check the live status of all racing rigs, current drivers, and
                  queue positions.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-3xl font-bold text-center mb-8">
            How It Works
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
              <CardContent className="pt-6">
                <div className="bg-red-500/20 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-white">1</span>
                </div>
                <h4 className="text-xl font-bold mb-2 text-white">Register</h4>
                <p className="text-gray-400">
                  Enter your name and get assigned to the fastest available racing
                  rig queue.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
              <CardContent className="pt-6">
                <div className="bg-red-500/20 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-white">2</span>
                </div>
                <h4 className="text-xl font-bold mb-2 text-white">Wait Your Turn</h4>
                <p className="text-gray-400">
                  Check your queue position on the dashboard and head to your
                  assigned rig when called.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
              <CardContent className="pt-6">
                <div className="bg-red-500/20 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-white">3</span>
                </div>
                <h4 className="text-xl font-bold mb-2 text-white">Race!</h4>
                <p className="text-gray-400">
                  Experience Assetto Corsa's realistic physics and compete for the
                  best lap times!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stats Banner */}
        <Card className="mt-16 bg-gradient-to-r from-red-600/20 via-red-500/20 to-orange-600/20 border-red-500/30 text-center">
          <CardContent className="pt-8">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
            <h3 className="text-3xl font-bold mb-2 text-white">Ready to Race?</h3>
            <p className="text-xl text-gray-300 mb-6">
              Join dozens of racers competing for track supremacy
            </p>
            <Link to="/register">
              <Button size="lg" className="bg-red-600 hover:bg-red-700 text-xl px-8 py-6 h-auto">
                Get Started Now
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
