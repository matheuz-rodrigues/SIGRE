import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { registerConfirm } from './confirmStore';

export function ConfirmHost() {
  const [state, setState] = useState({ open: false, options: {}, resolve: null });

  registerConfirm((options) =>
    new Promise((resolve) => setState({ open: true, options, resolve })));

  const close = (result) => {
    state.resolve?.(result);
    setState((s) => ({ ...s, open: false, resolve: null }));
  };

  return (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(o) => { if (!o && state.resolve) close(false); }}
      onConfirm={() => close(true)}
      {...state.options}
    />
  );
}
