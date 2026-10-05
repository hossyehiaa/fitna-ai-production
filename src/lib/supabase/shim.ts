// =====================================================================
// Supabase-compatible query shim — the production data layer.
//
// WHY THIS EXISTS:
//   The original Fitna AI frontend (mariamhisham24/Fitna-ai) talks to
//   Supabase via supabase-js query builders (`.from("sessions").select()
//   .eq().order()...`). The production backend runs on Neon Postgres +
//   custom auth instead of Supabase. This shim implements EXACTLY the
//   supabase-js API surface the original code uses, so every original
//   page/component keeps working byte-identical — only the transport
//   underneath changed.
//
// SECURITY:
//   * Table + column names are whitelisted (no identifier injection).
//   * All values are parameterized ($n placeholders with explicit casts).
//   * User-mode queries enforce the ORIGINAL Postgres RLS policies
//     (see supabase/schema.sql) at the server boundary; admin mode
//     bypasses them exactly like the original service_role client.
// =====================================================================

import { db } from '@/lib/db'
import type { AuthUserRow } from '@/lib/auth/session'

// ---------------------------------------------------------------------
// Table registry: whitelisted tables + column types (drives SQL casts
// and JS<->SQL value conversion).
// ---------------------------------------------------------------------
type ColType = 'text' | 'uuid' | 'int' | 'bool' | 'text[]' | 'jsonb' | 'numeric' | 'timestamptz'

const TABLES: Record<string, Record<string, ColType>> = {
  institutions: {
    id: 'uuid', name: 'text', created_at: 'timestamptz',
  },
  users: {
    id: 'uuid', email: 'text', full_name: 'text', role: 'text',
    institution_id: 'uuid', preferred_language: 'text', preferred_theme: 'text',
    teaching_experience: 'text', teaching_level: 'text', subject: 'text',
    training_goals: 'text[]', password_hash: 'text', created_at: 'timestamptz',
    // Character/account identity (explicit user selection at signup)
    account_type: 'text', country: 'text',
  },
  lesson_topics: {
    id: 'uuid', title_ar: 'text', title_en: 'text', institution_id: 'uuid',
    created_by: 'uuid', created_at: 'timestamptz',
  },
  student_personas: {
    id: 'uuid', name: 'text', age: 'int', dialect: 'text',
    personality_prompt: 'text', base_attention: 'int', strengths: 'text[]',
    weaknesses: 'text[]', is_active: 'bool', created_at: 'timestamptz',
    // Character identity system: stable key + gender + nationality +
    // avatar + voice configuration (deterministic, persisted)
    character_key: 'text', gender: 'text', nationality: 'text',
    avatar_key: 'text', voice_provider: 'text', voice_id: 'text',
    edge_voice: 'text', personality: 'text', speaking_style: 'text',
    age_range: 'text',
  },
  sessions: {
    id: 'uuid', teacher_id: 'uuid', institution_id: 'uuid', topic_id: 'uuid',
    lesson_context: 'text', duration_minutes: 'int', classroom_style: 'text',
    training_objective: 'text', status: 'text', started_at: 'timestamptz',
    ended_at: 'timestamptz', overall_score: 'numeric', teacher_talk_ratio: 'numeric',
    socratic_question_rate: 'numeric', inclusivity_index: 'numeric',
    classroom_pattern: 'text', dialect: 'text',
  },
  session_students: {
    id: 'uuid', session_id: 'uuid', persona_id: 'uuid',
    final_attention: 'int', times_spoken: 'int',
  },
  session_events: {
    id: 'uuid', session_id: 'uuid', event_type: 'text', actor: 'text',
    content: 'text', audio_url: 'text', metadata: 'jsonb',
    occurred_at_ms: 'int', created_at: 'timestamptz',
  },
  reports: {
    id: 'uuid', session_id: 'uuid', summary_ar: 'text', session_signal_ar: 'text',
    strengths: 'text[]', weaknesses: 'text[]', recommendations: 'text[]',
    evidence_moments: 'jsonb', framework_scores: 'jsonb',
    share_token: 'uuid', created_at: 'timestamptz',
  },
  badges: {
    id: 'uuid', user_id: 'uuid', badge_key: 'text',
    unlocked_at: 'timestamptz', session_id: 'uuid',
  },
  cohorts: {
    id: 'uuid', institution_id: 'uuid', name: 'text',
    description: 'text', created_at: 'timestamptz',
  },
  cohort_members: {
    id: 'uuid', cohort_id: 'uuid', teacher_id: 'uuid', created_at: 'timestamptz',
  },
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/

function tableColumns(table: string): Record<string, ColType> {
  const cols = TABLES[table]
  if (!cols) throw new Error(`shim: unknown table "${table}"`)
  return cols
}

function assertColumn(table: string, column: string): void {
  const cols = tableColumns(table)
  if (!cols[column]) throw new Error(`shim: unknown column "${table}.${column}"`)
}

/** pg array literal: ['a','b'] -> {"a","b"} with proper escaping. */
function toPgArray(value: unknown[]): string {
  const inner = value
    .map((v) => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    })
    .join(',')
  return `{${inner}}`
}

