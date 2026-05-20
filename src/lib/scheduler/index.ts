// ============================================================
// Shift Solver AI — Scheduler Client
// Contrato exacto con la API OR-Tools en Railway
// POST /solve  ·  Header: x-api-key
// ============================================================

// ── Tipos de entrada (ScheduleRequest) ────────────────────────────────────

export interface HorarioApertura {
  apertura: string  // "HH:MM"
  cierre: string    // "HH:MM" — "00:00" para medianoche
}

export interface Contrato {
  tipo: 'fijo' | 'horquilla'
  horas?: number         // si tipo == "fijo"
  min_horas?: number     // si tipo == "horquilla"
  max_horas?: number     // si tipo == "horquilla"
}

export interface NoAntesDeRegla {
  hora: string
  dias: 'TODOS' | string[]
}

export interface NoDespuesDeRegla {
  hora: string
  dias: 'TODOS' | string[]
}

export interface TrabajarObligatorioRegla {
  dia: string
  desde: string
  hasta: string
}

export interface Restricciones {
  dias_libres: string[]
  no_antes_de: NoAntesDeRegla[]
  no_despues_de: NoDespuesDeRegla[]
  trabajar_obligatorio: TrabajarObligatorioRegla[]
  texto_pdf?: string
}

export interface Trabajador {
  nombre: string
  contrato: Contrato
  rol: string           // "CAMARERO_BASICO" | "SEMI_ENCARGADO" | "ENCARGADO" | "DUENO"
  etiquetas: string[]   // ["CAJERA", "BARISTA", ...]
  restricciones: Restricciones
  min_horas_jornada?: number  // Jornada mínima diaria en horas (default: 4h). 0 = sin restricción.
}

export interface FranjaNum {
  inicio: string
  fin: string
  personas: number
}

export interface FranjaRol {
  inicio: string
  fin: string
  personas_por_rol: Record<string, number>
}

export interface FranjaEti {
  inicio: string
  fin: string
  etiquetas: string[]
}

export interface Parametros {
  seed?: number | null
  time_limit_seconds?: number
  min_horas_jornada_global?: number  // Jornada mínima global en horas para todos los trabajadores (default: 4h)
}

export interface ScheduleRequest {
  dias: string[]                                          // ["LUNES","MARTES",...]
  roles_jerarquia: string[]                               // ["CAMARERO_BASICO","SEMI_ENCARGADO","ENCARGADO","DUENO"]
  etiquetas: string[]                                     // catálogo completo
  slot_duracion_min: number                               // 30
  horario_apertura: Record<string, HorarioApertura>
  trabajadores: Trabajador[]
  franjas_num: Record<string, FranjaNum[]>
  franjas_rol: Record<string, FranjaRol[]>
  franjas_eti: Record<string, FranjaEti[]>
  parametros: Parametros
}

// ── Tipos de salida (ScheduleResponse) ────────────────────────────────────

export type EstadoSolver = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN'

export interface TramoDia {
  inicio: string
  fin: string
  duracion_horas: number
}

export interface JornadaDia {
  dia: string
  tipo: 'descanso' | 'continuada' | 'partida'
  tramos: TramoDia[]
  horas: number
  requiere_pausa_20min: boolean
}

export interface CuadranteTrabajador {
  nombre: string
  rol: string
  contrato_rango_horas: string   // "40-44", "34", "12-28"
  horas_semana: number
  jornadas: JornadaDia[]
}

export interface HuecoCobertura {
  dia: string
  inicio: string
  fin: string
  demanda_total: number
  cubierto: number
  falta_personas: number
  falta_por_nivel: Record<string, number>
}

export interface HuecoEtiqueta {
  dia: string
  inicio: string
  fin: string
  etiquetas_requeridas: string[]
  asignados: string[]
}

export interface GapEntreJornadas {
  trabajador: string
  cruce: string           // "LUN>MAR"
  gap_horas: number | null
}

export interface PausaObligatoria {
  trabajador: string
  dia: string
  inicio: string
  fin: string
  duracion_horas: number
}

export interface Metricas {
  total_continuadas: number
  total_partidas: number
  dispersion_partidas: number
  partidas_por_trabajador: Record<string, number>
}

export interface Propuesta {
  severidad: 'critica' | 'alta' | 'media' | 'baja'
  categoria: 'capacidad' | 'rol' | 'etiqueta' | 'restriccion' | 'contrato'
  titulo: string
  mensaje: string
  accion_sugerida: string
  afecta_trabajador?: string | null
  afecta_dia?: string | null
}

export interface Diagnostico {
  capacidad_total_h: number
  demanda_total_h: number
  deficit_h: number
  propuestas: Propuesta[]
}

export interface ScheduleResponse {
  estado: EstadoSolver
  tiempo_calculo_segundos: number
  seed_usado: number | null
  slots_persona_demanda: number
  slots_persona_asignados: number
  slots_persona_huecos: number
  horas_persona_demanda: number
  horas_persona_asignadas: number
  horas_persona_huecos: number
  cuadrante: CuadranteTrabajador[]
  huecos_cobertura: HuecoCobertura[]
  huecos_etiqueta: HuecoEtiqueta[]
  metricas: Metricas
  gaps_entre_jornadas: GapEntreJornadas[]
  pausas_obligatorias: PausaObligatoria[]
  diagnostico: Diagnostico | null
}

// ── Cliente HTTP ───────────────────────────────────────────────────────────

const SOLVER_URL = process.env.SOLVER_API_URL ?? 'https://shift-solver-ai-production.up.railway.app'
const SOLVER_KEY = process.env.SOLVER_API_KEY ?? ''
const TIMEOUT_MS = 120_000  // 2 min — OR-Tools puede tardar

export class SolverError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message)
    this.name = 'SolverError'
  }
}

export async function callSolverApi(payload: ScheduleRequest): Promise<ScheduleResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${SOLVER_URL}/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SOLVER_KEY ? { 'x-api-key': SOLVER_KEY } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new SolverError(`Solver API error ${res.status}: ${body}`, 'HTTP_ERROR', res.status)
    }

    const data: ScheduleResponse = await res.json()
    return data
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof SolverError) throw err
    if ((err as Error).name === 'AbortError') {
      throw new SolverError('Solver timeout (>2 min)', 'TIMEOUT', 408)
    }
    throw new SolverError(`Solver unreachable: ${(err as Error).message}`, 'UNREACHABLE', 503)
  }
}

export async function checkSolverHealth(): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${SOLVER_URL}/health`, {
      headers: SOLVER_KEY ? { 'x-api-key': SOLVER_KEY } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: data.status === 'ok', version: data.version }
  } catch {
    return { ok: false }
  }
}
