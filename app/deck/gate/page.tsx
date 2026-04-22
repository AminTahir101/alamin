"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeckGate() {
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!token) return;
    setLoading(true);
    setError(false);
    const res = await fetch("/api/deck/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      router.push("/deck");
    } else {
      setError(true);
      setToken("");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <div style={{ width: 360, background: "#fff", borderRadius: 16, border: "1px solid #E8E5E0", padding: "44px 36px", textAlign: "center", boxShadow: "0 4px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: "#1A1614", marginBottom: 6 }}>ALAMIN</div>
        <div style={{ fontSize: 12, color: "#8A8480", marginBottom: 28 }}>Investor Deck · Confidential Access</div>
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Enter access token"
          style={{ width: "100%", padding: "12px 16px", border: `1.5px solid ${error ? "#B84040" : "#E8E5E0"}`, borderRadius: 8, fontSize: 14, marginBottom: 10, background: error ? "#FDF0F0" : "#FAFAF9", boxSizing: "border-box" as const, color: "#1A1614", outline: "none" }}
        />
        {error && <div style={{ fontSize: 12, color: "#B84040", marginBottom: 8 }}>Invalid token.</div>}
        <button
          onClick={handleSubmit}
          disabled={loading || !token}
          style={{ width: "100%", padding: "12px", background: "#1A1614", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading || !token ? 0.5 : 1 }}
        >
          {loading ? "Verifying..." : "Access Deck →"}
        </button>
        <div style={{ marginTop: 20, fontSize: 11, color: "#B8B4AF" }}>🔒 Not indexed · Confidential</div>
      </div>
    </div>
  );
}