/** Convert a JS value into the parameter for a typed placeholder. */
function toParam(colType: ColType, value: unknown): unknown {
  if (value === null || value === undefined) return null
  switch (colType) {
    case 'text':
    case 'uuid':
      return String(value)
    case 'int':
      return Number(value)
    case 'bool':
      return typeof value === 'string' ? value === 'true' : Boolean(value)
    case 'numeric':
      return String(value)
    case 'text[]':
      return toPgArray(Array.isArray(value) ? value : [value])
    case 'jsonb':
      return JSON.stringify(value)
    case 'timestamptz':
      return value instanceof Date ? value.toISOString() : String(value)
  }
}

/** Post-process raw rows into the exact shapes supabase-js returned. */
function postProcess(table: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const cols = TABLES[table] ?? {}
  for (const row of rows) {
    for (const [col, type] of Object.entries(cols)) {
      const v = row[col]
      if (v === null || v === undefined) continue
      if (type === 'timestamptz' && v instanceof Date) {
        row[col] = v.toISOString()
      } else if (type === 'numeric') {
        row[col] = typeof v === 'object' && v !== null && 'toString' in v ? Number(v.toString()) : Number(v)
      }
    }
    // Column names are already snake_case in the DB — no renaming needed.
    // Internal columns never leak to responses by construction (select lists
    // in the app code never request password_hash).
    delete row.password_hash
  }
  return rows
}

export type PostgrestError = { message: string; code?: string }
export type QueryResult<T = unknown> = { data: T; error: PostgrestError | null; count?: number | null }

type Filter = { op: 'eq' | 'in' | 'gte'; column: string; value: unknown }

// ---------------------------------------------------------------------
// RLS policy fragments (user mode) — mirrors supabase/schema.sql.
// Each returns a SQL fragment + params, appended to every WHERE clause.
// ---------------------------------------------------------------------
interface Ctx { uid: string; role: string; inst: string | null }

function isAdmin(ctx: Ctx | null): boolean {
  return !!ctx && (ctx.role === 'institution_admin' || ctx.role === 'super_admin')
}

