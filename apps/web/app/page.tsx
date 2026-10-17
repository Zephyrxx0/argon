import React from 'react';
import Link from 'next/link';
import { GraphField } from '@/components/landing/graph-field';

const METRICS = [
  { value: '83.3%', label: 'Recall@1', note: 'vs 4.2% naive vector RAG' },
  { value: '0.0%', label: 'Superseded hallucinations', note: 'vs 54.2% raw LLM' },
  { value: '6ms', label: 'Graph query latency', note: 'openCypher, in-process' },
  { value: '100%', label: 'Claims cited', note: 'every claim carries a node #id' },
] as const;

const STEPS = [
  {
    index: '01',
    title: 'Traverse',
    body: 'Blast radius, owners, governing decisions and precedents are computed by graph traversal over FalkorDB, not guessed from text similarity.',
  },
  {
    index: '02',
    title: 'Cite',
    body: 'Each claim in a briefing cites a verified node id. Claims without a citation are stripped before you ever see them.',
  },
  {
    index: '03',
    title: 'Refuse',
    body: 'No verified citations, or no graph, and Argon refuses to answer. It will not fall back to ungrounded text.',
  },
] as const;

export default function LandingPage() {
  return (
    <main className="relative bg-background text-foreground font-mono">
      {/* ───────── HERO ───────── */}
      <section className="relative isolate flex min-h-screen flex-col overflow-hidden border-b border-white/25">
        <GraphField className="absolute inset-0 -z-10 h-full w-full pointer-events-none" />
        {/* Legibility mask: darkens the field behind the type, keeps the edges alive */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 pointer-events-none bg-[radial-gradient(ellipse_at_28%_55%,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.7)_38%,rgba(0,0,0,0)_75%)]"
        />

        <header className="flex items-center justify-between border-b border-white/25 px-5 py-4 sm:px-10">
          <span className="text-sm font-black tracking-[0.35em] uppercase">Argon</span>
          <span className="hidden text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
            Architectural memory / FalkorDB
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center px-5 py-12 sm:px-10">
          <p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            [ Before you change it ]
          </p>
          <h1 className="max-w-[16ch] font-display text-[clamp(2.75rem,min(9vw,13vh),9rem)] font-black uppercase leading-[0.86] tracking-[-0.045em]">
            What must I know before I touch this?
          </h1>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-foreground/80 sm:text-base">
            Argon answers from your repository&rsquo;s knowledge graph: the decisions in force, the
            blast radius, the people who know. Every claim cited. No graph, no answer.
          </p>

          <div className="mt-10">
            <Link
              href="/workspace"
              data-testid="landing-cta"
              className="group inline-flex items-center gap-6 border border-white bg-white px-6 py-4 text-sm font-bold uppercase tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white"
            >
              <span>Open workspace</span>
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                &rarr;
              </span>
            </Link>
          </div>
        </div>

        {/* Metrics strip */}
        <dl className="grid grid-cols-2 border-t border-white/25 bg-black/80 lg:grid-cols-4">
          {METRICS.map((m, i) => (
            <div
              key={m.label}
              className={`px-5 py-5 sm:px-10 sm:py-6 ${i % 2 === 1 ? 'border-l border-white/25' : ''} ${
                i > 0 ? 'lg:border-l lg:border-white/25' : ''
              } ${i >= 2 ? 'border-t border-white/25 lg:border-t-0' : ''}`}
            >
              <dt className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {m.label}
              </dt>
              <dd className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
                {m.value}
              </dd>
              <p className="mt-1 text-[11px] text-muted-foreground">{m.note}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* ───────── METHOD ───────── */}
      <section className="grid border-b border-white/25 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <article
            key={step.index}
            className={`px-5 py-12 sm:px-10 sm:py-16 ${i > 0 ? 'border-t border-white/25 lg:border-l lg:border-t-0' : ''}`}
          >
            <span className="text-[11px] tracking-[0.3em] text-muted-foreground">{step.index}</span>
            <h2 className="mt-4 font-display text-4xl font-black uppercase tracking-[-0.03em] sm:text-5xl">
              {step.title}
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-foreground/75">{step.body}</p>
          </article>
        ))}
      </section>

      {/* ───────── TIME-AWARE MEMORY ───────── */}
      <section className="grid border-b border-white/25 lg:grid-cols-2">
        <div className="px-5 py-12 sm:px-10 sm:py-16">
          <span className="text-[11px] tracking-[0.3em] text-muted-foreground">04 / TIME</span>
          <h2 className="mt-4 max-w-[14ch] font-display text-4xl font-black uppercase leading-[0.95] tracking-[-0.03em] sm:text-5xl">
            Decisions expire. Argon knows.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-foreground/75">
            Similarity search happily returns a rule that was superseded last quarter. Argon
            evaluates validity windows in the graph, so the guidance you get is the guidance in
            force.
          </p>
        </div>

        <figure className="border-t border-white/25 lg:border-l lg:border-t-0">
          <figcaption className="flex items-center justify-between border-b border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:px-10">
            <span>billing/retry.ts</span>
            <span>DEC-001 &rarr; DEC-002</span>
          </figcaption>
          <pre className="overflow-x-auto px-5 py-8 text-[12px] leading-7 sm:px-10 sm:text-[13px]">
            <code>
              <span className="block text-muted-foreground line-through decoration-white/40">
                - DEC-001  Linear retry, static backoff
              </span>
              <span className="block text-muted-foreground">
                {'  '}valid_to: superseded after Revert #42
              </span>
              <span className="block text-foreground">
                + DEC-002  Exponential backoff, full jitter
              </span>
              <span className="block text-foreground/70">{'  '}valid_to: null (in force)</span>
            </code>
          </pre>
        </figure>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="flex flex-col gap-8 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-16">
        <div>
          <p className="font-display text-3xl font-black uppercase leading-none tracking-[-0.03em] sm:text-5xl">
            No graph,
            <br />
            no answer.
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Apache-2.0 &middot; FalkorDB Hackathon 2026
          </p>
        </div>
        <Link
          href="/workspace"
          className="group inline-flex items-center gap-6 self-start border border-white px-6 py-4 text-sm font-bold uppercase tracking-[0.2em] transition-colors hover:bg-white hover:text-black sm:self-auto"
        >
          <span>Open workspace</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
      </footer>
    </main>
  );
}
