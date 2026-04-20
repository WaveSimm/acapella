"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: 토스트 프로바이더 밖에서도 최소 에러 확인 가능하도록 콘솔 출력
    return {
      success: (m) => console.log("[toast.success]", m),
      error: (m) => console.error("[toast.error]", m),
      info: (m) => console.log("[toast.info]", m),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, kind === "error" ? 4000 : 2500);
  }, []);

  const api: ToastAPI = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onClose={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const colors =
    item.kind === "error"
      ? "bg-red-600 text-white"
      : item.kind === "success"
      ? "bg-emerald-600 text-white"
      : "bg-gray-800 text-white";

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      aria-live={item.kind === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg transition-all duration-200 ${colors} ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
      onClick={onClose}
    >
      {item.message}
    </div>
  );
}
