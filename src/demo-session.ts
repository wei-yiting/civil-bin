export function demoSessionStorageKey(
  search: string,
  projectUrl: string,
): string | undefined {
  const session = new URLSearchParams(search).get('demoSession')
  if (!session || !['citizen', 'merchant', 'city'].includes(session))
    return undefined
  return `civil-bin-${new URL(projectUrl).hostname}-${session}-auth`
}
