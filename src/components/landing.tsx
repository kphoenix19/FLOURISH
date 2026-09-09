import Link from "next/link";

export function Landing() {
  return <main className="flex min-h-screen items-center justify-center px-6 py-16">
    <section className="w-full max-w-3xl rounded-3xl border border-emerald-900/10 bg-white p-8 shadow-sm sm:p-12">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">A little intention, every day</p>
      <h1 className="text-5xl font-bold tracking-tight text-emerald-950 sm:text-7xl">FLOURISH</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-emerald-950/75 sm:text-xl">Your real life is the game. FLOURISH is the progression system.</p>
      <p className="mt-8 text-sm text-emerald-900/60">Build a little momentum across the eight parts of your life.</p>
      <Link className="button mt-6 inline-flex" href="/login">Get started</Link>
    </section>
  </main>;
}
