'use client'

import { employeeSkillsOf } from '@/lib/employee-color'

/**
 * Badge "+N" que indica el número de habilidades (skills) del empleado
 * (Barista, Cajera, Bandejera…). Al pasar el ratón muestra un tooltip CSS
 * con la lista de skills. No renderiza nada si el empleado no tiene ninguna.
 *
 * Se cuenta cada skill como uno, incluso si el empleado solo tiene una:
 * un empleado con Barista sale como "+1", con Barista y Cajera como "+2".
 */
export function RoleExtraBadge({ employee, size = 'md' }: {
  employee: any
  size?: 'sm' | 'md'
}) {
  const skills = employeeSkillsOf(employee)
  if (skills.length === 0) return null

  const sizeCls = size === 'sm'
    ? 'text-[9px] px-1 py-[1px] rounded-md'
    : 'text-[10px] px-1.5 py-0.5 rounded-md'

  return (
    <span className="relative group/skillsbadge inline-flex items-center">
      <span
        className={`${sizeCls} font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 cursor-help transition-colors`}
      >
        +{skills.length}
      </span>

      {/* Tooltip CSS puro — sin state, sin listeners */}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 opacity-0 group-hover/skillsbadge:opacity-100 transition-opacity z-50 whitespace-nowrap">
        <span className="block bg-gray-900 text-white text-[10px] rounded-md px-2 py-1.5 shadow-lg">
          <span className="block font-semibold text-gray-300 mb-1 text-[9px] uppercase tracking-wider">Habilidades</span>
          {skills.map((s, i) => (
            <span key={s.id ?? i} className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color ?? '#f59e0b' }}
              />
              {s.name}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}
