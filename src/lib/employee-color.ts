// ============================================================
// Color de empleado derivado del ROL.
// ------------------------------------------------------------
// Regla de producto: los empleados NO tienen color propio. El color con el
// que se pintan (cuadrante, listas, dashboard, fichaje, etc.) sale SIEMPRE de
// su rol. Si un empleado tiene varios roles, manda el de mayor nivel (su
// rango). Si no tiene ningún rol asignado, se usa el color del rol base más
// bajo de la organización; y si tampoco hay roles configurados, un gris
// neutro por defecto.
// ============================================================

// Color por defecto cuando no hay ningún rol del que tirar.
export const DEFAULT_EMPLOYEE_COLOR = '#9ca3af' // gris neutro (tailwind gray-400)

// Orden jerárquico de niveles (menor → mayor).
const LEVEL_ORDER: Record<string, number> = {
  BASIC: 0,
  SEMI_MANAGER: 1,
  MANAGER: 2,
  OWNER: 3,
}

interface LaborRoleLike {
  id?: string
  name?: string | null
  color?: string | null
  level?: string | null
  priority?: number | null
}

interface EmployeeSkillLike {
  laborRole?: LaborRoleLike | null
  laborRoleId?: string | null
}

interface EmployeeLike {
  skills?: EmployeeSkillLike[] | null
  // Compatibilidad: algunos payloads podrían traer laborRole directo.
  laborRole?: LaborRoleLike | null
}

function levelOf(role: LaborRoleLike | null | undefined): number {
  if (!role) return -1
  return LEVEL_ORDER[role.level ?? 'BASIC'] ?? 0
}

/**
 * Devuelve el rol que define la identidad visual del empleado: el de MAYOR
 * nivel entre sus skills (desempate por priority más baja). null si no tiene.
 */
export function primaryRoleOf(employee: EmployeeLike | null | undefined): LaborRoleLike | null {
  if (!employee) return null

  // Caso simple: laborRole directo en el payload.
  if (employee.laborRole && employee.laborRole.color) return employee.laborRole

  const roles = (employee.skills ?? [])
    .map(s => s.laborRole)
    .filter((r): r is LaborRoleLike => !!r)

  if (roles.length === 0) return null

  return roles.slice().sort((a, b) => {
    const la = levelOf(a), lb = levelOf(b)
    if (la !== lb) return lb - la // mayor nivel primero
    return (a.priority ?? 0) - (b.priority ?? 0)
  })[0]
}

/**
 * Rol base más bajo de una lista de roles de la organización (el de menor
 * nivel; desempate por priority). Se usa como fallback de color cuando un
 * empleado no tiene rol.
 */
export function lowestBaseRole(roles: LaborRoleLike[] | null | undefined): LaborRoleLike | null {
  if (!roles || roles.length === 0) return null
  return roles.slice().sort((a, b) => {
    const la = levelOf(a), lb = levelOf(b)
    if (la !== lb) return la - lb // menor nivel primero
    return (a.priority ?? 0) - (b.priority ?? 0)
  })[0]
}

/**
 * Color con el que pintar a un empleado. Prioridad:
 *   1. Color del rol de mayor nivel del empleado.
 *   2. Color del rol base más bajo de la organización (si se pasan `roles`).
 *   3. Gris neutro por defecto.
 *
 * @param employee  Empleado (con skills.laborRole incluido).
 * @param roles     Roles de la organización, para el fallback sin rol. Opcional.
 */
export function employeeColor(
  employee: EmployeeLike | null | undefined,
  roles?: LaborRoleLike[] | null,
): string {
  const own = primaryRoleOf(employee)
  if (own?.color) return own.color

  const base = lowestBaseRole(roles)
  if (base?.color) return base.color

  return DEFAULT_EMPLOYEE_COLOR
}

// ── Variantes de color para el cuadrante ─────────────────────────────────────

export interface ColorShades {
  bg: string      // fondo claro
  border: string  // borde medio
  text: string    // texto oscuro (legible sobre bg)
  dot: string     // color base saturado (punto / acento)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

/**
 * Deriva las 4 variantes del cuadrante a partir del color base de un rol.
 * - bg: el color mezclado con blanco al ~90% (fondo suave).
 * - border: mezclado con blanco al ~45%.
 * - text: mezclado con negro al ~55% (oscuro, legible).
 * - dot: el color base tal cual.
 */
export function colorShades(baseHex: string): ColorShades {
  const { r, g, b } = hexToRgb(baseHex || DEFAULT_EMPLOYEE_COLOR)
  const toward = (target: number, t: number) =>
    rgbToHex(mix(r, target, t), mix(g, target, t), mix(b, target, t))
  return {
    bg: toward(255, 0.9),
    border: toward(255, 0.45),
    text: toward(0, 0.55),
    dot: rgbToHex(r, g, b),
  }
}

/**
 * Atajo: variantes de color de un empleado, ya derivadas de su rol
 * (con fallback a rol base / gris por defecto).
 */
export function employeeColorShades(
  employee: EmployeeLike | null | undefined,
  roles?: LaborRoleLike[] | null,
): ColorShades {
  return colorShades(employeeColor(employee, roles))
}

/**
 * Devuelve los roles del empleado que NO son el principal (para el badge "+N").
 * El principal es el de mayor nivel (ver primaryRoleOf). Los adicionales se
 * devuelven ordenados por nivel descendente y luego por priority.
 */
export function additionalRolesOf(
  employee: EmployeeLike | null | undefined,
): LaborRoleLike[] {
  if (!employee) return []
  const roles = (employee.skills ?? [])
    .map(s => s.laborRole)
    .filter((r): r is LaborRoleLike => !!r)

  if (roles.length <= 1) return []

  const primary = primaryRoleOf(employee)
  const rest = roles.filter(r => r.id !== primary?.id)
  return rest.sort((a, b) => {
    const la = levelOf(a), lb = levelOf(b)
    if (la !== lb) return lb - la
    return (a.priority ?? 0) - (b.priority ?? 0)
  })
}
