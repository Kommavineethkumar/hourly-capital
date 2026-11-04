"use client";

import { useEffect, useState } from "react";

type Token = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

// Lets each user connect their own Mac runner / backup script with a personal token.
export default function RunnerTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fresh, setFresh] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/tokens", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as { tokens?: Token[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? "Could not load tokens.");
        setTokens(data.tokens ?? []);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => { load(); }, []);

  async function create() {
    setError("");
    const r = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Capital Runner" }) });
    const data = (await r.json()) as { token?: string; error?: string };
    if (!r.ok || !data.token) return setError(data.error ?? "Could not create token.");
    setFresh(data.token);
    load();
  }

  async function revoke(id: string) {
    await fetch("/api/tokens", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <section className="runner-tokens">
      <h2>Connect your Mac runner</h2>
      <p>Tasks run on your own Mac through your own Codex. Create a token, then on your Mac run the setup below (see the project README).</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <button className="secondary" onClick={create}>Create runner token</button>
      {fresh && (
        <div className="token-once">
          <p><strong>Copy this now — it won’t be shown again.</strong></p>
          <pre>{`security add-generic-password -U -s "Capital Runner" -a "$USER" -w "${fresh}"\nnpm run runner:install -- --api-url ${origin}`}</pre>
        </div>
      )}
      <ul>
        {tokens.map((t) => (
          <li key={t.id}>
            <span>{t.label} · created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "never used"}</span>
            <button className="secondary" onClick={() => revoke(t.id)}>Revoke</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
