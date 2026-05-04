import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <main className="shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <section className="card" style={{ width: "100%", maxWidth: 540 }}>
        <span className="badge">Monroe Fit Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Request an account</h1>
        <p className="meta" style={{ marginTop: "0.4rem" }}>
          Tell James who you are and what you're working on. He'll review and reach out — usually within a day.
        </p>
        <hr className="divider" />
        <SignupForm />
      </section>
    </main>
  );
}
