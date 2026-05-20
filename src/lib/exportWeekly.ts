// ============================================================
// Shift Solver AI — Exportador Excel cuadrante semanal
// Usa exceljs (puro JS, sin dependencias nativas)
// ============================================================

import ExcelJS from 'exceljs'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Colores corporativos del Excel
const C = {
  headerBg:     'FF1E1B4B',  // indigo oscuro — cabecera principal
  headerText:   'FFFFFFFF',  // blanco
  dayHeaderBg:  'FF4F46E5',  // indigo — cabecera días
  dayHeaderText:'FFFFFFFF',
  empNameBg:    'FFF8F9FF',  // gris muy claro — col empleado
  empNameText:  'FF1F2937',  // gris oscuro
  totalColBg:   'FFEEF2FF',  // indigo muy claro — col total
  totalRowBg:   'FF1E1B4B',  // igual que header
  totalRowText: 'FFFFFFFF',
  subtotalBg:   'FFE0E7FF',  // indigo claro — fila subtotales
  subtotalText: 'FF3730A3',
  borderColor:  'FFD1D5DB',  // gris borde
  freeDayBg:    'FFFAFAFA',  // casi blanco — celda sin turno
  nightBg:      'FFF5F3FF',  // lavanda suave — turno nocturno
  splitBg:      'FFFEF9C3',  // amarillo suave — jornada partida
  weekendBg:    'FFFFFBEB',  // ámbar muy suave — fin de semana
  overHours:    'FFFEE2E2',  // rojo suave — exceso horas
  underHours:   'FFFEF9C3',  // amarillo — insuficiente
  okHours:      'FFF0FDF4',  // verde muy suave — OK
}

