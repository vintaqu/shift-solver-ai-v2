'use client'

import { additionalRolesOf } from '@/lib/employee-color'

/**
 * Badge "+N" que indica roles adicionales del empleado (más allá del principal).
 * Al pasar el ratón muestra un tooltip CSS con la lista de roles extra.
 * No renderiza nada si el empleado solo tiene un rol.
 */
export function RoleExtraBadge({ employee, size = 'md' }: {
  employee: any
  size?: 'sm' | 'md'
}) {
  const extras = additionalRolesOf(employee)
  if (extras.length === 0) return null

  const sizeCls = size === 'sm'
    ? 'text-[9px] px-1 py-[1px] rounded-md'
    : 'text-[10px] px-1.5 py-0.5 rounded-md'

  return (
    <span className="relative group/rolextra inline-flex items-center">
      <span
        className={`${sizeCls} font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-help transition-colors`}
      >
        +{extras.length}
      </span>

      {/* Tooltip CSS puro — sin state, sin listeners */}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 opacity-0 group-hover/rolextra:opacity-100 transition-opacity z-50 whitespace-nowrap">
        <span className="block bg-gray-900 text-white text-[10px] rounded-md px-2 py-1 shadow-lg">
          <span className="block font-semibold text-gray-300 mb-0.5 text-[9px] uppercase tracking-wider">Otros roles</span>
          {extras.map((r, i) => (
            <span key={r.id ?? i} className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: r.color ?? '#9ca3af' }}
              />
              {r.name}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}
