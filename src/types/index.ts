// ============================================================
// Shift Solver AI — Core Types
// ============================================================

export type UserRole = 'SUPER_ADMIN' | 'ORG_OWNER' | 'MANAGER' | 'EMPLOYEE'
export type ContractType = 'FULL_TIME' | 'PART_TIME' | 'OWNER' | 'EXTRA' | 'TEMPORAL'
export type PlanningStatus = 'DRAFT' | 'GENERATED' | 'REVIEWED' | 'PUBLISHED' | 'ARCHIVED'
export type PlanningOrigin = 'MANUAL' | 'AUTOMATIC' | 'MIXED'
export type AssignmentOrigin = 'AUTOMATIC' | 'MANUAL' | 'EDITED'
export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
export type AvailabilityType = 'DAY_OFF' | 'NOT_BEFORE' | 'NOT_AFTER' | 'ONLY_BETWEEN' | 'PREFER'
export type AbsenceType = 'VACACIONES' | 'BAJA' | 'PERMISO' | 'AUSENCIA' | 'ASUNTO_PROPIO'
export type AbsenceStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type RuleSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING'
export type LaborRoleLevel = 'BASIC' | 'SEMI_MANAGER' | 'MANAGER' | 'OWNER'

// ---- Domain entities (lightweight, UI-safe versions) ----

export interface Organization {
  id: string
  name: string
  slug: string
  timezone: string
  sector?: string | null
  logoUrl?: string | null
}

export interface Location {
  id: string
  organizationId: string
  name: string
  city?: string | null
  timezone: string
  openingHours?: Record<string, { open: string; close: string }> | null
  isActive: boolean
}

export interface LaborRole {
  id: string
  name: string
  level: LaborRoleLevel
  color: string
  isCritical: boolean
}

export interface Skill {
  id: string
  name: string
  color: string
}

export interface EmployeeContract {
  id: string
  contractType: ContractType
  weeklyHours: number
  minWeeklyHours?: number | null
  maxWeeklyHours?: number | null
  maxDailyHours: number
  maxConsecutiveDays: number
  minRestBetweenShifts: number // hours
  annualMaxHours: number
  startDate: Date
  endDate?: Date | null
  isActive: boolean
  collectiveAgreement?: string | null
}

export interface Employee {
  id: string
  organizationId: string
  locationId?: string | null
  firstName: string
  lastName: string
  fullName: string
  email?: string | null
  color: string
  isActive: boolean
  initials: string
  contract?: EmployeeContract | null
  laborRole?: LaborRole | null
  skills: Skill[]
  // computed week metrics (populated when rendering planning)
  weeklyHours?: number
  overtimeHours?: number
  nightHours?: number
}

export interface ShiftTemplate {
  id: string
  name: string
  code: string
  startTime: string // "08:00"
  endTime: string   // "16:00"
  durationMinutes: number
  breakMinutes: number
  color: string
  isNocturnal: boolean
  isSplit: boolean
}

export interface ScheduleAssignment {
  id: string
  planningPeriodId: string
  employeeId: string
  locationId: string
  laborRoleId?: string | null
  shiftTemplateId?: string | null
  date: Date
  startTime: string  // "08:00"
  endTime: string    // "16:00"
  breakMinutes: number
  origin: AssignmentOrigin
  status: AssignmentStatus
  isLocked: boolean
  isSplit: boolean
  splitPairId?: string | null
  normalHours: number
  nightHours: number
  overtimeHours: number
  estimatedCost?: number | null
  notes?: string | null
  // populated relations
  employee?: Employee
  laborRole?: LaborRole | null
  shiftTemplate?: ShiftTemplate | null
}

export interface PlanningPeriod {
  id: string
  organizationId: string
  locationId: string
  weekStart: Date
  weekEnd: Date
  status: PlanningStatus
  origin: PlanningOrigin
  version: number
  apiScore?: number | null
  publishedAt?: Date | null
  assignments: ScheduleAssignment[]
  validationIssues: ValidationIssue[]
}

export interface ValidationIssue {
  id: string
  planningPeriodId: string
  employeeId?: string | null
  assignmentId?: string | null
  type: string
  severity: RuleSeverity
  message: string
  suggestion?: string | null
  isResolved: boolean
}

export interface CoverageRequirement {
  id: string
  locationId: string
  dayOfWeek: number // 0=Mon, 6=Sun
  startTime: string
  endTime: string
  laborRoleId?: string | null
  skillId?: string | null
  minWorkers: number
  idealWorkers: number
  isRequired: boolean
}

export interface AbsenceRequest {
  id: string
  employeeId: string
  type: AbsenceType
  startDate: Date
  endDate: Date
  status: AbsenceStatus
  comment?: string | null
}

// ---- Planning Grid types (UI layer) ----

export interface DayCoverage {
  dayIndex: number // 0=Mon
  achieved: number
  required: number
  percentage: number
  hasGap: boolean
}

export interface EmployeeWeekRow {
  employee: Employee
  assignments: (ScheduleAssignment | null)[] // 7 slots, one per day
  weeklyHours: number
  isOverContract: boolean
  isUnderContract: boolean
}

export interface WeeklyGridData {
  planningPeriod: PlanningPeriod
  weekDays: Date[] // 7 dates
  employeeRows: EmployeeWeekRow[]
  coverageByDay: DayCoverage[]
  totalIssues: number
  criticalIssues: number
}

// ---- Shift Editor form ----

export interface ShiftEditorFormValues {
  employeeId: string
  date: Date
  startTime: string
  endTime: string
  laborRoleId?: string
  shiftTemplateId?: string
  isSplit: boolean
  splitStartTime2?: string
  splitEndTime2?: string
  breakMinutes: number
  notes?: string
  isLocked: boolean
}

export interface ShiftEditorContext {
  isOpen: boolean
  mode: 'create' | 'edit'
  employeeId?: string
  dayIndex?: number
  assignmentId?: string
  initialValues?: Partial<ShiftEditorFormValues>
}
