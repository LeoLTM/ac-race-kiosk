import { useSocketConnection } from '@/hooks/useSocketConnection'

export function ConnectionIndicator() {
  const { isConnected } = useSocketConnection()

  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-destructive'
        }`}
      />
      <span
        className={
          isConnected
            ? 'text-green-600 dark:text-green-400'
            : 'text-destructive'
        }
      >
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  )
}
