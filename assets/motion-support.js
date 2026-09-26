/* Frame-rate-independent timing, camera damping and conservative quality control. */
(() => {
  const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * Math.max(0, dt)));
  const dampAngle = (from, to, rate, dt) => damp(from, from + Math.atan2(Math.sin(to - from), Math.cos(to - from)), rate, dt);
  function fixedClock(step = 1 / 60) {
    let accumulated = 0;
    return {
      step,
      reset() { accumulated = 0; },
      advance(elapsed) {
        accumulated += Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, .1)) : 0;
        const steps = Math.floor((accumulated + 1e-10) / step);
        accumulated = Math.max(0, accumulated - steps * step);
        return { steps, alpha: Math.min(1, accumulated / step) };
      }
    };
  }
  function cameraBoom(initial) {
    let distance = initial, hold = 0;
    return {
      reset(value) { distance = value; hold = 0; },
      update(requested, clearance, dt) {
        const limit = Math.max(.08, Math.min(requested, clearance));
        if (clearance < requested - .02 && limit <= distance + .005) hold = .18;
        if (limit < distance) distance = limit;
        else if (hold > 0) hold = Math.max(0, hold - dt);
        else distance = damp(distance, limit, 5, dt);
        return distance;
      }
    };
  }
  function qualityGovernor() {
    let tier = 0, elapsed = 0, frames = 0, cooldown = 4, goodWindows = 0;
    return {
      reset() { elapsed = 0; frames = 0; cooldown = 4; goodWindows = 0; },
      sample(dt) {
        if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return null;
        cooldown = Math.max(0, cooldown - dt); elapsed += dt; frames++;
        if (elapsed < 2 || frames < 15) return null;
        const average = elapsed / frames;
        elapsed = 0; frames = 0;
        goodWindows = average < .018 ? goodWindows + 1 : 0;
        if (cooldown > 0) return null;
        if (average > .024 && tier < 2) { tier++; cooldown = 6; goodWindows = 0; return tier; }
        if (goodWindows >= 4 && tier > 0) { tier--; cooldown = 15; goodWindows = 0; return tier; }
        return null;
      }
    };
  }
  function renderScale(width, height, deviceRatio, touch, tier) {
    const cap = (touch ? [1, .85, .7] : [1.25, 1, .8])[tier];
    const budget = touch ? 1400000 : 2200000;
    return Math.max(.35, Math.min(deviceRatio || 1, cap, Math.sqrt(budget / Math.max(1, width * height))));
  }
  window.AfterlightMotion = Object.freeze({ damp, dampAngle, fixedClock, cameraBoom, qualityGovernor, renderScale });
})();
