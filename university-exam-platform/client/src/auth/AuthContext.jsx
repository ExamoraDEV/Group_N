import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./authContext";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const requestGeneration = useRef(0);

  const refreshSession = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setStatus("loading");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: "include" });
      if (generation !== requestGeneration.current) return null;
      if (!response.ok) {
        setUser(null);
        setStatus("anonymous");
        return null;
      }
      const data = await response.json();
      if (generation !== requestGeneration.current) return null;
      setUser(data.user || null);
      setStatus(data.user ? "authenticated" : "anonymous");
      return data.user || null;
    } catch {
      if (generation !== requestGeneration.current) return null;
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    fetch(`${apiBaseUrl}/api/auth/me`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || generation !== requestGeneration.current) return;
        setUser(data?.user || null);
        setStatus(data?.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (active && generation === requestGeneration.current) {
          setUser(null);
          setStatus("anonymous");
        }
      });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    setAuthenticatedUser(nextUser) {
      requestGeneration.current += 1;
      setUser(nextUser);
      setStatus(nextUser ? "authenticated" : "anonymous");
    },
    refreshSession,
  }), [user, status, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
