import { Heart } from 'lucide-react'

export function Footer() {
  return (
    <footer className="w-full py-4 text-center text-lg backdrop-blur-sm">
      <p className="flex items-center justify-center gap-2">
        Made with{' '}
        <Heart className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
        by Leonard und Michael
      </p>
    </footer>
  )
}