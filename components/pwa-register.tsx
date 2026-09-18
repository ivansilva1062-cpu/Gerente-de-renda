'use client'

import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('Não foi possível registrar service worker:', error)
    })
  }, [])

  return null
}