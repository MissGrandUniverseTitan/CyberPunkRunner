# Changelog

## 2.2.1

- Allow direction, run and jump together using independent pointer-down actions.
- Add buffered jumps and ledge grace; verify the actual crate-to-balcony route.
- Remove distance-triggered camera snaps; smooth orbit/zoom and wall-edge recovery.
- Add fixed-rate movement with interpolated rendering across frame rates.
- Add adaptive rendering budgets, mobile direct rendering and desktop MSAA.
- Reduce distant fur shimmer and retain joystick input during browser-bar resizing.
- Keep the existing save format and losslessly packaged character assets.

Validation: actual movement/camera functions pass frame-rate regression tests;
real-device WebGL smoothness has not yet been measured.

## 2.2.0

- Rename the Thai title to ตรอกนิรันดร์.
- Replace the primitive cat with a calico GLB and soften the face and eyes.
- Add a continuous skinned tail with fine fur and smoothly blended movement.
- Add mobile touch controls, pinch zoom, safe-area layouts and lighter effects.
- Add automatic and manual local saves, Continue and confirmed New Game.
- Package the exact model into small binary parts for reliable uploads.
- Add reproducible model tools, geometry previews and input/storage/skin checks.

Validation: Node input/save integration tests and Python skin tests pass.
Real-device WebGL rendering and mobile frame rate have not yet been verified.
