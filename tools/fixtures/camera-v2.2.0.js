// Regression fixture from commit 384f64d; executed only in the Node test VM.
// Orbit camera with collision
  const target = V();
  const desired = V();
  const direction = V();
  const hit = V();
  const cameraRay = new T.Ray();

  camera.position.set(.6, 2.2, 13.5);

  function updateCamera(dt) {
    target.copy(cat.position);
    target.y += portraitMode ? (resting ? .63 : .83) : (resting ? .55 : .73);
    const fov = portraitMode ? 43 : 53;
    if (Math.abs(camera.fov - fov) > .01) {
      camera.fov = T.MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-7 * dt));
      camera.updateProjectionMatrix();
    }

    desired.set(
      Math.sin(yaw) * cameraDistance * Math.cos(pitch),
      Math.sin(pitch) * cameraDistance + (portraitMode ? 0 : .2),
      Math.cos(yaw) * cameraDistance * Math.cos(pitch)
    ).add(target);

    direction.copy(desired).sub(target).normalize();
    cameraRay.set(target, direction);

    let distance = desired.distanceTo(target);

    for (const solid of solids) {
      if (solid.box.containsPoint(target)) continue;

      if (cameraRay.intersectBox(solid.box, hit)) {
        const d = hit.distanceTo(target) - .13;
        if (d < distance) distance = Math.max(.2, d);
      }
    }

    desired.copy(target).addScaledVector(direction, distance);

    if (camera.position.distanceTo(target) > distance + .1) {
      camera.position.copy(desired);
    } else {
      camera.position.lerp(
        desired, 1 - Math.exp(-11 * dt)
      );
    }

    // Validate the smoothed position too.
    direction.copy(camera.position).sub(target);
    let safeDistance = direction.length();

    if (safeDistance > .0001) {
      direction.normalize();
      cameraRay.set(target, direction);

      for (const solid of solids) {
        if (solid.box.containsPoint(target)) continue;

        if (cameraRay.intersectBox(solid.box, hit)) {
          const d = hit.distanceTo(target);

          if (d < safeDistance) {
            safeDistance = Math.max(.18, d - .13);
          }
        }
      }

      camera.position.copy(target).addScaledVector(
        direction, safeDistance
      );
    }

    camera.position.y = Math.max(.18, camera.position.y);
    camera.lookAt(target);
  }

  // ============================================================
  // Game loop
