// Ponte entre `confirmAction()` (usável em qualquer lugar) e o <ConfirmHost /> montado na raiz.
let openFn = null;

export function registerConfirm(fn) {
  openFn = fn;
}

export function confirmAction(options) {
  if (!openFn) return Promise.resolve(false);
  return openFn(options);
}
