/**
 * Periodo de alta del empleado — fuente única de verdad.
 *
 * `status` (ACTIVE / INACTIVE / ARCHIVED) responde a "¿aparece en la app hoy?".
 * `hireDate` / `terminationDate` responden a "¿estaba de alta ESE día?".
 * Son cosas distintas: un empleado que se fue en marzo sigue debiendo aparecer
 * en el cuadrante de febrero, y uno que entra en septiembre no debe contar en
 * la capacidad de agosto.
 *
 * Reglas:
 *  - Sin `hireDate` → se asume de alta desde siempre (datos heredados).
 *  - Sin `terminationDate` → sigue de alta indefinidamente.
 *  - Ambos límites son INCLUSIVOS: el día del alta y el día de la baja cuentan
 *    como trabajados.
 *
 * Todas las comparaciones se hacen sobre cadenas 'YYYY-MM-DD' para evitar
 * desplazamientos de zona horaria (el resto de la app normaliza a UTC medianoche).
 */

export interface EmploymentDates {
  hireDate?: Date | string | null
  terminationDate?: Date | string | null
}

export type EmploymentBlock = 'BEFORE_HIRE' | 'AFTER_TERMINATION' | null

/** Normaliza cualquier fecha a 'YYYY-MM-DD'. Devuelve null si no hay valor. */
export function toDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/** ¿Estaba el empleado de alta en esta fecha concreta? */
export function isEmployeeActiveOn(emp: EmploymentDates, dateISO: string): boolean {
  return employmentBlockForDay(emp, dateISO) === null
}

/**
 * Motivo por el que un día queda fuera del periodo de alta, o null si es válido.
 * El planificador lo usa para pintar la celda bloqueada con el texto correcto.
 */
export function employmentBlockForDay(emp: EmploymentDates, dateISO: string): EmploymentBlock {
  const day = dateISO.slice(0, 10)
  const hire = toDateKey(emp.hireDate)
  const term = toDateKey(emp.terminationDate)
  if (hire && day < hire) return 'BEFORE_HIRE'
  if (term && day > term) return 'AFTER_TERMINATION'
  return null
}

/**
 * ¿Estuvo de alta al menos un día dentro del rango (ambos extremos inclusive)?
 * Es la regla que usa la capacidad de cobertura: si trabaja aunque sea un día
 * de la semana, cuenta con sus horas semanales completas.
 */
export function isEmployeeActiveInRange(emp: EmploymentDates, startISO: string, endISO: string): boolean {
  const start = startISO.slice(0, 10)
  const end = endISO.slice(0, 10)
  const hire = toDateKey(emp.hireDate)
  const term = toDateKey(emp.terminationDate)
  if (hire && hire > end) return false      // entra después de que acabe el rango
  if (term && term < start) return false    // se fue antes de que empiece
  return true
}

/** Días del rango en los que el empleado estuvo de alta. */
export function activeDaysInRange(emp: EmploymentDates, dates: string[]): string[] {
  return dates.filter(d => isEmployeeActiveOn(emp, d))
}

/** Filtra una lista de empleados dejando los que estuvieron de alta en el rango. */
export function filterActiveInRange<T extends EmploymentDates>(
  employees: T[],
  startISO: string,
  endISO: string,
): T[] {
  return employees.filter(e => isEmployeeActiveInRange(e, startISO, endISO))
}

/** Etiqueta corta para la UI de celdas bloqueadas. */
export function employmentBlockLabel(block: EmploymentBlock): string {
  if (block === 'BEFORE_HIRE') return 'Sin alta'
  if (block === 'AFTER_TERMINATION') return 'Baja'
  return ''
}
