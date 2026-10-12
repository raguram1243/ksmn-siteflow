export type MarginStatus = 'above_target' | 'on_target' | 'below_target' | 'loss' | 'no_data'

export interface ProfitResult {
  profit: number
  margin: number
  status: MarginStatus
}

/**
 * Cash-basis profit: what clients have actually paid (approved payments)
 * minus what the project has actually cost. The quotation value is only a
 * reference and the base for the outstanding balance - it is not used here.
 *
 * Margin % is profit / total received. With nothing received the margin is
 * undefined, so it is reported as 0 (status 'loss' if costs exist, else 'no_data').
 *
 * Keep in sync with supabase-profit-cash-basis.sql.
 */
export function calcProfit(totalReceived: number, actualCost: number, targetMargin: number): ProfitResult {
  const received = Number(totalReceived) || 0
  const cost = Number(actualCost) || 0
  const target = Number(targetMargin) || 0
  const profit = received - cost

  if (received <= 0) {
    return { profit, margin: 0, status: cost > 0 ? 'loss' : 'no_data' }
  }

  const margin = (profit / received) * 100
  const status: MarginStatus =
    margin >= target + 2 ? 'above_target'
    : margin >= target ? 'on_target'
    : margin > 0 ? 'below_target'
    : 'loss'

  return { profit, margin: Number(margin.toFixed(2)), status }
}

/**
 * Expected profit if the client pays the full quotation: quotation - cost.
 * Shown as a subtle reference next to the real (cash-basis) profit.
 */
export function calcExpectedProfit(quotationValue: number, actualCost: number): { profit: number; margin: number } {
  const quotation = Number(quotationValue) || 0
  const profit = quotation - (Number(actualCost) || 0)
  return { profit, margin: quotation > 0 ? Number(((profit / quotation) * 100).toFixed(2)) : 0 }
}