function policySelect(
  table: string,
  ctx: Ctx,
  params: unknown[]
): { sql: string } | { deny: true } | null {
  const adminInst = isAdmin(ctx) ? ctx.inst : null
  switch (table) {
    case 'users':
      return adminInst
        ? { sql: `("users"."id" = $${params.push(ctx.uid)}::uuid OR "users"."institution_id" = $${params.push(adminInst)}::uuid)` }
        : { sql: `"users"."id" = $${params.push(ctx.uid)}::uuid` }
    case 'sessions':
      return adminInst
        ? { sql: `("sessions"."teacher_id" = $${params.push(ctx.uid)}::uuid OR "sessions"."institution_id" = $${params.push(adminInst)}::uuid)` }
        : { sql: `"sessions"."teacher_id" = $${params.push(ctx.uid)}::uuid` }
    case 'session_students':
    case 'session_events':
    case 'reports': {
      let sql = `EXISTS (SELECT 1 FROM "sessions" s WHERE s."id" = "${table}"."session_id" AND s."teacher_id" = $${params.push(ctx.uid)}::uuid`
      if (adminInst) sql += ` OR (s."institution_id" = $${params.push(adminInst)}::uuid)`
      return { sql: sql + ')' }
    }
    case 'badges': {
      let sql = `"badges"."user_id" = $${params.push(ctx.uid)}::uuid`
      if (adminInst) {
        sql += ` OR EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "badges"."user_id" AND u."institution_id" = $${params.push(adminInst)}::uuid)`
      }
      return { sql: `(${sql})` }
    }
    case 'lesson_topics':
      return ctx.inst
        ? { sql: `("lesson_topics"."institution_id" IS NULL OR "lesson_topics"."institution_id" = $${params.push(ctx.inst)}::uuid)` }
        : { sql: `"lesson_topics"."institution_id" IS NULL` }
    case 'institutions':
      return ctx.inst
        ? { sql: `"institutions"."id" = $${params.push(ctx.inst)}::uuid` }
        : { deny: true }
    case 'student_personas':
      return null // readable by every authenticated user
    case 'cohorts':
      return adminInst
        ? { sql: `"cohorts"."institution_id" = $${params.push(adminInst)}::uuid` }
        : { deny: true }
    case 'cohort_members':
      return adminInst
        ? { sql: `EXISTS (SELECT 1 FROM "cohorts" c WHERE c."id" = "cohort_members"."cohort_id" AND c."institution_id" = $${params.push(adminInst)}::uuid)` }
        : { deny: true }
    default:
      return { deny: true }
  }
}

/** Policy for write ops (update) — same predicates as select. */
function policyUpdate(table: string, ctx: Ctx, params: unknown[]): { sql: string } | { deny: true } | null {
  if (table === 'users') {
    // users_update_self: own row only (admins never write users rows).
    return { sql: `"users"."id" = $${params.push(ctx.uid)}::uuid` }
  }
  return policySelect(table, ctx, params)
}

/** Policy for inserts (user mode) — guards the rows being inserted. */
function insertGuard(table: string, ctx: Ctx): { ok: true } | { deny: true; reason: string } {
  switch (table) {
    case 'sessions':
      return { ok: true } // teacher_id equality enforced via INSERT..SELECT guard below
    case 'session_events':
    case 'session_students':
      return { ok: true } // parent-session ownership enforced below
    case 'lesson_topics':
      return { ok: true } // original topics_write policy allowed teachers+admins
    case 'cohorts':
    case 'cohort_members':
      return isAdmin(ctx) ? { ok: true } : { deny: true, reason: 'admin only' }
    default:
      return { deny: true, reason: 'row-level security' } // users/badges/reports only via admin client
  }
}

/** For tables whose inserts must satisfy ownership, produce a guard on the VALUES alias. */
function insertGuardSql(
  table: string,
  ctx: Ctx,
  params: unknown[],
  rowAlias: string
): string | null {
  if (table === 'sessions') {
    return `${rowAlias}."teacher_id" = $${params.push(ctx.uid)}::uuid`
  }
  if (table === 'session_events' || table === 'session_students') {
    return `EXISTS (SELECT 1 FROM "sessions" s WHERE s."id" = ${rowAlias}."session_id" AND s."teacher_id" = $${params.push(ctx.uid)}::uuid)`
  }
  return null
}

