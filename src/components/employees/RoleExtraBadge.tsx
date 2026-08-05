'use client'

import { useState, useRef } from 'react'
import { employeeSkillsOf } from '@/lib/employee-color'

/**
 * Badge "+N" que indica el número de habilidades (skills) del empleado.
 * Al pasar el ratón muestra un tooltip con la lista de skills.
 *
 * El tooltip usa position:fixed calculado sobre el viewport para no quedar
 * cortado por contenedores padres con overflow:hidden (listas, columnas, etc.).
 */
export function RoleExtraBadge({ employee, size = 'md' }: {
  employee: any
  size?: 'sm' | 'md'
}) {
  const skills = employeeSkillsOf(employee)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  if (skills.length === 0) return null

  const sizeCls = size === 'sm'
    ? 'text-[9px] px-1 py-[1px] rounded-md'
    : 'text-[10px] px-1.5 py-0.5 rounded-md'

  function show() {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
  }

  function hide() { setPos(null) }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={`${sizeCls} font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 cursor-help transition-colors inline-block`}
      >
        +{skills.length}
      </span>

      {pos && (
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="bg-gray-900 text-white text-[10px] rounded-md px-2 py-1.5 shadow-lg whitespace-nowrap">
            <div className="font-semibold text-gray-300 mb-1 text-[9px] uppercase tracking-wider">Habilidades</div>
            {skills.map((s, i) => (
              <div key={s.id ?? i} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color ?? '#f59e0b' }}
                />
                {s.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
