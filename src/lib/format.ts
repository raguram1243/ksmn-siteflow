/**
 * Rupee formatter with a true minus sign for negatives ("−₹4,885"), so
 * profit and loss read the same on every screen instead of "₹-4,885".
 */
export function formatINR(n: number | string | null | undefined): string {
  const value = Number(n) || 0
  const abs = Math.abs(value).toLocaleString('en-IN')
  return value < 0 ? `−₹${abs}` : `₹${abs}`
}
