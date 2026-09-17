import { AuthScreen } from '@/components/auth-gate'

export default function AccessPage() {
  return (
    <AuthScreen
      onAuthenticated={() => {
        window.location.assign('/')
      }}
    />
  )
}
