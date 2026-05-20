'use client'

// ============================================================
// ValidationPanel + EmployeeHoursSummary
// components/planning/ValidationPanel.tsx
// ============================================================

import { AlertCircle, AlertTriangle, Info, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidationIssue, EmployeeWeekRow } from '@/types'

// ---- ValidationPanel ----

interface ValidationPanelProps {
  issues: ValidationIssue[]
  employeeRows: EmployeeWeekRow[]
}

export function ValidationPanel({ issues, employeeRows }: ValidationPanelProps) {
  const blocking = issues.filter((i) => i.severity === 'BLOCKING')
  const errors = issues.filter((i) => i.severity === 'ERROR')
  const warnings = issues.filter((i) => i.severity === 'WARNING')
  const infos = issues.filter((i) => i.severity === 'INFO')

  const totalCritical = blocking.length + errors.length

  return (
    <div className="w-[220px] min-w-[220px] border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Alertas
        </span>
        {totalCritical > 0 && (
          <span className="bg-red-100 text-red-600 text-[10px] font-semibold rounded-full px-2 py-0.5">
            {totalCritical}
          </span>
        )}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <AlertCircle size={16} className="text-emerald-600" />
            </div>
            <p className="text-[11px] text-gray-400">Sin alertas activas</p>
          </div>
        ) : (
          <>
            {blocking.map((issue) => (
              <IssueItem key={issue.id} issue={issue} />
            ))}
            {errors.map((issue) => (
              <IssueItem key={issue.id} issue={issue} />
            ))}
            {warnings.map((issue) => (
              <IssueItem key={issue.id} issue={issue} />
            ))}
            {infos.map((issue) => (
              <IssueItem key={issue.id} issue={issue} />
            ))}
          </>
        )}
      </div>

      {/* Hours summary */}
      <div className="border-t border-gray-100">
        <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Horas semanales
        </div>
        <div className="pb-2">
          <EmployeeHoursSummary rows={employeeRows} />
        </div>
      </div>
    </div>
  )
}

function IssueItem({ issue }: { issue: ValidationIssue }) {
  const config = {
    BLOCKING: {
      icon: <AlertCircle size={12} />,
      iconClass: 'bg-red-100 text-red-600',
      textClass: 'text-red-700',
      bgClass: 'hover:bg-red-50',
    },
    ERROR: {
      icon: <AlertCircle size={12} />,
      iconClass: 'bg-red-100 text-red-600',
      textClass: 'text-red-600',
      bgClass: 'hover:bg-red-50',
    },
    WARNING: {
      icon: <AlertTriangle size={12} />,
      iconClass: 'bg-amber-100 text-amber-600',
      textClass: 'text-amber-700',
      bgClass: 'hover:bg-amber-50',
    },
    INFO: {
      icon: <Info size={12} />,
      iconClass: 'bg-blue-100 text-blue-600',
      textClass: 'text-blue-600',
      bgClass: 'hover:bg-blue-50',
    },
  }[issue.severity] ?? {
    icon: <Info size={12} />,
    iconClass: 'bg-gray-100 text-gray-500',
    textClass: 'text-gray-600',
    bgClass: 'hover:bg-gray-50',
  }

  return (
    <div className={cn('flex gap-2 items-start px-3 py-2.5 border-b border-gray-50 cursor-pointer transition-colors', config.bgClass)}>
      <div className={cn('w-[18px] h-[18px] rounded-[4px] flex items-center justify-center flex-shrink-0 mt-0.5', config.iconClass)}>
        {config.icon}
      </div>
      <div className="min-w-0">
        <p className={cn('text-[11px] font-medium leading-tight', config.textClass)}>
          {issue.message}
        </p>
        {issue.suggestion && (
          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{issue.suggestion}</p>
        )}
      </div>
    </div>
  )
}

// ---- EmployeeHoursSummary ----

interface EmployeeHoursSummaryProps {
  rows: EmployeeWeekRow[]
}

export function EmployeeHoursSummary({ rows }: EmployeeHoursSummaryProps) {
  return (
    <div className="space-y-1 px-3">
      {rows.map(({ employee, weeklyHours, isOverContract, isUnderContract }) => {
        const maxHours = employee.contract?.maxWeeklyHours
          ?? (employee.contract?.weeklyHours ?? 40) + 4
        const pct = Math.min(100, (weeklyHours / maxHours) * 100)

        return (
          <div key={employee.id} className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: employee.color }}
            />
            <span className="text-[11px] text-gray-500 flex-1 truncate">
              {employee.firstName}
            </span>
            <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isOverContract ? '#dc2626' : isUnderContract ? '#d97706' : '#059669',
                }}
              />
            </div>
            <span className={cn(
              'text-[11px] font-medium w-10 text-right',
              isOverContract ? 'text-red-600' : isUnderContract ? 'text-amber-500' : 'text-gray-700',
            )}>
              {weeklyHours.toFixed(0)}h
            </span>
          </div>
        )
      })}
    </div>
  )
}
