import { SHARED_PACKAGE } from "@vng/shared";

export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
        padding: "4rem 1.5rem",
      }}
    >
      <h1>VNG Platform</h1>
      <p>
        Monorepo skeleton — <strong>web</strong> (Next.js 16 · App Router · React 19).
      </p>
      <p>
        Wired to <code>{SHARED_PACKAGE}</code>. No application features yet.
      </p>
    </main>
  );
}
