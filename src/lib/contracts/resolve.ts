/**
 * Resolución de las condiciones de un contrato.
 *
 * Desde la migración a plantillas hay una sola fuente de verdad por valor:
 *
 *   Convenio (LegalFramework.rules)  →  límites legales
 *   Plantilla (ContractTemplateVersion) →  horas, horquilla, vacaciones
 *   Contrato (EmployeeContract)      →  alta, baja, salario
 *
 * Nada se copia entre capas. Este módulo las combina al leer y devuelve un
 * objeto plano con los MISMOS nombres de campo que tenía `EmployeeContract`
 * antes, para que el código que ya los consumía siga funcionando sin cambios.
 *
 * Regla de resolución: gana la capa más específica que tenga valor.
 *   versión de plantilla  ??  convenio  ??  valor por defecto
 *
 * No hay excepciones por empleado: si dos personas necesitan condiciones
 * distintas, son dos plantillas distintas.
 */

import type { LegalRules } from '@/lib/legalFrameworks'

export interface ResolvedContract {
  // Identificación de la plantilla aplicada
  templateId: string | null
  templateName: string | null
  templateVersion: number | null
  templateColor: string | null

  // Condiciones laborales
  contractType: string
  weeklyHours: number
  minWeeklyHours: number | null
  maxWeeklyHours: number | null

  // Límites (plantilla → convenio → defecto)
  maxDailyHours: number
  minRestBetweenShifts: number
  maxConsecutiveDays: number
  annualMaxHours: number

  // Vacaciones
  vacationDaysPerYear: number
  vacationDaysType: 'NATURALES' | 'LABORABLES'

  // Jornada
  preferContinuous: boolean
  allowSplit: boolean

  // Individuales del contrato
  hourlyWage: number | null
  hourlyCost: number | null
  startDate: Date | null
  endDate: Date | null
  isActive: boolean

  legalFrameworkId: string | null

  /** Qué capa aportó cada límite. Solo para mostrarlo en la UI. */
  origen: Record<string, 'plantilla' | 'convenio' | 'defecto'>
}

/** Valores de último recurso: sin plantilla y sin convenio. */
const DEFECTOS = {
  contractType: 'FULL_TIME',
  weeklyHours: 40,
  maxDailyHours: 9,
  minRestBetweenShifts: 12,
  maxConsecutiveDays: 6,
  annualMaxHours: 1791,
  vacationDaysPerYear: 30,
  vacationDaysType: 'NATURALES' as const,
}

/**
 * Combina contrato + versión de plantilla + convenio.
 *
 * @param contract  fila de EmployeeContract, idealmente con `templateVersion`
 *                  incluido (y dentro de él `template`).
 * @param rules     reglas del convenio aplicable, si se han cargado.
 */
