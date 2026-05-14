import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { DEFAULT_MATERIALS, MATERIAL_CATEGORIES } from "@/lib/materials-seed";

export default async function ClientMaterialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Materials</h1>
        <p className="meta">Reference articles on training, nutrition, recovery, and movement — published by James.</p>
      </header>
      <hr className="divider" />

      <section style={{
        background: "rgba(168,61,43,0.04)",
        border: "1px dashed var(--rust)",
        borderRadius: 4,
        padding: "0.55rem 0.85rem",
        marginBottom: "1.25rem",
        fontSize: "0.8rem",
      }}>
        <strong style={{ color: "var(--rust)" }}>Heads up:</strong>{" "}
        <span className="meta">These are the published article titles and short summaries. The deep-dive content for each will arrive as James fills it in.</span>
      </section>

      {MATERIAL_CATEGORIES.map((cat) => {
        const items = DEFAULT_MATERIALS.filter((m) => m.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.55rem", paddingBottom: "0.35rem", borderBottom: "2px solid var(--line)" }}>
              {cat}
              <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontWeight: 400, marginLeft: "0.6rem" }}>
                {items.length} article{items.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.7rem" }}>
              {items.map((m) => (
                <article
                  key={m.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 4,
                    padding: "0.6rem 0.75rem",
                    background: "var(--paper)",
                    minWidth: 0,
                  }}
                >
                  <strong style={{ fontSize: "0.86rem", lineHeight: 1.25, display: "block" }}>{m.title}</strong>
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                    {m.body}
                  </p>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
