/** The Desktop (first-person) mode needs WebGL 2. Without it the page must use the Mobile table. */
export const webglSupported: boolean = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();
