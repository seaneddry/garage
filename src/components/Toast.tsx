import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(null), 2400);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <div className="toast" role="status" key={message}>
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
