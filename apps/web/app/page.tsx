import { Terminal, Cpu, Database, Network } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-left font-mono">
      <div className="w-full max-w-4xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-accent">
            <Terminal className="h-5 w-5" />
            <span className="text-sm font-bold tracking-widest uppercase">ARGON // SYSTEM BOOT</span>
          </div>
          <span className="text-xs text-muted-foreground">FALKORDB GRAPH ENGINE v0.1</span>
        </div>
        
        <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          ARGON ARCHITECTURE BRIEFING ENGINE
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          &ldquo;No graph, no answer.&rdquo; Every architectural claim computed by FalkorDB openCypher traversals,
          PageRank centrality, and 512-d Matryoshka vector search.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-border bg-muted/40 p-4">
            <Cpu className="mb-2 h-5 w-5 text-accent" />
            <div className="text-xs font-semibold text-foreground uppercase">Embedding Pipeline</div>
            <div className="mt-1 text-xs text-muted-foreground">512-d Matryoshka on Node.js CPU</div>
          </div>
          <div className="border border-border bg-muted/40 p-4">
            <Database className="mb-2 h-5 w-5 text-warning" />
            <div className="text-xs font-semibold text-foreground uppercase">FalkorDB Graph</div>
            <div className="mt-1 text-xs text-muted-foreground">GraphBLAS native matrix engine</div>
          </div>
          <div className="border border-border bg-muted/40 p-4">
            <Network className="mb-2 h-5 w-5 text-accent" />
            <div className="text-xs font-semibold text-foreground uppercase">8 Named Queries</div>
            <div className="mt-1 text-xs text-muted-foreground">Strict GRAPH.RO_QUERY execution</div>
          </div>
        </div>
      </div>
    </main>
  );
}
