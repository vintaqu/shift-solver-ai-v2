// ============================================================
// Shift Solver AI — Desglose de cobertura por ROL
// ------------------------------------------------------------
// La demanda de un slot ya NO se define con un total global, sino con
// una lista de roles, cada uno con su mínimo y su ideal:
//
//   Camarero  → min 2 / ideal 3
//   Encargado → min 1 / ideal 1
//
// `CoverageRequirement.minWorkers` / `idealWorkers` se conservan como
// columnas DENORMALIZADAS (la suma de las filas hijas). Todo el código
// existente que las lee — histograma de la vista diaria, planner semanal,
// chips de la lista, franjas_num del solver — sigue funcionando sin cambios.
//
// Reglas invariantes:
//   1. Todo slot tiene al menos una fila de rol.
//   2. min >= 0, ideal >= min.
//   3. Un rol no puede repetirse dentro del mismo slot.
//   4. minWorkers = Σ min, idealWorkers = Σ ideal.
// ============================================================

import { prisma } from '@/lib/prisma'

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface RoleReqInput {
  laborRoleId: string
  minWorkers: number
  idealWorkers: number
}

export interface RoleReqTotals {
  minWorkers: number
  idealWorkers: number
}

/** Fila hija tal y como viene de la BD (subset usado al clonar). */
export interface RoleReqRow {
  laborRoleId: string
  minWorkers: number
  idealWorkers: number
}

// ── Normalización y validación ──────────────────────────────────────────────

/**
 * Limpia y valida una lista de necesidades por rol.
 * - Descarta filas sin laborRoleId.
 * - Colapsa duplicados del mismo rol sumándolos (defensivo frente a la UI).
 * - Fuerza enteros no negativos y ideal >= min.
 * Lanza si la lista queda vacía: un slot sin roles no tiene demanda definida.
 */
export function normalizeRoleRequirements(
  roles: RoleReqInput[] | undefined | null,
): RoleReqRow[] {
  if (!roles || roles.length === 0) {
    throw new Error('El slot debe tener al menos un rol con su necesidad definida')
  }

  const merged = new Map<string, RoleReqRow>()

  for (const r of roles) {
    if (!r || !r.laborRoleId) continue

    const min = Math.max(0, Math.floor(Number(r.minWorkers) || 0))
    const ideal = Math.max(min, Math.floor(Number(r.idealWorkers) || 0))

    const prev = merged.get(r.laborRoleId)
    if (prev) {
      prev.minWorkers += min
      prev.idealWorkers += ideal
    } else {
      merged.set(r.laborRoleId, {
        laborRoleId: r.laborRoleId,
        minWorkers: min,
        idealWorkers: ideal,
      })
    }
  }

  const result = Array.from(merged.values())
  if (result.length === 0) {
    throw new Error('El slot debe tener al menos un rol con su necesidad definida')
  }

  const totals = sumRoleTotals(result)
  if (totals.idealWorkers === 0) {
    throw new Error('La necesidad total del slot no puede ser 0 personas')
  }

  return result
}

/** Suma denormalizada que se guarda en el slot padre. */
export function sumRoleTotals(roles: RoleReqRow[]): RoleReqTotals {
  let minWorkers = 0
  let idealWorkers = 0
  for (const r of roles) {
    minWorkers += r.minWorkers
    idealWorkers += r.idealWorkers
  }
  return { minWorkers, idealWorkers }
}

// ── Escritura ───────────────────────────────────────────────────────────────

/**
 * Reemplaza por completo el desglose por rol de uno o varios slots.
 * Borrado + createMany en dos operaciones, nunca N llamadas individuales
 * (evita el throttling de Vercel en upserts masivos de rango).
 */
export async function replaceRoleRequirements(
  slotIds: string[],
  roles: RoleReqRow[],
): Promise<void> {
  if (slotIds.length === 0) return

  await (prisma as any).coverageRoleRequirement.deleteMany({
    where: { coverageRequirementId: { in: slotIds } },
  })

  const rows = slotIds.flatMap(slotId =>
    roles.map(r => ({
      coverageRequirementId: slotId,
      laborRoleId: r.laborRoleId,
      minWorkers: r.minWorkers,
      idealWorkers: r.idealWorkers,
    })),
  )

  if (rows.length > 0) {
    await (prisma as any).coverageRoleRequirement.createMany({
      data: rows,
      skipDuplicates: true,
    })
  }
}

