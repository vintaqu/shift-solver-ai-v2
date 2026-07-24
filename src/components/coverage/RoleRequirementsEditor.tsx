'use client'

// ============================================================
// Editor dinámico de necesidades por ROL de un slot de cobertura.
// ------------------------------------------------------------
// En lugar de un total global "mínimo/ideal", el usuario añade roles uno a
// uno con un botón "+", y cada rol lleva su propio mínimo e ideal. El total
// del slot es la SUMA de los roles (derivado, solo lectura).
//
// Reglas de UX:
//   - Siempre hay al menos una fila (no se puede quedar vacío).
//   - Solo aparecen en el desplegable "+" los roles aún no añadidos.
//   - ideal >= min >= 0. El botón − del ideal no baja del min.
//   - Al abrir un slot sin desglose, se precarga el rol de menor nivel.
// ============================================================

import { useMemo, useRef, useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Orden jerárquico de niveles (menor → mayor)
const LEVEL_ORDER: Record<string, number> = {
  BASIC: 0,
  SEMI_MANAGER: 1,
  MANAGER: 2,
  OWNER: 3,
}

export interface RoleRow {
  laborRoleId: string
  minWorkers: number
  idealWorkers: number
}

export interface LaborRoleOption {
  id: string
  name: string
  color: string
  level?: string
  priority?: number
}

/** Ordena roles por nivel jerárquico y luego por priority. */
export function sortRoles(roles: LaborRoleOption[]): LaborRoleOption[] {
  return [...roles].sort((a, b) => {
    const la = LEVEL_ORDER[a.level ?? 'BASIC'] ?? 99
    const lb = LEVEL_ORDER[b.level ?? 'BASIC'] ?? 99
    if (la !== lb) return la - lb
    return (a.priority ?? 0) - (b.priority ?? 0)
  })
}

/**
 * Construye las filas iniciales del editor a partir de un slot.
 * - Si el slot trae `roleRequirements`, se usan tal cual.
 * - Si no (slot nuevo o legacy sin migrar), se precarga el rol de menor nivel
 *   con los totales del slot (o 1/1 si no hay totales).
 */
export function initialRoleRows(
  slot: any | null,
  roles: LaborRoleOption[],
): RoleRow[] {
  const existing = slot?.roleRequirements
  if (Array.isArray(existing) && existing.length > 0) {
    return existing.map((rr: any) => ({
      laborRoleId: rr.laborRoleId,
      minWorkers: rr.minWorkers ?? 1,
      idealWorkers: rr.idealWorkers ?? rr.minWorkers ?? 1,
    }))
  }

  const sorted = sortRoles(roles)
  const baseRole = sorted[0]
  if (!baseRole) return []

  const min = slot?.minWorkers ?? 1
  const ideal = Math.max(min, slot?.idealWorkers ?? min)
  return [{ laborRoleId: baseRole.id, minWorkers: min, idealWorkers: ideal }]
}

interface Props {
  value: RoleRow[]
  onChange: (rows: RoleRow[]) => void
  roles: LaborRoleOption[]
  disabled?: boolean
}

export function RoleRequirementsEditor({ value, onChange, roles, disabled }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  const sortedRoles = useMemo(() => sortRoles(roles), [roles])
  const roleById = useMemo(
    () => new Map(roles.map(r => [r.id, r])),
    [roles],
  )

  // Roles aún no añadidos (los que puede ofrecer el botón "+")
  const available = useMemo(
    () => sortedRoles.filter(r => !value.some(v => v.laborRoleId === r.id)),
    [sortedRoles, value],
  )

  // Cerrar el desplegable "+" al hacer click fuera
  useEffect(() => {
    if (!addOpen) return
    const onDoc = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [addOpen])

  const totals = useMemo(() => {
    let min = 0, ideal = 0
    for (const r of value) { min += r.minWorkers; ideal += r.idealWorkers }
    return { min, ideal }
  }, [value])

  function updateRow(idx: number, patch: Partial<RoleRow>) {
    const next = value.map((r, i) => {
      if (i !== idx) return r
      const merged = { ...r, ...patch }
      // invariantes: min >= 0, ideal >= min
      merged.minWorkers = Math.max(0, merged.minWorkers)
      merged.idealWorkers = Math.max(merged.minWorkers, merged.idealWorkers)
      return merged
    })
    onChange(next)
  }

  function addRole(roleId: string) {
    onChange([...value, { laborRoleId: roleId, minWorkers: 1, idealWorkers: 1 }])
    setAddOpen(false)
  }

  function removeRow(idx: number) {
    if (value.length <= 1) return // nunca dejar el slot sin roles
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {value.map((row, idx) => {
        const role = roleById.get(row.laborRoleId)
        const canRemove = value.length > 1 && !disabled
        return (
          <div
            key={row.laborRoleId}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 bg-white"
          >
            {/* Rol (punto de color + nombre) */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: role?.color ?? '#9ca3af' }}
              />
              <span className="text-[13px] font-semibold text-gray-700 truncate">
                {role?.name ?? 'Rol desconocido'}
              </span>
            </div>

            {/* Mínimo */}
            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Mín</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={disabled}
                  onClick={() => updateRow(idx, { minWorkers: row.minWorkers - 1 })}
                  className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-40">−</button>
                <span className="text-[15px] font-bold w-6 text-center text-gray-800">{row.minWorkers}</span>
                <button type="button" disabled={disabled}
                  onClick={() => updateRow(idx, { minWorkers: row.minWorkers + 1 })}
                  className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-40">+</button>
              </div>
            </div>

            {/* Ideal */}
            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Ideal</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={disabled}
                  onClick={() => updateRow(idx, { idealWorkers: row.idealWorkers - 1 })}
                  className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-40">−</button>
                <span className="text-[15px] font-bold w-6 text-center text-indigo-600">{row.idealWorkers}</span>
                <button type="button" disabled={disabled}
                  onClick={() => updateRow(idx, { idealWorkers: row.idealWorkers + 1 })}
                  className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-40">+</button>
              </div>
            </div>

            {/* Quitar rol */}
            <button
              type="button"
              onClick={() => removeRow(idx)}
              disabled={!canRemove}
              title={canRemove ? 'Quitar rol' : 'El slot debe tener al menos un rol'}
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                canRemove ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-200 cursor-not-allowed',
              )}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}

      {/* Botón + Añadir rol */}
      {available.length > 0 && !disabled && (
        <div className="relative" ref={addRef}>
          <button
            type="button"
            onClick={() => setAddOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-300 text-[12px] font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors w-full justify-center"
          >
            <Plus size={14} /> Añadir rol
          </button>

          {addOpen && (
            <div className="absolute z-10 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 py-1 max-h-52 overflow-y-auto">
              {available.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => addRole(r.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-[13px] font-medium text-gray-700">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Total derivado (solo lectura) */}
      <div className="flex items-center justify-end gap-2 pt-1 text-[11px] text-gray-500">
        <span className="font-medium">Total del slot:</span>
        <span className="font-bold text-gray-700">{totals.min} mín</span>
        <span className="text-gray-300">/</span>
        <span className="font-bold text-indigo-600">{totals.ideal} ideal</span>
      </div>
    </div>
  )
}
