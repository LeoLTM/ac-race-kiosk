import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Home, Menu, Network, X, Gauge, UserPlus, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center bg-gradient-to-r from-gray-900 via-red-900/50 to-gray-900 text-white shadow-lg border-b-2 border-red-600/30">
        <Button
          onClick={() => setIsOpen(true)}
          variant="ghost"
          size="icon"
          className="hover:bg-gray-700"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </Button>
        <h1 className="ml-4 text-xl font-bold flex items-center gap-2">
          <Flag className="text-red-500" size={28} />
          <Link to="/" className="hover:text-red-400 transition-colors">
            Race Kiosk
          </Link>
        </h1>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gradient-to-b from-gray-900 to-black text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-r-2 border-red-600/30 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-red-600/30 bg-gray-800/50">
          <h2 className="text-xl font-bold">Navigation</h2>
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            size="icon"
            className="hover:bg-gray-800"
            aria-label="Close menu"
          >
            <X size={24} />
          </Button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/dashboard"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors mb-2',
            }}
          >
            <Gauge size={20} />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            to="/register"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors mb-2',
            }}
          >
            <UserPlus size={20} />
            <span className="font-medium">Register</span>
          </Link>

          <Separator className="my-4 bg-gray-700" />

          {/* Demo Links Start */}

          <Link
            to="/demo/tanstack-query"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Network size={20} />
            <span className="font-medium">TanStack Query</span>
          </Link>

          {/* Demo Links End */}
        </nav>

        <div className="p-4 border-t border-gray-700 bg-gray-800/30">
          <p className="text-xs text-gray-500 text-center">
            Assetto Corsa Race Kiosk v1.0
          </p>
        </div>
      </aside>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}

