export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureServerCards } = await import('@/lib/data/serverCards');
    ensureServerCards();
    const { ensureSetConfigLoaded } = await import('@/lib/data/setConfigServer');
    void ensureSetConfigLoaded();
  }
}
