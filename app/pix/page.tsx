'use client'

import { useCallback, useEffect, useState } from 'react'
import { Landmark, ShieldAlert, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usd, relativeTime } from '@/lib/format'

type PixDirection = 'send' | 'receive'
type PixStatus = 'waiting_human' | 'completed' | 'failed'

type PixTransfer = {
  id: string
  direction: PixDirection
  recipientKey: string
  recipientKeyType: string
  recipientName: string | null
  amount: number
  description: string
  senderAccountHolder: string
  status: PixStatus
  transactionId: string | null
  receipt: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

const emptyForm = {
  direction: 'send' as PixDirection,
  recipientName: '',
  recipientKey: '',
  amount: '',
  description: '',
}

export default function PixPage() {
  const [transfers, setTransfers] = useState<PixTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [transactionInputs, setTransactionInputs] = useState<Record<string, string>>({})

  const loadTransfers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/pix', { cache: 'no-store' })
      const data = await response.json()
      if (Array.isArray(data.transfers)) {
        setTransfers(data.transfers)
      }
    } catch (error) {
      console.error('Erro ao carregar Pix:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTransfers()
  }, [loadTransfers])

  async function handlePrepare(event: React.FormEvent) {
    event.preventDefault()
    setFormErrors([])
    setSubmitting(true)
    try {
      const response = await fetch('/api/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: form.direction,
          recipientName: form.recipientName,
          recipientKey: form.recipientKey,
          amount: Number(form.amount),
          description: form.description,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        setFormErrors(data.errors ?? [data.error ?? 'Não foi possível preparar o Pix.'])
        return
      }
      setForm(emptyForm)
      await loadTransfers()
    } catch (error) {
      console.error('Erro ao preparar Pix:', error)
      setFormErrors(['Não foi possível preparar o Pix.'])
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm(id: string, status: 'completed' | 'failed') {
    const transactionId = transactionInputs[id]?.trim()
    if (status === 'completed' && !transactionId) {
      alert('Informe o ID da transação/comprovante fornecido pelo seu banco para confirmar.')
      return
    }
    setConfirmingId(id)
    try {
      const response = await fetch(`/api/pix/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, transactionId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        alert(data.error ?? 'Não foi possível registrar a autorização.')
        return
      }
      await loadTransfers()
    } catch (error) {
      console.error('Erro ao confirmar Pix:', error)
    } finally {
      setConfirmingId(null)
    }
  }

  const pending = transfers.filter((t) => t.status === 'waiting_human')
  const history = transfers.filter((t) => t.status !== 'waiting_human')

  return (
    <div>
      <PageHeader
        title="Pix"
        description="Preparação automática de recebimento e pagamento via Pix. O Gerente preenche seus dados cadastrados e valida tudo antes do envio — a autorização final acontece sempre pelo canal oficial do seu banco."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-4" />
            Preparar transferência Pix
          </CardTitle>
          <CardDescription>
            A conta autorizada e os dados cadastrados são preenchidos automaticamente pelo servidor a partir do seu perfil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePrepare} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Direção
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as PixDirection }))}
              >
                <option value="send">Enviar (pagamento)</option>
                <option value="receive">Receber</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Nome do destinatário (opcional)
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.recipientName}
                onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                placeholder="Ex.: João Silva"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Chave Pix do destinatário
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.recipientKey}
                onChange={(e) => setForm((f) => ({ ...f, recipientKey: e.target.value }))}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Valor
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Descrição
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Pagamento de serviço freelance"
                required
              />
            </label>

            {formErrors.length > 0 && (
              <div className="sm:col-span-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <ul className="list-inside list-disc space-y-0.5">
                  {formErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Preparar e validar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6 border-warning/30 bg-warning/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" />
            Aguardando sua autorização ({pending.length})
          </CardTitle>
          <CardDescription>
            O Gerente nunca envia o Pix sozinho. Autorize pelo app oficial do seu banco e depois registre aqui o ID da transação/comprovante.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma transferência Pix pendente.</p>
          )}
          {pending.map((transfer) => (
            <div key={transfer.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {transfer.direction === 'send' ? 'Enviar' : 'Receber'} {usd(transfer.amount)}
                    {transfer.recipientName ? ` • ${transfer.recipientName}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Chave ({transfer.recipientKeyType}): {transfer.recipientKey} • {transfer.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Remetente autorizado: {transfer.senderAccountHolder} • preparado {relativeTime(transfer.createdAt)}
                  </p>
                </div>
                <Badge variant="warning">Ação necessária</Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="ID da transação / comprovante"
                  value={transactionInputs[transfer.id] ?? ''}
                  onChange={(e) => setTransactionInputs((s) => ({ ...s, [transfer.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  onClick={() => handleConfirm(transfer.id, 'completed')}
                  disabled={confirmingId === transfer.id}
                >
                  <CheckCircle2 />
                  Já autorizei — registrar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleConfirm(transfer.id, 'failed')}
                  disabled={confirmingId === transfer.id}
                >
                  <XCircle />
                  Cancelar/falhou
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma transferência Pix registrada ainda.</p>
          )}
          {history.map((transfer) => (
            <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {transfer.direction === 'send' ? 'Enviado' : 'Recebido'} • {usd(transfer.amount)} • {transfer.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {transfer.transactionId ? `Transação: ${transfer.transactionId} • ` : ''}
                  {relativeTime(transfer.updatedAt)}
                </p>
              </div>
              <Badge variant={transfer.status === 'completed' ? 'success' : 'destructive'}>
                {transfer.status === 'completed' ? 'Confirmado' : 'Falhou'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
