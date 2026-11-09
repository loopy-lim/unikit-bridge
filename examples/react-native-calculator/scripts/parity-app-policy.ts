/** Both collectors may operate only the explicitly dedicated benchmark application. */
export function requireDedicatedApp(id: string): void {
  if (id !== 'com.unikit.nitroparity')
    throw new Error('exact dedicated app com.unikit.nitroparity required');
}
