/**
 * Migración: Employee.isActive (Boolean) → Employee.status (EmployeeStatus)
 *
 * isActive: true  → ACTIVE
 * isActive: false → INACTIVE
 *
 * Ejecutar con: npx ts-node --project tsconfig.json scripts/migrate-employee-status.ts
 * Es idempotente: si ya hay status asignados no los sobreescribe.
 */
import { prisma } from '../src/lib/prisma'

async function main() {
  const updated = await prisma.$executeRaw`
    UPDATE "Employee"
    SET status = CASE
      WHEN "isActive" = true  THEN 'ACTIVE'::"EmployeeStatus"
      WHEN "isActive" = false THEN 'INACTIVE'::"EmployeeStatus"
      ELSE 'INACTIVE'::"EmployeeStatus"
    END
    WHERE status IS NULL
  `
  console.log(`Migrados: ${updated} empleados`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
