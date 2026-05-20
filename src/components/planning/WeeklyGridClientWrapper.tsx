'use client'

// ============================================================
// WeeklyGridClientWrapper
// components/planning/WeeklyGridClientWrapper.tsx
// ============================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addWeeks, subWeeks } from 'date-fns'
import { toast } from 'sonner'
import { WeeklyScheduleGrid } from './WeeklyScheduleGrid'
import {
  publishPlanningPeriod,
  createPlanningPeriod,
  generateScheduleFromApi,
} from '@/server/actions/planning'
import { GenerateScheduleModal } from './GenerateScheduleModal'
import type { WeeklyGridData } from '@/types'

interface Props {
  data: WeeklyGridData
  organizationId: string
  locationId: string
  planningPeriodId: string
}

export function WeeklyGridClientWrapper({
  data,
  organizationId,
  locationId,
  planningPeriodId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showGenerate, setShowGenerate] = useState(false)

  const handleWeekChange = (direction: 1 | -1) => {
    const currentWeekStart = new Date(data.planningPeriod.weekStart)
    const newWeekStart = direction === 1
      ? addWeeks(currentWeekStart, 1)
      : subWeeks(currentWeekStart, 1)

    startTransition(async () => {
      try {
        // Check if a planning period exists for this week
        // In full implementation, query DB; here we create a new one
        const period = await createPlanningPeriod({
          organizationId,
          locationId,
          weekStart: newWeekStart,
        })
        router.push(`/planning/week/${period.id}`)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  const handlePublish = () => {
    startTransition(async () => {
      try {
        await publishPlanningPeriod(planningPeriodId)
        toast.success('Cuadrante publicado y notificado al equipo')
        router.refresh()
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  const handleGenerate = async (weekStart: Date) => {
    const result = await generateScheduleFromApi({
      organizationId,
      locationId,
      weekStart,
      lockedPlanningPeriodId: planningPeriodId,
    })

    if (result.success && result.planningPeriodId) {
      toast.success(`Cuadrante generado — score: ${result.score}/100`)
      if (result.warnings?.length) {
        result.warnings.forEach((w) => toast.warning(w))
      }
      router.push(`/planning/week/${result.planningPeriodId}`)
    } else {
      toast.error(result.error ?? 'Error al generar el cuadrante')
    }
  }

  return (
    <>
      <WeeklyScheduleGrid
        data={data}
        organizationId={organizationId}
        locationId={locationId}
        onWeekChange={handleWeekChange}
        onPublish={handlePublish}
        onGenerate={() => setShowGenerate(true)}
      />

      {showGenerate && (
        <GenerateScheduleModal
          weekStart={new Date(data.planningPeriod.weekStart)}
          onClose={() => setShowGenerate(false)}
          onGenerate={handleGenerate}
        />
      )}
    </>
  )
}
