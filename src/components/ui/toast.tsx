/** Small notices at the bottom ("Mail gesendet."), without a library. */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; text: string; tone: "info" | "error" };
type ToastApi = { show: (text: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = (): ToastApi => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
