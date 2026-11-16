'use strict';

/**
 * Creates color helper functions that respect TTY and color-disable flags.
 *
 * @param {boolean} enabled - Whether colors should be applied.
 * @returns {Object} Color formatting functions.
 */
function createColors(enabled) {
  if (!enabled) {
    const identity = (str) => String(str);
    return {
      bold: identity,
      dim: identity,
      red: identity,
      yellow: identity,
      blue: identity,
      cyan: identity,
      green: identity,
      gray: identity
    };
  }

  const wrap = (open, close) => (str) => `\x1b[${open}m${str}\x1b[${close}m`;

  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    cyan: wrap(36, 39),
    green: wrap(32, 39),
    gray: wrap(90, 39)
  };
}

/**
 * Determine if color should be enabled based on environment, arguments, and TTY status.
 *
 * @param {Object} [options]
 * @param {boolean} [options.noColorFlag=false]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {boolean} [options.isTTY=process.stdout.isTTY]
 * @returns {boolean}
 */
function shouldEnableColor(options = {}) {
  const {
    noColorFlag = false,
    env = process.env,
    isTTY = process.stdout.isTTY
  } = options;

  // 1. Explicit --no-color flag
  if (noColorFlag) {
    return false;
  }

  // 2. NO_COLOR standard (https://no-color.org)
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }

  // 3. NODE_DISABLE_COLORS
  if (env.NODE_DISABLE_COLORS === '1') {
    return false;
  }

  // 4. Check if output is a TTY
  if (!isTTY) {
    return false;
  }

  // 5. Explicit dumb terminal
  if (env.TERM === 'dumb') {
    return false;
  }

  return true;
}

module.exports = {
  createColors,
  shouldEnableColor
};
