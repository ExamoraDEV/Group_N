import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import "./Toast.css";

const variants = {
  success: { Icon: CheckCircle2, role: "status" },
  error: { Icon: AlertCircle, role: "alert" },
  warning: { Icon: TriangleAlert, role: "status" },
  info: { Icon: Info, role: "status" },
};

export default function Toast({ message, type = "info", onClose, action }) {
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef(null);
  const onCloseRef = useRef(onClose);
  const { Icon, role } = variants[type] || variants.info;

  const dismiss = useCallback(() => {
    if (exitTimer.current) return;
    setExiting(true);
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      onCloseRef.current?.();
    }, 180);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const autoDismissTimer = window.setTimeout(() => {
      setExiting(true);
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        onCloseRef.current?.();
      }, 180);
    }, 5000);
    return () => {
      window.clearTimeout(autoDismissTimer);
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    };
  }, [message]);

  if (!message) return null;
  return (
    <div className={`app-toast-region ${exiting ? "is-exiting" : ""}`}>
      <div className={`app-toast app-toast-${type}`} role={role} aria-live={type === "error" ? "assertive" : "polite"} aria-atomic="true">
        <Icon className="app-toast-icon" size={20} aria-hidden="true" />
        <p className="app-toast-message">{message}</p>
        {action && <button type="button" className="app-toast-action" onClick={() => { action.onClick(); dismiss(); }} disabled={action.disabled}>{action.label}</button>}
        <button type="button" className="app-toast-close" onClick={dismiss} aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
