// #root (not window) is the actual scroll container: `overflow-x: hidden` on html/body/#root
// forces overflow-y's computed value to `auto` per spec, so #root scrolls internally at 100% height.
export function getScrollContainer(): Element {
  return document.getElementById('root') ?? document.documentElement;
}
