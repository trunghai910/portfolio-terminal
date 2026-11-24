/**
 * Pure utility functions for ticker parsing and locked/auto-balanced portfolio weight calculations.
 */

export function parseTickerList(rawInput: string): string[] {
  return Array.from(
    new Set(
      rawInput
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export function buildEqualWeights(tickers: string[]): Record<string, number> {
  if (tickers.length === 0) return {};
  const share = Number((1 / tickers.length).toFixed(4));
  const next: Record<string, number> = {};
  tickers.forEach((t) => {
    next[t] = share;
  });
  return next;
}

export function reconcileWeightsForTickers(
  nextTickers: string[],
  prevWeights: Record<string, number>
): Record<string, number> {
  const nextWeights: Record<string, number> = {};
  if (nextTickers.length === 0) return nextWeights;

  const defaultShare = 1 / nextTickers.length;
  let sum = 0;
  nextTickers.forEach((t) => {
    const val = prevWeights[t] ?? defaultShare;
    nextWeights[t] = val;
    sum += val;
  });

  if (sum > 0) {
    nextTickers.forEach((t) => {
      nextWeights[t] = Number((nextWeights[t] / sum).toFixed(4));
    });
  }
  return nextWeights;
}

export function getWeightPercent(weights: Record<string, number>, ticker: string): number {
  const raw = weights[ticker] ?? 0;
  return Math.max(0, Math.min(100, Number((raw * 100).toFixed(1))));
}

/**
 * Rebalances unlocked tickers proportionally when `targetTicker` changes to `desiredPct`,
 * never modifying locked tickers and keeping total allocation capped at 100%.
 */
export function rebalanceLockedPercentages(
  tickers: string[],
  weights: Record<string, number>,
  lockedTickers: Record<string, boolean>,
  targetTicker: string,
  desiredPct: number
): Record<string, number> {
  if (lockedTickers[targetTicker]) return weights;

  const pctOf = (ticker: string) => getWeightPercent(weights, ticker);

  const lockedOthersSum = tickers.reduce(
    (acc, t) => (t !== targetTicker && lockedTickers[t] ? acc + pctOf(t) : acc),
    0
  );
  const unlockedOthers = tickers.filter((t) => t !== targetTicker && !lockedTickers[t]);

  const maxAllowed = Math.max(0, Number((100 - lockedOthersSum).toFixed(1)));
  const clampedTarget = Math.min(maxAllowed, Math.max(0, Number(desiredPct.toFixed(1))));

  const nextPctMap: Record<string, number> = {};
  tickers.forEach((t) => {
    nextPctMap[t] = pctOf(t);
  });
  nextPctMap[targetTicker] = clampedTarget;

  if (unlockedOthers.length > 0) {
    const remainingBudget = Math.max(
      0,
      Number((100 - lockedOthersSum - clampedTarget).toFixed(1))
    );
    const unlockedCurrentSum = unlockedOthers.reduce((acc, t) => acc + pctOf(t), 0);

    let distributed = 0;
    unlockedOthers.forEach((t, idx) => {
      if (idx === unlockedOthers.length - 1) {
        nextPctMap[t] = Math.max(0, Number((remainingBudget - distributed).toFixed(1)));
      } else {
        const share =
          unlockedCurrentSum > 1e-6
            ? (pctOf(t) / unlockedCurrentSum) * remainingBudget
            : remainingBudget / unlockedOthers.length;
        const roundedShare = Math.max(0, Number(share.toFixed(1)));
        nextPctMap[t] = roundedShare;
        distributed += roundedShare;
      }
    });
  }

  const nextWeights: Record<string, number> = {};
  tickers.forEach((t) => {
    nextWeights[t] = Number((nextPctMap[t] / 100).toFixed(4));
  });
  return nextWeights;
}
