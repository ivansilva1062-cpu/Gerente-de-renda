export function isAuthorizedWorkerRequest({
  authorization,
  cronSecret,
  sessionActive,
}: {
  authorization: string | null
  cronSecret?: string
  sessionActive: boolean
}) {
  const hasValidCronSecret = Boolean(
    cronSecret && authorization === `Bearer ${cronSecret}`,
  )

  return sessionActive || hasValidCronSecret
}