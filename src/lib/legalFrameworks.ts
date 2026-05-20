// ============================================================
// Shift Solver AI — Marcos legales preconfigurados
// Fuente: ET (RD 2/2015) + Convenio Hostelería
// ============================================================

export interface LegalRules {
  // ── Jornada diaria ──────────────────────────────────────
  maxDailyHours: number           // máx horas ordinarias/día (ET: 9h)
  maxDailyHoursYoung: number      // máx menores de 18 (ET: 8h)
  // ── Descansos ───────────────────────────────────────────
  minRestBetweenShifts: number    // descanso mínimo entre jornadas en horas (ET: 12h)
  minWeeklyRestHours: number      // descanso semanal mínimo en horas (ET: 36h = 1.5 días)
  consecutiveRestDays: boolean    // los días de descanso deben ser consecutivos
  minWeeklyRestDays: number       // días de descanso semanal (convenios: 2)
  // ── Pausas obligatorias ─────────────────────────────────
  breakRequiredAfterHours: number // pausa obligatoria tras X horas continuas (ET: 6h; hostelería: 5h)
  breakMinutes: number            // duración de la pausa (ET: 15min; hostelería: 20min)
  breakCountsAsWork: boolean      // la pausa computa como tiempo trabajado
  // ── Jornada semanal/anual ────────────────────────────────
  maxWeeklyHours: number          // máx horas semanales ordinarias (ET: 40h en cómputo anual)
  maxAnnualHours: number          // máx horas anuales ordinarias (ET: 1826h; hostelería: 1791h)
  // ── Horas extra ─────────────────────────────────────────
  maxOvertimeAnnual: number       // máx horas extra/año (ET: 80h)
  overtimeVoluntary: boolean      // las horas extra son voluntarias (ET: true salvo fuerza mayor)
  // ── Nocturnidad ─────────────────────────────────────────
  nightStart: string              // inicio tramo nocturno HH:MM (ET: 22:00)
  nightEnd: string                // fin tramo nocturno HH:MM (ET: 06:00)
  nightWorkerMaxHours: number     // trabajador nocturno: máx horas en 24h (ET: 8h en promedio)
  // ── Vacaciones ──────────────────────────────────────────
  vacationDaysMin: number         // días mínimos de vacaciones (ET: 30 naturales = ~22 laborables)
  vacationDaysType: 'NATURALES' | 'LABORABLES'
  // ── Jornada partida ─────────────────────────────────────
  splitShiftAllowed: boolean
  splitShiftMinBlock: number      // horas mínimas por tramo
  splitShiftMaxBlock: number      // horas máximas por tramo
  splitShiftMinRest: number       // descanso mínimo entre tramos en horas
  splitShiftMaxTotal: number      // máx horas totales en jornada partida
  // ── Máximos consecutivos ────────────────────────────────
  maxConsecutiveDays: number      // máx días seguidos trabajando
  // ── Referencias legales ─────────────────────────────────
  references: Record<string, string>  // regla → artículo
}

// ── Estatuto de los Trabajadores (base universal España) ──────────────────
export const ET_BASE: LegalRules = {
  maxDailyHours: 9,
  maxDailyHoursYoung: 8,
  minRestBetweenShifts: 12,
  minWeeklyRestHours: 36,
  consecutiveRestDays: false,
  minWeeklyRestDays: 1,  // ET dice 1.5 días, en práctica suele aplicarse como 2
  breakRequiredAfterHours: 6,
  breakMinutes: 15,
  breakCountsAsWork: false,
  maxWeeklyHours: 40,
  maxAnnualHours: 1826,
  maxOvertimeAnnual: 80,
  overtimeVoluntary: true,
  nightStart: '22:00',
  nightEnd: '06:00',
  nightWorkerMaxHours: 8,
  vacationDaysMin: 30,
  vacationDaysType: 'NATURALES',
  splitShiftAllowed: false,
  splitShiftMinBlock: 3,
  splitShiftMaxBlock: 5,
  splitShiftMinRest: 1,
  splitShiftMaxTotal: 9,
  maxConsecutiveDays: 7,
  references: {
    maxDailyHours:          'Art. 34.3 ET — Jornada máxima ordinaria 9h/día',
    maxDailyHoursYoung:     'Art. 34.3 ET — Menores de 18: máx 8h/día',
    minRestBetweenShifts:   'Art. 34.3 ET — Descanso mínimo 12h entre jornadas',
    minWeeklyRestHours:     'Art. 37.1 ET — Descanso semanal mínimo 1,5 días (36h)',
    breakRequiredAfterHours:'Art. 34.4 ET — Pausa 15 min en jornadas >6h continuas',
    maxWeeklyHours:         'Art. 34.1 ET — Jornada máxima 40h semanales (cómputo anual)',
    maxAnnualHours:         'Art. 34.1 ET — Máximo 1.826h ordinarias anuales',
    maxOvertimeAnnual:      'Art. 35.2 ET — Máximo 80h extras anuales',
    nightStart:             'Art. 36.1 ET — Trabajo nocturno: 22:00–06:00',
    nightWorkerMaxHours:    'Art. 36.1 ET — Trabajador nocturno: máx 8h en promedio',
    vacationDaysMin:        'Art. 38.1 ET — Vacaciones mínimas: 30 días naturales/año',
  },
}

