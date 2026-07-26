/**
 * ============================================================
 * Migración de datos — Desglose de cobertura por ROL
 * ============================================================
 *
 * Crea una fila CoverageRoleRequirement por cada slot existente que aún no
 * tenga desglose, replicando EXACTAMENTE el reparto que hacía el mapper del
 * solver hasta ahora. Objetivo: que tras migrar, el solver genere los mismos
 * cuadrantes que antes. Cero cambio de comportamiento.
 *
 * Reglas:
 *   - Slot SIN laborRoleId
 *       → 1 fila con el rol base (nivel más bajo): min = minWorkers,
 *         ideal = idealWorkers.
 *   - Slot CON laborRoleId de nivel > BASIC
 *       → 1 fila de ese rol con min 1 / ideal 1
 *       → + 1 fila del rol base con el resto (min-1 / ideal-1), si resto > 0.
 *   - Slot CON laborRoleId de nivel BASIC
 *       → 1 fila de ese rol: min = minWorkers, ideal = idealWorkers.
 *
 * Es IDEMPOTENTE: los slots que ya tienen desglose se saltan. Se puede
 * relanzar sin miedo.
 *
 * Uso:
 *   npx prisma db push          # crea la tabla nueva
 *   npx tsx scripts/migrate-coverage-roles.ts            # dry-run
 *   npx tsx scripts/migrate-coverage-roles.ts --apply    # escribe
 * ============================================================
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

const LEVEL_ORDER: Record<string, number> = {
  BASIC: 0,
  SEMI_MANAGER: 1,
  MANAGER: 2,
  OWNER: 3,
}

interface Row {
  coverageRequirementId: string
  laborRoleId: string
  minWorkers: number
  idealWorkers: number
}

async function main() {
  console.log(`\n▶ Migración de cobertura por rol — modo ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } })
  console.log(`Organizaciones: ${orgs.length}\n`)

  let totalSlots = 0
  let totalRows = 0
  let skipped = 0
  const problems: string[] = []

  for (const org of orgs) {
    // Rol base de la organización (nivel más bajo)
    const roles = await prisma.laborRole.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true, level: true, priority: true },
    })

    if (roles.length === 0) {
      problems.push(`⚠ "${org.name}" no tiene roles configurados — sus slots se omiten`)
      continue
    }

    roles.sort((a, b) => {
      const la = LEVEL_ORDER[a.level as unknown as string] ?? 99
      const lb = LEVEL_ORDER[b.level as unknown as string] ?? 99
      if (la !== lb) return la - lb
      return (a.priority ?? 0) - (b.priority ?? 0)
    })

    const baseRole = roles[0]
    const levelById = new Map<string, string>(roles.map(r => [r.id, r.level as unknown as string]))

    const slots = await prisma.coverageRequirement.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        laborRoleId: true,
        minWorkers: true,
        idealWorkers: true,
      },
    })

    if (slots.length === 0) continue

    // Slots que YA tienen desglose → no tocar
    const existing = await (prisma as any).coverageRoleRequirement.findMany({
      where: { coverageRequirementId: { in: slots.map(s => s.id) } },
      select: { coverageRequirementId: true },
    })
    const alreadyDone = new Set<string>(
      existing.map((e: any) => e.coverageRequirementId),
    )

    const rows: Row[] = []

    for (const slot of slots) {
      if (alreadyDone.has(slot.id)) {
        skipped++
        continue
      }
      totalSlots++

      const min = Math.max(0, slot.minWorkers ?? 0)
      const ideal = Math.max(min, slot.idealWorkers ?? min)

      const roleId = slot.laborRoleId
      const isBase = !roleId || (LEVEL_ORDER[levelById.get(roleId) ?? 'BASIC'] ?? 0) === 0

      if (isBase) {
        rows.push({
          coverageRequirementId: slot.id,
          laborRoleId: roleId ?? baseRole.id,
          minWorkers: min,
          idealWorkers: ideal,
        })
      } else {
        // 1 persona del rol superior + resto en el rol base
        rows.push({
          coverageRequirementId: slot.id,
          laborRoleId: roleId!,
          minWorkers: Math.min(1, min) || 1,
          idealWorkers: 1,
        })
        const restoMin = Math.max(0, min - 1)
        const restoIdeal = Math.max(restoMin, ideal - 1)
        if (restoIdeal > 0 && roleId !== baseRole.id) {
          rows.push({
            coverageRequirementId: slot.id,
            laborRoleId: baseRole.id,
            minWorkers: restoMin,
            idealWorkers: restoIdeal,
          })
        }
      }
    }

    totalRows += rows.length
    console.log(
      `  ${org.name.padEnd(28)} slots: ${String(slots.length).padStart(5)}  ` +
      `nuevos: ${String(rows.length).padStart(5)}  rol base: ${baseRole.name}`,
    )

    if (APPLY && rows.length > 0) {
      // Insertar por lotes para no reventar el límite de parámetros de PG
      const CHUNK = 1000
      for (let i = 0; i < rows.length; i += CHUNK) {
        await (prisma as any).coverageRoleRequirement.createMany({
          data: rows.slice(i, i + CHUNK),
          skipDuplicates: true,
        })
      }
    }
  }

  console.log(`\n── Resumen ────────────────────────────────`)
  console.log(`  Slots migrados : ${totalSlots}`)
  console.log(`  Filas creadas  : ${totalRows}`)
  console.log(`  Ya migrados    : ${skipped}`)
  for (const p of problems) console.log(`  ${p}`)

  if (!APPLY) {
    console.log(`\n  DRY-RUN — no se ha escrito nada.`)
    console.log(`  Relanza con --apply para aplicar.\n`)
  } else {
    console.log(`\n  ✓ Migración aplicada.\n`)
  }
}

main()
  .catch(e => {
    console.error('\n✗ Error en la migración:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
