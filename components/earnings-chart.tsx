import { usd } from '@/lib/format'

export function EarningsChart({
  data,
}: {
  data: { day: string; amount: number }[]
}) {
  const max = Math.max(...data.map((d) => d.amount), 1)

  return (
    <div className="flex h-48 items-end gap-1.5">
      {data.map((d, i) => {
        const height = Math.max(6, Math.round((d.amount / max) * 100))
        const isLast = i === data.length - 1
        return (
          <div key={d.day} className="group flex flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full flex-1 items-end">
              <div
                className={
                  isLast
                    ? 'w-full rounded-t bg-success transition-all'
                    : 'w-full rounded-t bg-primary/25 transition-all group-hover:bg-primary/45'
                }
                style={{ height: `${height}%` }}
              >
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.65rem] text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {usd(d.amount)}
                </span>
              </div>
            </div>
            <span className="font-mono text-[0.6rem] text-muted-foreground">{d.day}</span>
          </div>
        )
      })}
    </div>
  )
}