// ── Convenio Hostelería Tarragona ─────────────────────────────────────────
export const HOSTELERIA_TARRAGONA: LegalRules = {
  ...ET_BASE,
  maxDailyHours: 9,
  minRestBetweenShifts: 12,
  minWeeklyRestDays: 2,
  consecutiveRestDays: true,
  breakRequiredAfterHours: 5,
  breakMinutes: 20,
  breakCountsAsWork: true,
  maxAnnualHours: 1791,
  splitShiftAllowed: true,
  splitShiftMinBlock: 3,
  splitShiftMaxBlock: 5,
  splitShiftMinRest: 1.5,
  splitShiftMaxTotal: 9,
  maxConsecutiveDays: 6,
  vacationDaysMin: 23,
  vacationDaysType: 'NATURALES',
  references: {
    ...ET_BASE.references,
    minWeeklyRestDays:      'Art. 12 Conv. Hostelería Tarragona — 2 días consecutivos de descanso',
    breakRequiredAfterHours:'Art. 15 Conv. Hostelería Tarragona — Pausa 20 min en jornadas >5h (computa como trabajo)',
    maxAnnualHours:         'Art. 18 Conv. Hostelería Tarragona — Jornada anual: 1.791h',
    splitShiftAllowed:      'Art. 19 Conv. Hostelería Tarragona — Jornada partida: 3–5h/tramo, ≥1,5h descanso',
    vacationDaysMin:        'Art. 25 Conv. Hostelería Tarragona — 23 días naturales de vacaciones',
  },
}

// ── Convenio Estatal de Hostelería ────────────────────────────────────────
export const HOSTELERIA_ESTATAL: LegalRules = {
  ...ET_BASE,
  minWeeklyRestDays: 2,
  consecutiveRestDays: true,
  breakRequiredAfterHours: 5,
  breakMinutes: 20,
  breakCountsAsWork: true,
  maxAnnualHours: 1800,
  splitShiftAllowed: true,
  splitShiftMinBlock: 3,
  splitShiftMaxBlock: 5,
  splitShiftMinRest: 1.5,
  splitShiftMaxTotal: 9,
  maxConsecutiveDays: 6,
  vacationDaysMin: 30,
  vacationDaysType: 'NATURALES',
  references: {
    ...ET_BASE.references,
    minWeeklyRestDays:   'Art. 23 Conv. Estatal Hostelería — 2 días consecutivos descanso semanal',
    breakRequiredAfterHours: 'Art. 27 Conv. Estatal Hostelería — Pausa 20 min en jornadas >5h',
    maxAnnualHours:      'Art. 26 Conv. Estatal Hostelería — 1.800h anuales',
  },
}

// ── Catálogo de marcos preconfigurados ────────────────────────────────────
export const LEGAL_FRAMEWORK_SEEDS = [
  {
    code: 'ET',
    name: 'Estatuto de los Trabajadores',
    description: 'Marco legal base para todos los trabajadores en España. Mínimos legales obligatorios que ningún convenio puede empeorar.',
    scope: 'NACIONAL',
    sector: null,
    province: null,
    isEditable: true,
    rules: ET_BASE,
  },
  {
    code: 'HOSTELERIA_TARRAGONA',
    name: 'Conv. Colectivo Hostelería Tarragona',
    description: 'Convenio colectivo provincial para el sector de hostelería de Tarragona. Mejora los mínimos del ET.',
    scope: 'PROVINCIAL',
    sector: 'HOSTELERIA',
    province: 'Tarragona',
    isEditable: true,
    rules: HOSTELERIA_TARRAGONA,
  },
  {
    code: 'HOSTELERIA_ESTATAL',
    name: 'Conv. Estatal de Hostelería',
    description: 'Convenio colectivo estatal para hostelería. Aplicable cuando no existe convenio provincial.',
    scope: 'NACIONAL',
    sector: 'HOSTELERIA',
    province: null,
    isEditable: true,
    rules: HOSTELERIA_ESTATAL,
  },
]
