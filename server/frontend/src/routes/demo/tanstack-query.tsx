import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/demo/tanstack-query')({
  component: TanStackQueryDemo,
})

function TanStackQueryDemo() {
  const { data } = useQuery({
    queryKey: ['todos'],
    queryFn: () =>
      Promise.resolve([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]),
    initialData: [],
  })

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 text-foreground">
      <div className="w-full max-w-2xl p-8 rounded-lg bg-card shadow-lg border border-border">
        <h1 className="text-2xl mb-4 font-bold">
          TanStack Query Simple Promise Handling
        </h1>
        <ul className="mb-4 space-y-2">
          {data.map((todo) => (
            <li
              key={todo.id}
              className="bg-muted border border-border rounded-lg p-3 shadow-sm"
            >
              <span className="text-lg text-foreground">{todo.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
