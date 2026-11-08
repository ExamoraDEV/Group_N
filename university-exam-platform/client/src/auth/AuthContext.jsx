import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./authContext";
import { apiFetchJson } from "../services/apiClient";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const requestGeneration = useRef(0);

  const refreshSession = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setStatus("loading");
    try {
      const { response, data } = await apiFetchJson("/api/auth/me", {}, 65000);
      if (generation !== requestGeneration.current) return null;
      if (!response.ok) {
        setUser(null);
        setStatus("anonymous");
        return null;
      }
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
    apiFetchJson("/api/auth/me", {}, 65000)
      .then(({ response, data }) => response.ok ? data : null)
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
