import { Link } from '@tanstack/react-router'
import { Flag, Gauge, Home, Menu, Network, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center bg-card text-card-foreground shadow-sm border-b border-border">
        <Button
          onClick={() => setIsOpen(true)}
          variant="ghost"
          size="icon"
          className="hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </Button>
        <h1 className="ml-4 text-xl font-bold flex items-center gap-2">
          <Flag className="text-primary" size={28} />
          <Link to="/" className="hover:text-primary transition-colors">
            Race Kiosk
          </Link>
        </h1>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-card text-card-foreground shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-r border-border ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted">
          <h2 className="text-xl font-bold">Navigation</h2>
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            size="icon"
            className="hover:bg-accent"
            aria-label="Close menu"
          >
            <X size={24} />
          </Button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/dashboard"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2',
            }}
          >
            <Gauge size={20} />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            to="/register"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2',
            }}
          >
            <UserPlus size={20} />
            <span className="font-medium">Register</span>
          </Link>

          <Separator className="my-4 bg-border" />

          {/* Demo Links Start */}

          <Link
            to="/demo/tanstack-query"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors mb-2',
            }}
          >
            <Network size={20} />
            <span className="font-medium">TanStack Query</span>
          </Link>

          {/* Demo Links End */}
        </nav>

        <div className="p-4 border-t border-border bg-muted">
          <p className="text-xs text-muted-foreground text-center">
            Assetto Corsa Race Kiosk v1.0
          </p>
        </div>
      </aside>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}
