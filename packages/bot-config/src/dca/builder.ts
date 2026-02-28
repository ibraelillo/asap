export type DcaStep = { distancePct: number; sizeMult: number };

/**
 * Build a 10-step DCA ladder where:
 * - steps[0..8] follow a smooth geometric progression
 * - steps[9] has 2x the distance and 4x the size of step[8]
 *
 * @param firstDistancePct initial distance of step 0 from entry (e.g. 0.8 for 0.8%)
 * @param firstSizeMult size multiplier of step 0 relative to base (e.g. 1.2)
 * @param distFactor geometric growth factor for distance (e.g. 1.35)
 * @param sizeFactor geometric growth factor for size (e.g. 1.3)
 */
export function buildDcaSteps(
  firstDistancePct: number,
  firstSizeMult: number,
  distFactor: number,
  sizeFactor: number,
): DcaStep[] {
  const steps: DcaStep[] = [];

  let dist = firstDistancePct;
  let mult = firstSizeMult;

  // build steps[0..8] with smooth progression
  for (let i = 0; i < 9; i++) {
    steps.push({
      distancePct: Number(dist.toFixed(3)),
      sizeMult: Number(mult.toFixed(3)),
    });

    dist *= distFactor;
    mult *= sizeFactor;
  }

  // special "rescue" last step (index 9):
  // 2x the previous distance, 4x the previous volume
  const prev = steps[8];

  steps.push({
    distancePct: Number((prev.distancePct * 2).toFixed(3)),
    sizeMult: Number((prev.sizeMult * 4).toFixed(3)),
  });

  return steps;
}