export function resolveContract(
  contract: any | null | undefined,
  rules?: Partial<LegalRules> | null,
): ResolvedContract {
  const v = contract?.templateVersion ?? null
  const tpl = v?.template ?? null
  const origen: ResolvedContract['origen'] = {}

  // Elige el primer valor no nulo y deja constancia de su procedencia.
  function elegir<T>(campo: string, dePlantilla: T | null | undefined, deConvenio: T | null | undefined, defecto: T): T {
    if (dePlantilla != null) { origen[campo] = 'plantilla'; return dePlantilla }
    if (deConvenio != null)  { origen[campo] = 'convenio';  return deConvenio }
    origen[campo] = 'defecto'
    return defecto
  }

  const maxDailyHours = elegir('maxDailyHours', v?.maxDailyHours, rules?.maxDailyHours, DEFECTOS.maxDailyHours)
  const minRest = elegir('minRestBetweenShifts', v?.minRestBetweenShifts, rules?.minRestBetweenShifts, DEFECTOS.minRestBetweenShifts)
  const maxConsec = elegir('maxConsecutiveDays', v?.maxConsecutiveDays, rules?.maxConsecutiveDays, DEFECTOS.maxConsecutiveDays)
  const annualMax = elegir('annualMaxHours', v?.annualMaxHours, rules?.maxAnnualHours, DEFECTOS.annualMaxHours)
  const vacDias = elegir('vacationDaysPerYear', v?.vacationDaysPerYear, rules?.vacationDaysMin, DEFECTOS.vacationDaysPerYear)
  const vacTipo = elegir('vacationDaysType', v?.vacationDaysType, rules?.vacationDaysType, DEFECTOS.vacationDaysType)

  return {
    templateId: tpl?.id ?? null,
    templateName: tpl?.name ?? null,
    templateVersion: v?.version ?? null,
    templateColor: tpl?.color ?? null,

    contractType: v?.contractType ?? DEFECTOS.contractType,
    weeklyHours: v?.weeklyHours ?? DEFECTOS.weeklyHours,
    minWeeklyHours: v?.minWeeklyHours ?? null,
    maxWeeklyHours: v?.maxWeeklyHours ?? null,

    maxDailyHours,
    minRestBetweenShifts: minRest,
    maxConsecutiveDays: maxConsec,
    annualMaxHours: annualMax,

    vacationDaysPerYear: vacDias,
    vacationDaysType: (vacTipo as 'NATURALES' | 'LABORABLES'),

    preferContinuous: v?.preferContinuous ?? true,
    allowSplit: v?.allowSplit ?? true,

    hourlyWage: contract?.hourlyWage ?? null,
    hourlyCost: contract?.hourlyCost ?? null,
    startDate: contract?.startDate ?? null,
    endDate: contract?.endDate ?? null,
    isActive: contract?.isActive ?? false,

    legalFrameworkId: v?.legalFrameworkId ?? null,
    origen,
  }
}

/** Contrato activo de un empleado, ya resuelto. */
export function resolveActiveContract(employee: any, rules?: Partial<LegalRules> | null): ResolvedContract | null {
  const c = (employee?.contracts ?? []).find((x: any) => x.isActive) ?? employee?.contracts?.[0]
  if (!c) return null
  return resolveContract(c, rules)
}

/**
 * `include` de Prisma para traer todo lo que el resolutor necesita.
 * Usarlo en cualquier consulta de empleados que vaya a leer condiciones.
 */
export const CONTRACT_INCLUDE = {
  where: { isActive: true },
  take: 1,
  include: {
    templateVersion: {
      include: { template: true },
    },
  },
} as const

/**
 * Configuración de vacaciones efectiva de un empleado.
 *
 * Antes vivía en `Employee.vacationDays*`; ahora sale de la plantilla, con el
 * convenio como respaldo. Los campos viejos del empleado se siguen leyendo
 * como último recurso mientras queden filas sin migrar.
 */
export function resolveVacationConfig(employee: any): {
  vacationDaysPerYear: number
  vacationDaysType: 'NATURALES' | 'LABORABLES'
} {
  const c = (employee?.contracts ?? []).find((x: any) => x.isActive) ?? employee?.contracts?.[0]
  const v = c?.templateVersion ?? null
  const reglas = employee?.legalFramework?.rules ?? null

  return {
    vacationDaysPerYear:
      v?.vacationDaysPerYear
      ?? reglas?.vacationDaysMin
      ?? employee?.vacationDaysPerYear
      ?? DEFECTOS.vacationDaysPerYear,
    vacationDaysType: (
      v?.vacationDaysType
      ?? reglas?.vacationDaysType
      ?? employee?.vacationDaysType
      ?? DEFECTOS.vacationDaysType
    ) as 'NATURALES' | 'LABORABLES',
  }
}

/** `include` para que resolveVacationConfig tenga todo lo que necesita. */
export const VACATION_INCLUDE = {
  contracts: {
    where: { isActive: true },
    take: 1,
    include: { templateVersion: true },
  },
  legalFramework: { select: { rules: true } },
} as const
