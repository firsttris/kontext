/**
 * Small notices at the bottom ("Mail gesendet."), without a library; one may carry an action
 * ("Rückgängig") and stay longer.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type Action = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "info" | "error"; action?: Action };
type Options = { action?: Action /** How long it stays, in ms. */; duration?: number };
type ToastApi = { show: (text: string, tone?: Toast["tone"], options?: Options) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = (): ToastApi => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback(
    (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    [],
  );
  const show = useCallback(
    (text: string, tone: Toast["tone"] = "info", options: Options = {}) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, text, tone, action: options.action }]);
      setTimeout(() => dismiss(id), options.duration ?? 4000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+var(--keyboard-height,0px))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-[calc(1.5rem+var(--keyboard-height,0px))]"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={
              toast.tone === "error"
                ? "pointer-events-auto rounded-xl border border-danger bg-bg px-4 py-2.5 text-[14px] text-danger shadow-lg"
                : "pointer-events-auto rounded-xl bg-primary px-4 py-2.5 text-[14px] text-onprimary shadow-lg"
            }
          >
            {toast.text}
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action!.run();
                }}
                className="ml-3 font-semibold underline-offset-2 hover:underline"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
