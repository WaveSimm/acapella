"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    // Fallback: 브라우저 기본 confirm
    return (opts) => Promise.resolve(window.confirm(opts.message));
  }
  return fn;
}

interface DialogState extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setDialog({ ...opts, resolve });
      }),
    [],
  );

  useEffect(() => {
    if (!dialog) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dialog.resolve(false);
        setDialog(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        dialog.resolve(true);
        setDialog(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
          onClick={() => {
            dialog.resolve(false);
            setDialog(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title ?? "확인"}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && (
              <h2 className="mb-2 text-base font-semibold text-gray-900">{dialog.title}</h2>
            )}
            <p className="whitespace-pre-line text-sm text-gray-700">{dialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={() => {
                  dialog.resolve(false);
                  setDialog(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dialog.cancelLabel ?? "취소"}
              </button>
              <button
                onClick={() => {
                  dialog.resolve(true);
                  setDialog(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  dialog.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {dialog.confirmLabel ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
