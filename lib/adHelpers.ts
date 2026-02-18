export type AdPlaceholder = {
  id: string;
  label: string;
  color: string;
};

const PLACEHOLDER_ADS: AdPlaceholder[] = [
  { id: 'ad_1', label: 'Ad #1', color: '#3B82F6' },
  { id: 'ad_2', label: 'Ad #2', color: '#10B981' },
  { id: 'ad_3', label: 'Ad #3', color: '#F59E0B' },
];

export function pickRandomAd(): AdPlaceholder {
  return PLACEHOLDER_ADS[Math.floor(Math.random() * PLACEHOLDER_ADS.length)];
}

export function shouldShowAd(params: {
  hasOpponent: boolean;
  playerScore: number;
  opponentScore: number;
  accuracy?: number;
  totalRounds?: number;
  roundsHit?: number;
  finalScore?: number;
}): boolean {
  const { hasOpponent, playerScore, opponentScore, accuracy, totalRounds, roundsHit, finalScore } = params;

  if (hasOpponent) {
    return playerScore < opponentScore;
  }

  if (accuracy !== undefined && accuracy < 50) {
    return true;
  }

  if (totalRounds !== undefined && roundsHit !== undefined && totalRounds > 0) {
    const hitRate = (roundsHit / totalRounds) * 100;
    if (hitRate < 50) return true;
  }

  if (finalScore !== undefined && finalScore < 0) {
    return true;
  }

  return false;
}
