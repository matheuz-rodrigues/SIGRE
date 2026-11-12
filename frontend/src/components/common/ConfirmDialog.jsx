import * as AlertDialog from '@radix-ui/react-alert-dialog';

export default function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Confirmar ação',
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  onConfirm,
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
          <AlertDialog.Title className="text-lg font-bold text-gray-900">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-2 text-sm text-gray-600">
              {description}
            </AlertDialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
