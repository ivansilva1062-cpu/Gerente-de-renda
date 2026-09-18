'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Compass,
  AlertCircle,
  Wallet,
  History,
  ShieldCheck,
  Settings,
  Menu,
  X,
  Bot,
  Bell,
  CheckCheck,
  Trash2,
  Smartphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgent } from '@/components/agent-provider'
import { AgentStatusBadge } from '@/components/agent-status'
import { Badge } from '@/components/ui/badge'

const nav = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/oportunidades', label: 'Oportunidades', icon: Compass },
  { href: '/pendentes', label: 'Pendentes', icon: AlertCircle },
  { href: '/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/seguranca', label: 'Segurança', icon: ShieldCheck },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { pendingTasks } = useAgent()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        const showBadge = item.href === '/pendentes' && pendingTasks.length > 0
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {showBadge && (
              <span className="flex size-5 items-center justify-center rounded-full bg-warning text-[0.7rem] font-semibold text-warning-foreground">
                {pendingTasks.length}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Bot className="size-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-sidebar-foreground">Gerente de Renda</p>
        <p className="text-xs text-sidebar-foreground/60">Painel autônomo</p>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadNotifications, markNotificationAsRead, clearReadNotifications, enableNotifications } = useAgent()

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarBrand />
        <NavLinks />
        <div className="mt-auto border-t border-sidebar-border p-4">
          <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
            <span className="text-xs text-sidebar-foreground/70">Status do agente</span>
            <AgentStatusBadge />
          </div>
          <p className="mt-3 px-1 text-[0.7rem] leading-relaxed text-sidebar-foreground/50">
            V1 — interface e arquitetura. Sem dinheiro real, credenciais ou contas conectadas.
          </p>
        </div>
      </aside>

      {/* Sidebar — mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar">
            <div className="flex items-center justify-between pr-3">
              <SidebarBrand />
              <button
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-sidebar-border p-4">
              <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
                <span className="text-xs text-sidebar-foreground/70">Status do agente</span>
                <AgentStatusBadge />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-semibold">Gerente de Renda</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Smartphone className="size-3.5" />
                <span>Ativar notificações</span>
              </button>
            </div>
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                aria-label="Notificações"
                title="Notificações"
              >
                <Bell className="size-3.5" />
                <span>Notificações</span>
                {unreadNotifications > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            </div>
            <Badge variant="outline" className="hidden font-mono sm:inline-flex">
              modo demonstração
            </Badge>
            <div className="lg:hidden">
              <AgentStatusBadge />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Notificações</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void clearReadNotifications()}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-3" />
                  Limpar lidas
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhuma notificação no momento.
                </p>
              ) : notifications.map((notification) => (
                <div key={notification.id} className={cn('rounded-lg border p-3 text-sm', notification.read ? 'border-border bg-muted/30' : 'border-primary/40 bg-primary/5')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{notification.title}</p>
                      <p className="mt-1 text-muted-foreground">{notification.body}</p>
                    </div>
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => void markNotificationAsRead(notification.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
                      >
                        <CheckCheck className="size-3" />
                        Ler
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {notification.source && <span>{notification.source}</span>}
                    {notification.amount != null && <span>• {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(notification.amount)}</span>}
                    <span>• {new Date(notification.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
