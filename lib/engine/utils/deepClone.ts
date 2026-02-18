// Deep clone using structured clone (available in Node 17+)
// Falls back to JSON parse/stringify for environments without it
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}
