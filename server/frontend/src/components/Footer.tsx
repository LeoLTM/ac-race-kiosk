import { Heart } from 'lucide-react'

export function Footer() {
  return (
    <footer className="w-full py-4 text-center text-lg text-muted-foreground">
      <p className="flex items-center justify-center gap-2">
        Made with <Heart className="w-4 h-4 text-primary fill-primary" />
        by Leonard und Michael
      </p>
    </footer>
  )
}
