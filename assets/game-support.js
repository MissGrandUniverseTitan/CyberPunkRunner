/* Shared input/storage primitives. No network or account is needed for local saves. */
(() => {
  function stick(dx, dy, radius) {
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || radius <= 0 || length / radius < .12) return { x: 0, z: 0, px: 0, py: 0 };
    const clamped = Math.min(length, radius);
    const strength = Math.min(1, (clamped / radius - .12) / .88);
    return { x: dx / length * strength, z: -dy / length * strength, px: dx / length * clamped, py: dy / length * clamped };
  }
  function parseSave(raw, placeCount) {
    try {
      if (typeof raw !== 'string' || raw.length > 20000) return null;
      const data = JSON.parse(raw);
      const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
      if (!data || data.version !== 1 || data.game !== 'afterlight' || !Array.isArray(data.position) || data.position.length !== 3 || !data.camera || !Array.isArray(data.discovered)) return null;
      if (!finite(data.position[0], -5.65, 5.65) || !finite(data.position[1], 0, 8) || !finite(data.position[2], -13.4, 13.4) || !finite(data.rotation, -1e6, 1e6)) return null;
      if (!finite(data.camera.yaw, -1e6, 1e6) || !finite(data.camera.pitch, .12, .95) || !finite(data.camera.distance, 1.65, 5.5)) return null;
      if (data.discovered.length > placeCount || !data.discovered.every(i => Number.isInteger(i) && i >= 0 && i < placeCount) || typeof data.resting !== 'boolean' || !finite(data.savedAt, 0, 9e15)) return null;
      return { version: 1, game: 'afterlight', position: [...data.position], rotation: data.rotation,
        camera: { yaw: data.camera.yaw, pitch: data.camera.pitch, distance: data.camera.distance },
        discovered: [...new Set(data.discovered)], resting: data.resting, savedAt: data.savedAt };
    } catch { return null; }
  }
  function saveStore(getStorage, placeCount) {
    const key = 'afterlight.save.v1';
    return {
      read() {
        try {
          const raw = getStorage().getItem(key);
          if (raw === null) return { state: null, issue: null };
          const state = parseSave(raw, placeCount);
          return { state, issue: state ? null : 'invalid' };
        } catch { return { state: null, issue: 'storage' }; }
      },
      write(state) {
        try {
          const raw = JSON.stringify(state);
          if (!parseSave(raw, placeCount)) return false;
          getStorage().setItem(key, raw);
          return true;
        } catch { return false; }
      }
    };
  }
  function touchController({ joystick, knob, canvas, enabled, onMove, onOrbit, onZoom }) {
    let stickId = null;
    const camera = new Map();
    const listeners = [];
    function listen(el, type, fn) {
      el.addEventListener(type, fn, { passive: false });
      listeners.push(() => el.removeEventListener(type, fn));
    }
    function capture(el, id) { try { el.setPointerCapture(id); } catch {} }
    function release(el, id) { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch {} }
    function resetStick() {
      const id = stickId; stickId = null;
      knob.style.transform = 'translate(0px, 0px)'; onMove(0, 0);
      if (id !== null) release(joystick, id);
    }
    function moveStick(event) {
      const rect = joystick.getBoundingClientRect();
      const v = stick(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2, rect.width * .30);
      knob.style.transform = `translate(${v.px}px, ${v.py}px)`;
      onMove(v.x, v.z);
    }
    listen(joystick, 'pointerdown', event => {
      if (!enabled() || stickId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); stickId = event.pointerId; capture(joystick, stickId); moveStick(event);
    });
    listen(joystick, 'pointermove', event => {
      if (event.pointerId !== stickId) return;
      event.preventDefault(); if (!enabled()) { resetStick(); return; } moveStick(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(joystick, type, event => { if (event.pointerId === stickId) resetStick(); });
    const distance = () => { const p = [...camera.values()]; return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; };
    listen(canvas, 'pointerdown', event => {
      if (!enabled() || camera.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
      // Camera fingers may be non-primary while another finger holds the joystick.
      event.preventDefault(); camera.set(event.pointerId, { x: event.clientX, y: event.clientY }); capture(canvas, event.pointerId);
    });
    listen(canvas, 'pointermove', event => {
      const previous = camera.get(event.pointerId);
      if (!previous || !enabled()) return;
      event.preventDefault(); const oldDistance = distance();
      camera.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (camera.size === 1) onOrbit(event.clientX - previous.x, event.clientY - previous.y);
      else { const nextDistance = distance(); if (oldDistance > 5 && nextDistance > 5) onZoom(oldDistance / nextDistance); }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, event => {
      camera.delete(event.pointerId); release(canvas, event.pointerId);
    });
    const reset = () => {
      resetStick(); const ids = [...camera.keys()]; camera.clear();
      ids.forEach(id => release(canvas, id));
    };
    return { reset, destroy() { reset(); listeners.forEach(remove => remove()); } };
  }
  // Critical game actions must fire on every pointer's down event, including
  // non-primary fingers. Browser-synthesized clicks are not reliable multitouch input.
  function bindPressAction(button, onPress) {
    let pointer = null;
    const listeners = [];
    const listen = (name, fn) => {
      button.addEventListener(name, fn, { passive: false });
      listeners.push(() => button.removeEventListener(name, fn));
    };
    function reset() {
      const id = pointer; pointer = null;
      button.removeAttribute('data-pressed');
      try { if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch {}
    }
    listen('pointerdown', event => {
      if (button.disabled || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      pointer = event.pointerId;
      button.setAttribute('data-pressed', 'true');
      try { button.setPointerCapture(pointer); } catch {}
      onPress();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, event => {
      if (event.pointerId !== pointer) return;
      event.preventDefault(); reset();
    });
    listen('click', event => {
      event.preventDefault(); event.stopPropagation();
      // Keep keyboard and assistive-technology activation; never run a touch twice.
      if (!button.disabled && event.detail === 0 && !event.pointerType) onPress();
    });
    listen('contextmenu', event => event.preventDefault());
    return { reset, destroy() { reset(); listeners.forEach(remove => remove()); } };
  }
  // Small overlapping bends travel outwards. Phase is integrated by the game,
  // so changing gait never jumps to a different sine-wave position.
  function tailPose(phase, mode, turn = 0, count = 12) {
    const resting = mode === 'rest', running = mode === 'run';
    return Array.from({ length: count }, (_, i) => {
      const u = i / (count - 1);
      const wave = Math.sin(phase - u * 2.9);
      return {
        x: (i === 0 ? (resting ? .30 : running ? -.14 : -.42) : resting ? -.015 : running ? -.055 : -.135)
          + Math.sin(phase * .73 - u * 2.2) * (.009 + u * .016),
        y: (resting ? (i === 0 ? .70 : .09) : 0)
          + wave * (resting ? .012 : .018 + u * .035)
          - Math.max(-1, Math.min(1, turn)) * (.014 + u * .014),
        z: Math.sin(phase * .61 - u * 2.4) * (.005 + u * .009)
      };
    });
  }
  async function loadModelParts(base, version, fetcher = fetch) {
    const request = async name => {
      const response = await fetcher(base + name + '?v=' + encodeURIComponent(version));
      if (!response.ok) throw new Error('โหลดโมเดลไม่สำเร็จ: ' + name);
      return response;
    };
    const manifest = await (await request('manifest.json')).json();
    if (manifest.version !== 1 || !Number.isInteger(manifest.byteLength) || manifest.byteLength < 12 || manifest.byteLength > 32 * 1024 * 1024 ||
        !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 128 ||
        !manifest.parts.every((name, i) => name === 'part-' + String(i).padStart(2, '0') + '.bin')) {
      throw new Error('ข้อมูลโมเดลไม่ถูกต้อง');
    }
    const parts = new Array(manifest.parts.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, parts.length) }, async () => {
      while (next < parts.length) {
        const i = next++;
        parts[i] = new Uint8Array(await (await request(manifest.parts[i])).arrayBuffer());
      }
    }));
    if (parts.reduce((sum, part) => sum + part.length, 0) !== manifest.byteLength) throw new Error('ไฟล์โมเดลไม่ครบ');
    const bytes = new Uint8Array(manifest.byteLength);
    let offset = 0;
    parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
    return bytes;
  }
  window.AfterlightSupport = Object.freeze({ stick, parseSave, saveStore, touchController, bindPressAction, tailPose, loadModelParts });
})();
