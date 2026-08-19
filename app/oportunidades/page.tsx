'use client'

import { useEffect, useState } from 'react'

type Opportunity = {
  id: string
  title: string
  source: string
  category: string
  estimatedValue: number
  confidence: number
  status: string
  discoveredAt: string
  createdAt: string
}

export default function OportunidadesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadOpportunities() {
      try {
        const response = await fetch('/api/opportunities')

        if (!response.ok) {
          throw new Error('Erro ao carregar oportunidades')
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(
            data.error || 'Erro ao carregar oportunidades',
          )
        }

        setOpportunities(data.opportunities || [])
      } catch (err) {
        console.error(err)
        setError('Não foi possível carregar as oportunidades.')
      } finally {
        setLoading(false)
      }
    }

    loadOpportunities()
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px',
        background: '#f5f5f5',
        color: '#171717',
      }}
    >
      <h1>Oportunidades</h1>

      <p>
        Fontes de renda e oportunidades encontradas pelo sistema.
      </p>

      {loading && <p>Carregando oportunidades...</p>}

      {error && (
        <p style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <section
          style={{
            display: 'grid',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          {opportunities.map((opportunity) => (
            <article
              key={opportunity.id}
              style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #ddd',
              }}
            >
              <h2>{opportunity.title}</h2>

              <p>
                Fonte: {opportunity.source}
              </p>

              <p>
                Categoria: {opportunity.category}
              </p>

              <p>
                Valor estimado: US${' '}
                {opportunity.estimatedValue.toFixed(2)}
              </p>

              <p>
                Confiança: {opportunity.confidence}%
              </p>

              <p>
                Status: {opportunity.status}
              </p>
            </article>
          ))}

          {opportunities.length === 0 && (
            <p>
              Nenhuma oportunidade cadastrada.
            </p>
          )}
        </section>
      )}
    </main>
  )
}
