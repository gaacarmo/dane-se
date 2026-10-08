/** The Desktop (first-person) mode needs WebGL 2. Without it the page must use the Mobile table. */
export const webglSupported: boolean = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

/** Events between the 3D scene and its boundary. */
export const SCENE_READY_EVENT = 'dane-se:3d-ready';
export const SCENE_FAILED_EVENT = 'dane-se:3d-failed';
