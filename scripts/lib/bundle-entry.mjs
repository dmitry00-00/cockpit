/** An unrelated small entry must never satisfy the cockpit's size budget. */
export function cockpitEntry(bundle, entryPath) {
  const entries = Object.values(bundle).filter(c => c.type === 'chunk' && c.isEntry && c.facadeModuleId === entryPath);
  if (entries.length !== 1) throw new Error('Cockpit index.html entry missing or ambiguous; bundle budget cannot be verified');
  return entries[0];
}
