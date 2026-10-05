// =====================================================================
// Supabase-compatible BROWSER client — production replacement.
//
// The original used createBrowserClient with the public anon key (safe
// to expose, RLS enforced server-side). The production backend has no
// anon-key gateway; instead this tiny shim proxies the ONE client-side
// operation the original app performs (sessions.status update when the
// teacher abandons a live room) through a hardened, purpose-built API
// route (src/app/api/client-db/route.ts) that re-authenticates the user
// and re-checks ownership server-side. No keys exist in the browser.
// =====================================================================

type QueryResult = { data: unknown; error: { message: string } | null }

class BrowserBuilder {
  private filters: Record<string, unknown> = {}

  constructor(
    private readonly table: string,
    private readonly op: 'update',
    private readonly values: Record<string, unknown>
  ) {}

  eq(column: string, value: unknown): this {
    this.filters[column] = value
    return this
  }

  async maybeSingle(): Promise<QueryResult> {
    return this.run()
  }

  single(): Promise<QueryResult> {
    return this.run()
  }

  private async run(): Promise<QueryResult> {
    try {
      const res = await fetch('/api/client-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.table, op: this.op, values: this.values, filters: this.filters }),
      })
      const json = (await res.json().catch(() => ({}))) as QueryResult
      if (!res.ok) {
        return { data: null, error: { message: (json as { error?: { message?: string } }).error?.message || `HTTP ${res.status}` } }
      }
      return { data: json.data ?? null, error: null }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'network error' } }
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const p = this.run()
    return p.then(onfulfilled as any, onrejected as any)
  }
}

export function createClient() {
  return {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return new BrowserBuilder(table, 'update', values)
        },
      }
    },
  }
}
