'use strict';

const DEFAULT_WEIGHTS = {
  error: 20,
  warning: 7,
  info: 0
};

const DEFAULT_GRADES = {
  A: 90,
  B: 80,
  C: 70,
  D: 60
};

const CATEGORIES = ['dependencies', 'environment', 'security', 'configuration'];

/**
 * Determine letter grade from numerical health score.
 *
 * @param {number} score
 * @param {Object} [gradeThresholds]
 * @returns {string}
 */
function calculateGrade(score, gradeThresholds = DEFAULT_GRADES) {
  const grades = gradeThresholds || DEFAULT_GRADES;
  if (score >= grades.A) {
    return 'A';
  }
  if (score >= grades.B) {
    return 'B';
  }
  if (score >= grades.C) {
    return 'C';
  }
  if (score >= grades.D) {
    return 'D';
  }
  return 'F';
}

/**
 * Calculate health score, grade, penalties, and category breakdown.
 *
 * @param {Array<Object>} findings - Processed diagnostic findings.
 * @param {Object} [scoringConfig] - Optional scoring configuration.
 * @param {Object} [scoringConfig.weights] - Penalty weights per severity.
 * @param {Object} [scoringConfig.grades] - Thresholds per grade.
 * @returns {{
 *   value: number,
 *   grade: string,
 *   penalties: number,
 *   categories: Record<string, number>
 * }}
 */
function calculateHealthScore(findings = [], scoringConfig = {}) {
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(scoringConfig.weights || {})
  };

  const grades = {
    ...DEFAULT_GRADES,
    ...(scoringConfig.grades || {})
  };

  const categoryPenalties = {};
  for (const cat of CATEGORIES) {
    categoryPenalties[cat] = 0;
  }

  let totalPenalties = 0;

  for (const finding of findings) {
    const severity = finding.severity;
    const penalty = typeof weights[severity] === 'number' ? weights[severity] : 0;

    totalPenalties += penalty;

    const cat = finding.category;
    if (categoryPenalties[cat] !== undefined) {
      categoryPenalties[cat] += penalty;
    } else {
      categoryPenalties[cat] = penalty;
    }
  }

  const rawScore = 100 - totalPenalties;
  const clampedScore = Math.max(0, Math.min(100, rawScore));
  const roundedScore = Math.round(clampedScore * 100) / 100;
  const grade = calculateGrade(roundedScore, grades);

  return {
    value: roundedScore,
    grade,
    penalties: Math.round(totalPenalties * 100) / 100,
    categories: categoryPenalties
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  DEFAULT_GRADES,
  calculateGrade,
  calculateHealthScore
};
