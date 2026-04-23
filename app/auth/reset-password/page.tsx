"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");

    
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push("/auth"), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", fontFamily: "sans-serif" }}>
      <div style={{ width: 380, background: "#161B22", border: "1px solid #21262D", borderRadius: 14, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#F0F6FC", marginBottom: 6 }}>Reset your password</div>
        <div style={{ fontSize: 13, color: "#8B949E", marginBottom: 28 }}>Enter a new password for your account.</div>

        {done ? (
          <div style={{ fontSize: 14, color: "#4ADE80" }}>Password updated. Redirecting to login...</div>
        ) : (
          <>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", padding: "11px 14px", background: "#0D1117", border: "1px solid #30363D", borderRadius: 8, color: "#F0F6FC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" as const, outline: "none" }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={{ width: "100%", padding: "11px 14px", background: "#0D1117", border: "1px solid #30363D", borderRadius: 8, color: "#F0F6FC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" as const, outline: "none" }}
            />
            {error && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 10 }}>{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={loading || !password || !confirm}
              style={{ width: "100%", padding: "11px", background: "#F0F6FC", color: "#0D1117", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading || !password || !confirm ? 0.5 : 1 }}
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