// ---------------------------------------------------------------------
// The builder — implements the exact supabase-js surface the app uses.
// ---------------------------------------------------------------------
class QueryBuilder {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private writeOp: 'insert' | 'update' | 'upsert' | null = null
  private selectCols: string | null = null
  private countMode: 'exact' | null = null
  private headOnly = false
  private insertRows: Record<string, unknown>[] = []
  private updateData: Record<string, unknown> = {}
  private upsertConflict: string | null = null
  private upsertIgnoreDuplicates = false
  private filters: Filter[] = []
  private orderClauses: { column: string; ascending: boolean }[] = []
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private limitCount: number | null = null
  private singleMode: 'single' | 'maybeSingle' | null = null
  private executed: Promise<QueryResult> | null = null

  constructor(
    private readonly table: string,
    private readonly ctx: Ctx | null // null => admin mode (bypass RLS)
  ) {
    tableColumns(table) // validate table exists
  }

  // ---- read ----
  // NOTE: chained after insert/update/upsert, .select() sets the RETURNING
  // columns (supabase-js semantics) — it never converts a write into a read.
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    this.selectCols = columns ?? '*'
    if (options?.count === 'exact') this.countMode = 'exact'
    if (options?.head) this.headOnly = true
    return this
  }

  // ---- write ----
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = 'insert'
    this.writeOp = 'insert'
    this.insertRows = Array.isArray(rows) ? rows : [rows]
    return this
  }

  update(data: Record<string, unknown>): this {
    this.op = 'update'
    this.writeOp = 'update'
    this.updateData = data
    return this
  }

  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): this {
    this.op = 'upsert'
    this.writeOp = 'upsert'
    this.insertRows = Array.isArray(rows) ? rows : [rows]
    this.upsertConflict = options?.onConflict ?? 'id'
    this.upsertIgnoreDuplicates = options?.ignoreDuplicates ?? false
    return this
  }

  // ---- filters / modifiers ----
  eq(column: string, value: unknown): this {
    assertColumn(this.table, column)
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    assertColumn(this.table, column)
    this.filters.push({ op: 'in', column, value: values })
    return this
  }

  gte(column: string, value: unknown): this {
    assertColumn(this.table, column)
    this.filters.push({ op: 'gte', column, value })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    assertColumn(this.table, column)
    this.orderClauses.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  range(from: number, to: number): this {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }

  limit(n: number): this {
    this.limitCount = n
    return this
  }

  single(): this {
    this.singleMode = 'single'
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle'
    return this
  }

  // ---- execution ----
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (!this.executed) {
      this.executed = this.execute().catch((err): QueryResult => {
        const message = err instanceof Error ? err.message : String(err)
        return { data: null, error: { message, code: 'XX000' } }
      })
    }
    return this.executed.then(onfulfilled as any, onrejected as any)
  }

  private async execute(): Promise<QueryResult> {
    const cols = tableColumns(this.table)
    const params: unknown[] = []
    const p = (v: unknown): string => `$${params.push(v)}`

    // ---------- SELECT ----------
    if (this.op === 'select') {
      const whereParts: string[] = []

      if (this.ctx) {
        const policy = policySelect(this.table, this.ctx, params)
        if (policy && 'deny' in policy) {
          return { data: [], error: null }
        }
        if (policy && 'sql' in policy) whereParts.push(policy.sql)
      }

      for (const f of this.filters) {
        const type = cols[f.column]
        if (f.op === 'eq') {
          whereParts.push(`"${this.table}"."${f.column}" = ${p(toParam(type, f.value))}::${type}`)
        } else if (f.op === 'gte') {
          whereParts.push(`"${this.table}"."${f.column}" >= ${p(toParam(type, f.value))}::${type}`)
        } else if (f.op === 'in') {
          const values = Array.isArray(f.value) ? f.value : [f.value]
          if (values.length === 0) return { data: [], error: null } // IN () → no rows
          const placeholders = values.map((v) => `${p(toParam(type, v))}::${type}`).join(', ')
          whereParts.push(`"${this.table}"."${f.column}" IN (${placeholders})`)
        }
      }

      // Count-only query (head: true)
      if (this.countMode && this.headOnly) {
        const sql = `SELECT COUNT(*)::int AS count FROM "${this.table}"${whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : ''}`
        const rows = (await db.$queryRawUnsafe(sql, ...params)) as { count: number }[]
        const count = rows.length > 0 ? Number(rows[0].count) : 0
        return { count, data: null, error: null }
      }

      const selectList =
        this.selectCols && this.selectCols !== '*'
          ? this.selectCols
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
              .map((c) => {
                assertColumn(this.table, c)
                return `"${this.table}"."${c}"`
              })
              .join(', ')
          : `"${this.table}".*`

      let sql = `SELECT ${selectList} FROM "${this.table}"`
      if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`

      if (this.orderClauses.length) {
        sql += ` ORDER BY ${this.orderClauses
          .map((o) => `"${this.table}"."${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`)
          .join(', ')}`
      }

      // single() implies LIMIT 1
      let limit = this.limitCount
      let offset = 0
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        limit = this.rangeTo - this.rangeFrom + 1
        offset = this.rangeFrom
      }
      if (this.singleMode) limit = 1
      if (limit !== null && limit !== undefined) sql += ` LIMIT ${Math.max(0, Math.floor(limit))}`
      if (offset > 0) sql += ` OFFSET ${offset}`

      const rows = (await db.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[]
      const data = postProcess(this.table, rows ?? [])

      if (this.singleMode === 'single' && data.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } }
      }
      if (this.singleMode) {
        return { data: data[0] ?? null, error: null }
      }
      return { data, error: null }
    }

    // ---------- UPDATE ----------
    if (this.op === 'update') {
      const whereParts: string[] = []
      if (this.ctx) {
        const policy = policyUpdate(this.table, this.ctx, params)
        if (policy && 'deny' in policy) {
          return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
        }
        if (policy && 'sql' in policy) whereParts.push(policy.sql)
      }
      for (const f of this.filters) {
        const type = cols[f.column]
        if (f.op === 'eq') {
          whereParts.push(`"${this.table}"."${f.column}" = ${p(toParam(type, f.value))}::${type}`)
        } else if (f.op === 'gte') {
          whereParts.push(`"${this.table}"."${f.column}" >= ${p(toParam(type, f.value))}::${type}`)
        } else if (f.op === 'in') {
          const values = Array.isArray(f.value) ? f.value : [f.value]
          if (values.length === 0) return { data: null, error: null }
          const placeholders = values.map((v) => `${p(toParam(type, v))}::${type}`).join(', ')
          whereParts.push(`"${this.table}"."${f.column}" IN (${placeholders})`)
        }
      }
      if (whereParts.length === 0) {
        return { data: null, error: { message: 'WHERE clause is required for UPDATE', code: '42501' } }
      }

      const setCols: string[] = []
      for (const [column, value] of Object.entries(this.updateData)) {
        assertColumn(this.table, column)
        const type = cols[column]
        setCols.push(`"${column}" = ${p(toParam(type, value))}::${type}`)
      }
      if (setCols.length === 0) return { data: null, error: null }

      const returning =
        this.selectCols && this.selectCols !== '*'
          ? this.selectCols
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
              .map((c) => `"${c}"`)
              .join(', ')
          : '*'

      const sql = `UPDATE "${this.table}" SET ${setCols.join(', ')} WHERE ${whereParts.join(' AND ')} RETURNING ${returning}`
      const rows = (await db.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[]
      const data = postProcess(this.table, rows ?? [])
      if (this.singleMode === 'single' && data.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } }
      }
      if (this.singleMode) return { data: data[0] ?? null, error: null }
      return { data: this.selectCols ? data : null, error: null }
    }

    // ---------- INSERT / UPSERT ----------
    if (this.op === 'insert' || this.op === 'upsert') {
      if (this.insertRows.length === 0) return { data: null, error: null }

      if (this.ctx) {
        const guard = insertGuard(this.table, this.ctx)
        if ('deny' in guard) {
          return { data: null, error: { message: `new row violates row-level security policy for table "${this.table}"`, code: '42501' } }
        }
      }

      // Union of columns across rows (supabase semantics).
      const columnSet = new Set<string>()
      for (const row of this.insertRows) {
        for (const col of Object.keys(row)) {
          assertColumn(this.table, col)
          columnSet.add(col)
        }
      }
      const columnList = [...columnSet]
      if (columnList.length === 0) return { data: null, error: null }

      // VALUES tuples with typed casts.
      const valueRows = this.insertRows.map((row) => {
        const tuple = columnList.map((col) => {
          const type = cols[col]
          return `${p(toParam(type, row[col]))}::${type}`
        })
        return `(${tuple.join(', ')})`
      })

      const alias = 'v'
      const aliasCols = columnList.map((c) => `"${c}"`).join(', ')
      const selectColsAlias = columnList.map((c) => `${alias}."${c}"`).join(', ')

      let guardSql: string | null = null
      if (this.ctx) {
        guardSql = insertGuardSql(this.table, this.ctx, params, alias)
      }

      let sql: string
      if (guardSql) {
        // INSERT .. SELECT .. WHERE <ownership guard> — mirrors RLS WITH CHECK.
        sql = `INSERT INTO "${this.table}" (${columnList.map((c) => `"${c}"`).join(', ')}) SELECT ${selectColsAlias} FROM (VALUES ${valueRows.join(', ')}) AS ${alias}(${aliasCols}) WHERE ${guardSql}`
      } else {
        sql = `INSERT INTO "${this.table}" (${columnList.map((c) => `"${c}"`).join(', ')}) VALUES ${valueRows.join(', ')}`
      }

      if (this.op === 'upsert') {
        const conflictCols = this.upsertConflict!
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
        for (const c of conflictCols) assertColumn(this.table, c)
        const conflictTarget = conflictCols.map((c) => `"${c}"`).join(', ')
        if (this.upsertIgnoreDuplicates) {
          sql += ` ON CONFLICT (${conflictTarget}) DO NOTHING`
        } else {
          const updateSet = columnList
            .filter((c) => !conflictCols.includes(c))
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
          sql += updateSet.length
            ? ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet.join(', ')}`
            : ` ON CONFLICT (${conflictTarget}) DO NOTHING`
        }
      }

      const wantsReturning = Boolean(this.selectCols)
      const returning =
        this.selectCols && this.selectCols !== '*'
          ? this.selectCols
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
              .map((c) => `"${c}"`)
              .join(', ')
          : '*'
      if (wantsReturning) sql += ` RETURNING ${returning}`

      const rows = (await db.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[]

      if (this.ctx && guardSql && (!Array.isArray(rows) || rows.length === 0)) {
        return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
      }

      const data = postProcess(this.table, rows ?? [])
      if (this.singleMode === 'single' && data.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } }
      }
      if (this.singleMode) return { data: data[0] ?? null, error: null }
      return { data: wantsReturning ? data : null, error: null }
    }

    return { data: null, error: { message: 'shim: unsupported operation' } }
  }
}

// ---------------------------------------------------------------------
// Server-side client (supabase-js shaped).
// ---------------------------------------------------------------------
export type ShimUser = {
  id: string
  email: string
  user_metadata: Record<string, unknown>
  app_metadata: Record<string, unknown>
  aud: string
  role: string
  created_at: string
  last_sign_in_at: string
}

export function toShimUser(row: AuthUserRow): ShimUser {
  return {
    id: row.id,
    email: row.email,
    user_metadata: {
      full_name: row.full_name,
      role: row.role,
      preferred_theme: row.preferred_theme,
      preferred_language: row.preferred_language,
    },
    app_metadata: { provider: 'email', providers: ['email'] },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    last_sign_in_at: new Date().toISOString(),
  }
}

export function createQueryBuilder(table: string, ctx: Ctx | null): QueryBuilder {
  return new QueryBuilder(table, ctx)
}

export function ctxFromUser(user: AuthUserRow | null): Ctx | null {
  return user ? { uid: user.id, role: user.role, inst: user.institution_id } : null
}
