import { NextResponse } from 'next/server'
import { requestHasActiveSession } from '@/lib/auth-server'
import { getExecutionMetrics, getSourcePortfolio } from '@/lib/execution-store'

/*
 * ==========================================
 * MÉTRICAS REAIS DO GERENTE DE RENDA
 * ==========================================
 *
 * Todas vêm do banco (opportunities, execution_runs, earnings).
 * `confirmedEarnings`/`confirmedValue` nunca somam estimatedValue —
 * só existe ganho quando há registro em /api/earnings.
 */
export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    const [metrics, portfolio] = await Promise.all([getExecutionMetrics(), getSourcePortfolio()])
    return NextResponse.json({ success: true, metrics, portfolio })
  } catch (error) {
    console.error('Erro ao calcular métricas:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível calcular métricas.' }, { status: 500 })
  }
}

