import LoginForm from "./login-form";

// Coach + client sign-in. Password-only flow now that the testing-only
// profile picker has been retired.

export default function LoginPage() {
  return (
    <main className="shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <section className="card" style={{ width: "100%", maxWidth: 460 }}>
        <span className="badge">Monroe Fit Coach</span>
        <h1 style={{ marginTop: "0.75rem" }}>Sign in</h1>
        <p className="meta" style={{ marginTop: "0.4rem" }}>
          Sign in with your email and password. If you haven&rsquo;t set one yet,
          visit <a href="/account">/account</a> after your first sign-in.
        </p>
        <hr className="divider" />
        <LoginForm />
        <p className="meta" style={{ marginTop: "1rem", fontSize: "0.82rem", textAlign: "center" }}>
          New here? <a href="/signup">Request an account &rarr;</a>
        </p>
      </section>
    </main>
  );
}