/**
 * Clona el desglose por rol de un conjunto de slots origen a los slots
 * destino recién creados, emparejándolos por una clave natural.
 *
 * `createMany` no devuelve ids, así que el llamador debe re-consultar los
 * slots destino y pasarlos aquí. Todo el clonado se resuelve en un único
 * createMany.
 */
export async function cloneRoleRequirements(
  sourceSlots: Array<{ roleRequirements?: RoleReqRow[] | null }>,
  sourceKeyOf: (slot: any) => string,
  targetSlots: Array<{ id: string }>,
  targetKeyOf: (slot: any) => string,
): Promise<number> {
  const byKey = new Map<string, RoleReqRow[]>()
  for (const s of sourceSlots) {
    const roles = s.roleRequirements ?? []
    if (roles.length === 0) continue
    byKey.set(sourceKeyOf(s), roles)
  }
  if (byKey.size === 0) return 0

  const rows: any[] = []
  for (const t of targetSlots) {
    const roles = byKey.get(targetKeyOf(t))
    if (!roles) continue
    for (const r of roles) {
      rows.push({
        coverageRequirementId: t.id,
        laborRoleId: r.laborRoleId,
        minWorkers: r.minWorkers,
        idealWorkers: r.idealWorkers,
      })
    }
  }

  if (rows.length > 0) {
    await (prisma as any).coverageRoleRequirement.createMany({
      data: rows,
      skipDuplicates: true,
    })
  }

  return rows.length
}

// ── Fallback: rol por defecto ───────────────────────────────────────────────

/**
 * Rol base de la organización (el nivel más bajo disponible, normalmente
 * "Camarero"). Se usa para precargar el editor y para dar de alta slots
 * generados automáticamente que aún no tienen desglose.
 * Devuelve null si la organización no tiene roles configurados.
 */
export async function getDefaultLaborRoleId(organizationId: string): Promise<string | null> {
  const LEVEL_ORDER: Record<string, number> = {
    BASIC: 0,
    SEMI_MANAGER: 1,
    MANAGER: 2,
    OWNER: 3,
  }

  const roles = await prisma.laborRole.findMany({
    where: { organizationId },
    select: { id: true, level: true, priority: true },
  })
  if (roles.length === 0) return null

  roles.sort((a, b) => {
    const la = LEVEL_ORDER[a.level as unknown as string] ?? 99
    const lb = LEVEL_ORDER[b.level as unknown as string] ?? 99
    if (la !== lb) return la - lb
    return (a.priority ?? 0) - (b.priority ?? 0)
  })

  return roles[0].id
}

/**
 * Resuelve el desglose a persistir para una operación de escritura.
 * - Si la UI envía `roles`, manda esa lista.
 * - Si no (llamadas legacy o generación automática), sintetiza una única
 *   fila con el rol base y los totales recibidos, de modo que ningún slot
 *   quede jamás sin desglose.
 */
export async function resolveRoleRequirements(
  organizationId: string,
  roles: RoleReqInput[] | undefined | null,
  fallbackTotals: { minWorkers: number; idealWorkers: number },
  fallbackLaborRoleId?: string | null,
): Promise<RoleReqRow[]> {
  if (roles && roles.length > 0) {
    return normalizeRoleRequirements(roles)
  }

  const baseRoleId = fallbackLaborRoleId || (await getDefaultLaborRoleId(organizationId))
  if (!baseRoleId) {
    throw new Error(
      'La organización no tiene roles configurados. Crea al menos un rol antes de definir la cobertura.',
    )
  }

  const min = Math.max(0, Math.floor(fallbackTotals.minWorkers || 0))
  const ideal = Math.max(min, Math.floor(fallbackTotals.idealWorkers || 0))

  return [{ laborRoleId: baseRoleId, minWorkers: min, idealWorkers: ideal }]
}

// ── Lectura puntual (usada por los editores de la UI) ────────────────────────

export async function getSlotRoleRequirements(coverageRequirementId: string) {
  return (prisma as any).coverageRoleRequirement.findMany({
    where: { coverageRequirementId },
    include: { laborRole: true },
    orderBy: { createdAt: 'asc' },
  })
}
