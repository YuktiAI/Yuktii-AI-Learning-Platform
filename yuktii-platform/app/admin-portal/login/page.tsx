"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Eye, EyeOff, Shield } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin-portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Login failed");
        return;
      }
      router.push("/admin-portal/dashboard");
      router.refresh();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f6", color: "#171923", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        {/* Logo / brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)", marginBottom: 16 }}>
            <Shield size={24} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#171923" }}>Yuktii Admin Portal</h1>
          <p style={{ fontSize: 13, color: "#6b6f67", margin: 0 }}>Internal access only — not for students</p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: "#ffffff", border: "1px solid #dfe1da", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8888aa", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Admin Email</label>
            <div style={{ position: "relative" }}>
              <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b6b8a" }} />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus
                placeholder="admin@yuktiiai.in"
                style={{ width: "100%", padding: "10px 12px 10px 36px", background: "#ffffff", border: "1px solid #cfd3cb", borderRadius: 8, color: "#171923", fontSize: 14, outline: "none" }} />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8888aa", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Password</label>
            <div style={{ position: "relative" }}>
              <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b6b8a" }} />
              <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "10px 40px 10px 36px", background: "#ffffff", border: "1px solid #cfd3cb", borderRadius: 8, color: "#171923", fontSize: 14, outline: "none" }} />
              <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b6b8a", padding: 0 }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {err && (
            <div style={{ background: "#3b0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5" }}>
              {err}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Signing in…" : "Sign in to Admin Portal"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "#6b6b8a", marginTop: 20 }}>
          Session expires after 8 hours · Rate-limited to 5 attempts per 15 min
        </p>
      </div>
    </div>
  );
}