function hexToArgb(hex: string): string {
  // Convierte #4f46e5 → FF4F46E5
  return 'FF' + hex.replace('#', '').toUpperCase()
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function durationBruto(start: string, end: string): number {
  let s = timeToMin(start), e = timeToMin(end)
  if (e <= s) e += 24 * 60
  return Math.max(0, (e - s) / 60)
}

function durationNeto(start: string, end: string, breakMin: number): number {
  return Math.max(0, durationBruto(start, end) - breakMin / 60)
}

function fmtH(h: number): string {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function isWeekend(dayIdx: number): boolean {
  return dayIdx === 5 || dayIdx === 6
}

function isNightShift(endTime: string): boolean {
  return timeToMin(endTime) <= timeToMin('06:00') || timeToMin(endTime) >= timeToMin('22:00')
}

export async function generateWeeklyExcel(period: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Shift Solver AI'
  wb.created = new Date()

  const org = period.location.organization
  const weekStart = new Date(period.weekStart)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ── Obtener empleados únicos con sus assignments ─────────────────────────
  const empMap = new Map<string, any>()
  for (const a of period.assignments) {
    if (!empMap.has(a.employeeId)) {
      empMap.set(a.employeeId, {
        ...a.employee,
        assignments: [],
      })
    }
    empMap.get(a.employeeId).assignments.push(a)
  }
  const employees = Array.from(empMap.values()).sort((a, b) =>
    a.firstName.localeCompare(b.firstName)
  )

  // Assignments indexados por empleado + dayOfWeek
  function getAssignments(empId: string, dayIdx: number) {
    return period.assignments.filter((a: any) => {
      const d = new Date(a.date)
      const diff = Math.round((d.getTime() - weekStart.getTime()) / 86400000)
      return a.employeeId === empId && diff === dayIdx
    })
  }

  // ── HOJA 1: CUADRANTE ───────────────────────────────────────────────────
  const ws = wb.addWorksheet('Cuadrante', {
    pageSetup: {
      paperSize: 9,  // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  // Congelar primeras 3 filas y primera columna
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }]

  // Anchos de columna
  ws.getColumn(1).width = 22  // Empleado
  for (let d = 0; d < 7; d++) {
    ws.getColumn(d + 2).width = 18  // Días
  }
  ws.getColumn(9).width = 14   // Total horas
  ws.getColumn(10).width = 12  // Contrato

  // ── FILA 1: Cabecera principal ──────────────────────────────────────────
  ws.mergeCells('A1:J1')
  const titleCell = ws.getCell('A1')
  const weekLabel = `${format(weekDays[0], "d 'de' MMMM", { locale: es })} – ${format(weekDays[6], "d 'de' MMMM yyyy", { locale: es })}`
  const statusLabel = { DRAFT: 'Borrador', GENERATED: 'Generado IA', REVIEWED: 'Revisado', PUBLISHED: '✓ Publicado', ARCHIVED: 'Archivado' }[period.status as string] ?? period.status
  titleCell.value = `${org.name.toUpperCase()}  ·  Cuadrante semanal  ·  ${weekLabel}  ·  ${statusLabel}`
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: C.headerText } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  // ── FILA 2: Cabecera columnas (días) ────────────────────────────────────
  ws.getCell('A2').value = 'EMPLEADO'
  styleHeaderCell(ws.getCell('A2'), C.headerBg)

  for (let d = 0; d < 7; d++) {
    const cell = ws.getCell(2, d + 2)
    const dayName = DAYS_ES[d].toUpperCase()
    const dayDate = format(weekDays[d], 'd MMM', { locale: es }).toUpperCase()
    cell.value = `${dayName}\n${dayDate}`
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.dayHeaderText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWeekend(d) ? 'FF3730A3' : C.dayHeaderBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = allBorders(C.borderColor)
  }
  ws.getCell('I2').value = 'TOTAL\nSEMANA'
  styleHeaderCell(ws.getCell('I2'), C.headerBg)
  ws.getCell('J2').value = 'CONTRATO\n/SEMANA'
  styleHeaderCell(ws.getCell('J2'), C.headerBg)
  ws.getRow(2).height = 32

  // ── FILA 3: Subtítulo horas ─────────────────────────────────────────────
  ws.getCell('A3').value = ''
  styleSubCell(ws.getCell('A3'))

  for (let d = 0; d < 7; d++) {
    const dayAssignments = period.assignments.filter((a: any) => {
      const diff = Math.round((new Date(a.date).getTime() - weekStart.getTime()) / 86400000)
      return diff === d
    })
    const working = new Set(dayAssignments.map((a: any) => a.employeeId)).size
    const totalBruto = dayAssignments.reduce((s: number, a: any) => s + durationBruto(a.startTime, a.endTime), 0)
    const totalBreak = dayAssignments.reduce((s: number, a: any) => s + (a.breakMinutes || 0), 0)

    const cell = ws.getCell(3, d + 2)
    cell.value = working > 0
      ? `${working} personas · ${fmtH(totalBruto)}${totalBreak > 0 ? ` (${totalBreak}m desc.)` : ''}`
      : '—'
    cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF6B7280' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subtotalBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = allBorders(C.borderColor)
  }
  ws.getCell('I3').value = 'Brutas · Netas'
  styleSubCell(ws.getCell('I3'))
  ws.getCell('J3').value = 'h/sem'
  styleSubCell(ws.getCell('J3'))
  ws.getRow(3).height = 18

  // ── FILAS DE EMPLEADOS ──────────────────────────────────────────────────
  let row = 4
  let totalWeekBruto = 0
  let totalWeekNeto = 0
  let totalWeekBreak = 0

  for (const emp of employees) {
    const empColor = hexToArgb(emp.color || '#6366f1')
    const contract = emp.contracts?.[0]
    const contractH = contract?.weeklyHours || 40

    let empBruto = 0
    let empNeto = 0
    let empBreak = 0

    // Celda nombre empleado
    const nameCell = ws.getCell(row, 1)
    const roleName = emp.skills?.[0]?.laborRole?.name ?? ''
    nameCell.value = `${emp.firstName} ${emp.lastName}${roleName ? `\n${roleName}` : ''}`
    nameCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } }
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFF' } }
    nameCell.alignment = { vertical: 'middle', wrapText: true }
    nameCell.border = allBorders(C.borderColor)
    // Borde izquierdo de color del empleado
    nameCell.border = {
      ...allBorders(C.borderColor),
      left: { style: 'medium', color: { argb: empColor } },
    }

    // Celdas por día
    for (let d = 0; d < 7; d++) {
      const dayAssignments = getAssignments(emp.id, d)
      const cell = ws.getCell(row, d + 2)

      const bgColor = isWeekend(d) ? C.weekendBg : C.freeDayBg

      if (dayAssignments.length === 0) {
        cell.value = '—'
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FFD1D5DB' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        // Construir contenido celda
        const lines: string[] = []
        let dayBruto = 0
        let dayNeto = 0
        let dayBreak = 0
        let hasNight = false
        let hasSplit = dayAssignments.length > 1

        for (const a of dayAssignments) {
          const bruto = durationBruto(a.startTime, a.endTime)
          const neto = durationNeto(a.startTime, a.endTime, a.breakMinutes)
          dayBruto += bruto
          dayNeto += neto
          dayBreak += a.breakMinutes || 0
          if (isNightShift(a.endTime)) hasNight = true

          const icons = [
            a.isLocked ? '🔒' : '',
            a.isSplit ? '✂' : '',
            isNightShift(a.endTime) ? '🌙' : '',
          ].filter(Boolean).join('')

          lines.push(`${a.startTime} – ${a.endTime}${icons ? ' ' + icons : ''}`)
          if (a.breakMinutes > 0) {
            lines.push(`${fmtH(bruto)} bruto · ${a.breakMinutes}m desc.`)
          } else {
            lines.push(fmtH(bruto))
          }
          if (a.laborRole?.name) lines.push(a.laborRole.name)
          if (dayAssignments.length > 1) lines.push('───')
        }

        // Quitar último separador
        if (lines[lines.length - 1] === '───') lines.pop()

        // Si hay varios turnos, añadir total día
        if (dayAssignments.length > 1) {
          lines.push(`TOTAL: ${fmtH(dayBruto)}`)
        }

        cell.value = lines.join('\n')
        cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' }

        // Color de fondo según tipo de turno
        let cellBg = empColor.slice(2) // quitar 'FF' del argb
        // Hacer más claro mezclando con blanco (simplificado: usar color del empleado con 15% opacidad)
        const shiftBg = hasNight
          ? C.nightBg
          : hasSplit
            ? C.splitBg
            : isWeekend(d)
              ? C.weekendBg
              : 'FFFFFEFF'

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shiftBg } }
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1F2937' } }

        // Borde superior del color del empleado para identificación visual
        cell.border = {
          ...allBorders(C.borderColor),
          top: { style: 'medium', color: { argb: empColor } },
        }

        empBruto += dayBruto
        empNeto += dayNeto
        empBreak += dayBreak
      }
    }

    // Columna TOTAL empleado
    const totalCell = ws.getCell(row, 9)
    const isOver = empBruto > contractH * 1.05
    const isUnder = empBruto < contractH * 0.9
    const totalBg = isOver ? C.overHours : isUnder ? C.underHours : C.okHours

    let totalLines = [fmtH(empBruto) + ' brutas']
    if (empBreak > 0) {
      totalLines.push(fmtH(empNeto) + ' netas')
      totalLines.push(`${empBreak}m descanso`)
    }
    totalCell.value = totalLines.join('\n')
    totalCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: isOver ? 'FF991B1B' : isUnder ? 'FF854D0E' : 'FF166534' } }
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBg } }
    totalCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    totalCell.border = allBorders(C.borderColor)

    // Columna CONTRATO
    const contractCell = ws.getCell(row, 10)
    contractCell.value = `${contractH}h/sem\n${fmtH(contractH * 4.33)} mes`
    contractCell.font = { name: 'Arial', size: 9, color: { argb: 'FF6B7280' } }
    contractCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    contractCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    contractCell.border = allBorders(C.borderColor)

    totalWeekBruto += empBruto
    totalWeekNeto += empNeto
    totalWeekBreak += empBreak

    ws.getRow(row).height = 52
    row++
  }

  // ── FILA TOTALES ────────────────────────────────────────────────────────
  const totRow = row

  const totNameCell = ws.getCell(totRow, 1)
  totNameCell.value = 'TOTALES'
  totNameCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: C.totalRowText } }
  totNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalRowBg } }
  totNameCell.alignment = { horizontal: 'center', vertical: 'middle' }
  totNameCell.border = allBorders(C.borderColor)

  for (let d = 0; d < 7; d++) {
    const dayAssignments = period.assignments.filter((a: any) => {
      const diff = Math.round((new Date(a.date).getTime() - weekStart.getTime()) / 86400000)
      return diff === d
    })
    const working = new Set(dayAssignments.map((a: any) => a.employeeId)).size
    const bruto = dayAssignments.reduce((s: number, a: any) => s + durationBruto(a.startTime, a.endTime), 0)
    const breakMin = dayAssignments.reduce((s: number, a: any) => s + (a.breakMinutes || 0), 0)

    const cell = ws.getCell(totRow, d + 2)
    cell.value = `${working} personas\n${fmtH(bruto)}${breakMin > 0 ? ` · ${breakMin}m desc.` : ''}`
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.totalRowText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalRowBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = allBorders(C.borderColor)
  }

  // Total semana global
  const totTotalCell = ws.getCell(totRow, 9)
  totTotalCell.value = `${fmtH(totalWeekBruto)} brutas\n${fmtH(totalWeekNeto)} netas\n${Math.round(totalWeekBreak / 60 * 10) / 10}h descanso`
  totTotalCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: C.totalRowText } }
  totTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalRowBg } }
  totTotalCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  totTotalCell.border = allBorders(C.borderColor)

  ws.getCell(totRow, 10).value = `${employees.length} empleados`
  ws.getCell(totRow, 10).font = { name: 'Arial', size: 9, color: { argb: C.totalRowText } }
  ws.getCell(totRow, 10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalRowBg } }
  ws.getCell(totRow, 10).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell(totRow, 10).border = allBorders(C.borderColor)
  ws.getRow(totRow).height = 42

  // ── FILA LEYENDA ────────────────────────────────────────────────────────
  row++
  ws.mergeCells(row, 1, row, 10)
  const legendCell = ws.getCell(row, 1)
  legendCell.value = '🌙 Turno nocturno (fondo lavanda)   ✂ Jornada partida (fondo amarillo)   🔒 Turno bloqueado   ✨ Generado con IA   |   Generado por Shift Solver AI'
  legendCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF9CA3AF' } }
  legendCell.alignment = { horizontal: 'center' }
  ws.getRow(row).height = 16

  // ── HOJA 2: RESUMEN ─────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Resumen empleados')
  ws2.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

  const cols2 = [
    { header: 'EMPLEADO', width: 22 },
    { header: 'ROL', width: 18 },
    { header: 'CONTRATO', width: 12 },
    { header: 'H. BRUTAS', width: 12 },
    { header: 'H. NETAS', width: 12 },
    { header: 'DESCANSO', width: 12 },
    { header: 'TURNOS', width: 10 },
    { header: 'NOCTURNAS', width: 12 },
    { header: 'PARTIDOS', width: 10 },
    { header: 'VS CONTRATO', width: 14 },
  ]

  // Título hoja 2
  ws2.mergeCells('A1:J1')
  const title2 = ws2.getCell('A1')
  title2.value = `${org.name} · Resumen empleados · Semana ${format(weekDays[0], "d MMM", { locale: es })} – ${format(weekDays[6], "d MMM yyyy", { locale: es })}`
  title2.font = { name: 'Arial', size: 12, bold: true, color: { argb: C.headerText } }
  title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }
  title2.alignment = { horizontal: 'center', vertical: 'middle' }
  ws2.getRow(1).height = 24

  // Cabecera
  cols2.forEach((col, i) => {
    ws2.getColumn(i + 1).width = col.width
    const cell = ws2.getCell(2, i + 1)
    cell.value = col.header
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.dayHeaderText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dayHeaderBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = allBorders(C.borderColor)
  })
  ws2.getRow(2).height = 22

  // Datos por empleado
  let r2 = 3
  for (const emp of employees) {
    const contract = emp.contracts?.[0]
    const contractH = contract?.weeklyHours || 40
    const empAssignments = period.assignments.filter((a: any) => a.employeeId === emp.id)

    const bruto = empAssignments.reduce((s: number, a: any) => s + durationBruto(a.startTime, a.endTime), 0)
    const breakMin = empAssignments.reduce((s: number, a: any) => s + (a.breakMinutes || 0), 0)
    const neto = empAssignments.reduce((s: number, a: any) => s + durationNeto(a.startTime, a.endTime, a.breakMinutes), 0)
    const nightH = empAssignments.reduce((s: number, a: any) => s + (a.nightHours || 0), 0)
    const splitCount = empAssignments.filter((a: any) => a.isSplit).length
    const diff = bruto - contractH

    const isOver = diff > 0
    const isUnder = diff < -2
    const rowBg = isOver ? C.overHours : isUnder ? C.underHours : C.okHours
    const empColor = hexToArgb(emp.color || '#6366f1')

    const rowData = [
      `${emp.firstName} ${emp.lastName}`,
      emp.skills?.[0]?.laborRole?.name ?? '—',
      `${contractH}h/sem`,
      fmtH(bruto),
      fmtH(neto),
      breakMin > 0 ? `${breakMin}m (${fmtH(breakMin / 60)})` : '—',
      empAssignments.length,
      nightH > 0 ? fmtH(nightH) : '—',
      splitCount > 0 ? splitCount : '—',
      `${diff >= 0 ? '+' : ''}${fmtH(Math.abs(diff))} ${isOver ? '▲' : isUnder ? '▼' : '✓'}`,
    ]

    rowData.forEach((val, i) => {
      const cell = ws2.getCell(r2, i + 1)
      cell.value = val
      cell.font = {
        name: 'Arial', size: 10,
        bold: i === 0,
        color: { argb: i === 9 ? (isOver ? 'FF991B1B' : isUnder ? 'FF854D0E' : 'FF166534') : 'FF1F2937' },
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 0 ? 'FFFAFBFF' : rowBg } }
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
      cell.border = {
        ...allBorders(C.borderColor),
        left: i === 0 ? { style: 'medium', color: { argb: empColor } } : { style: 'thin', color: { argb: C.borderColor } },
      }
    })
    ws2.getRow(r2).height = 20
    r2++
  }

  // Fila totales hoja 2
  const t2data = [
    'TOTALES', '', `${employees.length} emp.`,
    fmtH(totalWeekBruto), fmtH(totalWeekNeto),
    `${totalWeekBreak}m total`, period.assignments.length,
    fmtH(period.assignments.reduce((s: number, a: any) => s + (a.nightHours || 0), 0)),
    period.assignments.filter((a: any) => a.isSplit).length,
    '',
  ]
  t2data.forEach((val, i) => {
    const cell = ws2.getCell(r2, i + 1)
    cell.value = val
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: C.totalRowText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalRowBg } }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
    cell.border = allBorders(C.borderColor)
  })
  ws2.getRow(r2).height = 22

  // ── Generar buffer ───────────────────────────────────────────────────────
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

// ── Helpers de estilo ─────────────────────────────────────────────────────
function allBorders(color: string) {
  const b = { style: 'thin' as const, color: { argb: color } }
  return { top: b, bottom: b, left: b, right: b }
}

function styleHeaderCell(cell: ExcelJS.Cell, bgColor: string) {
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = allBorders('FFD1D5DB')
}

function styleSubCell(cell: ExcelJS.Cell) {
  cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF6B7280' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = allBorders('FFD1D5DB')
}
