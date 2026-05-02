import { useState } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    const next = {
      message: String(message ?? ""),
      type,
      token: `${Date.now()}-${Math.random()}`,
    };
    setToast(next);
    window.setTimeout(() => {
      setToast((prev) => (prev?.token === next.token ? null : prev));
    }, 2000);
  };

  return { showToast, toast };
}
