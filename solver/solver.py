"""
SHIFT SOLVER AI - Script CLI (modo dev)
=======================================
Construye un ScheduleRequest a partir de `data.py`, lo resuelve con
`core.resolver_problema` y escribe el resultado en formato texto para
validacion humana.

La logica del solver vive en `core.py` (reutilizable desde el servicio
HTTP de la Fase 1 en `main.py`); aqui solo hay I/O por consola.

Uso:
    py solver.py              # rotacion determinista (la misma siempre)
    py solver.py 42           # rotacion alternativa (mismo objetivo, asignacion distinta)
"""

import sys

from core import (
    Problema,
    cargar_problema,
    request_desde_data_py,
    resolver_problema,
)
from data import TRABAJADORES
from schemas import ScheduleResponse


# Anchura de las etiquetas del grid (nombre / Demanda / Cobertura / Hueco).
HORA_GRID_INICIO = 6
N_COLS_GRID = 36


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

def main(seed: int | None = None):
    request = request_desde_data_py(seed=seed)
    response = resolver_problema(request, seed=seed)
    problema = cargar_problema(request)
    imprimir(response, problema)


def imprimir(response: ScheduleResponse, problema: Problema):
    sep = "=" * 88
    print(sep)
    print("  SHIFT SOLVER AI - FASE 0.11 + FASE 1  (motor refactorizado a core.py)")
    print(sep)
    print(f"Estado del solver:  {response.estado}")
    print(f"Tiempo de calculo:  {response.tiempo_calculo_segundos:.3f} s")
    if response.seed_usado is not None:
        print(f"Seed (rotacion):    {response.seed_usado}")
    print(f"Slots-persona asignados: {response.slots_persona_asignados} "
          f"({response.horas_persona_asignadas:.1f} horas-persona)")
    print(f"Slots-persona huecos:    {response.slots_persona_huecos} "
          f"({response.horas_persona_huecos:.1f} horas-persona "
          f"sin cubrir, demanda total {response.slots_persona_demanda} sp)")
    print(f"Slots con etiqueta sin cubrir: {len(response.huecos_etiqueta)}")
    print()

    if response.estado not in ("OPTIMAL", "FEASIBLE"):
        print(f"Sin solucion. Nada mas que mostrar.")
        return

    for d in problema.dias:
        imprimir_grid_dia(response, problema, d)
        print()

    imprimir_resumen_semanal(response, problema)
    print()
    imprimir_gaps_entre_jornadas(response)
    print()
    imprimir_descanso_semanal(response, problema)
    print()
    imprimir_restricciones_individuales(response, problema)
    print()
    imprimir_huecos_cobertura(response)
    print()
    imprimir_huecos_etiquetas(response)
    print()
    imprimir_pausas_obligatorias(response)
    print()
    imprimir_metricas_objetivo(response)
    print()
    imprimir_cuadrante_por_trabajador(response)


# ---------------------------------------------------------------------------
# Grid visual por dia
# ---------------------------------------------------------------------------

def _label_anchura():
    nombre_max = max(len(t["nombre"]) for t in TRABAJADORES)
    return max(nombre_max, len("Cobertura")) + 2


def imprimir_grid_dia(response: ScheduleResponse, problema: Problema, dia: str):
    p = problema
    apertura, cierre = p.horario_apertura[dia]
    n_slots = p.num_slots_dia(dia)
    demanda = p.demanda_num_dia[dia]
    label_w = _label_anchura()
    apertura_min = p.hora_a_minutos(apertura)
    offset = (apertura_min - HORA_GRID_INICIO * 60) // p.slot_duracion_min

    sp_dia = sum(demanda)
    huecos_dia = {
        (h.dia, h.inicio): h.falta_personas for h in response.huecos_cobertura
    }
    sp_hueco_dia = sum(
        v for (d, _), v in huecos_dia.items() if d == dia
    )
    aviso = f"   [HUECOS: {sp_hueco_dia} sp]" if sp_hueco_dia > 0 else ""
    print(f"--- {dia}  ({apertura}-{cierre}, {n_slots} slots, "
          f"demanda {sp_dia} sp = {sp_dia * p.slot_duracion_min / 60:.1f} h)"
          f"{aviso} ---")

    # Cabecera horaria.
    cab = " " * label_w
    for hora_idx in range(N_COLS_GRID // 2):
        hh = (HORA_GRID_INICIO + hora_idx) % 24
        cab += f"{hh:02d}  "
    print(cab.rstrip())

    # Reconstruir la matriz x[w][s] desde el response (cuadrante por trabajador).
    asignaciones = {(t.nombre, dia): set() for t in response.cuadrante}
    for ct in response.cuadrante:
        jornada = next((j for j in ct.jornadas if j.dia == dia), None)
        if jornada is None:
            continue
        for tramo in jornada.tramos:
            t_ini_min = p.hora_a_minutos(tramo.inicio)
            t_fin_min = p.hora_fin_a_minutos(tramo.fin)
            s_ini = (t_ini_min - apertura_min) // p.slot_duracion_min
            s_fin = (t_fin_min - apertura_min) // p.slot_duracion_min
            for s in range(s_ini, s_fin):
                asignaciones[(ct.nombre, dia)].add(s)

    for t in TRABAJADORES:
        fila = t["nombre"].ljust(label_w)
        slots_w = asignaciones.get((t["nombre"], dia), set())
        for col in range(N_COLS_GRID):
            slot = col - offset
            if slot < 0 or slot >= n_slots:
                fila += "_ "
            else:
                fila += "X " if slot in slots_w else ". "
        print(fila.rstrip())

    # Filas de demanda, cobertura y hueco.
    fila_d = "Demanda".ljust(label_w)
    fila_c = "Cobertura".ljust(label_w)
    fila_h = "Hueco".ljust(label_w)
    hay_hueco = False
    for col in range(N_COLS_GRID):
        slot = col - offset
        if slot < 0 or slot >= n_slots:
            fila_d += "_ "; fila_c += "_ "; fila_h += "_ "
        else:
            fila_d += f"{demanda[slot]} "
            cov = sum(
                1 for t in TRABAJADORES
                if slot in asignaciones.get((t["nombre"], dia), set())
            )
            fila_c += f"{cov} "
            ini, _ = p.slot_a_horario(dia, slot)
            h_val = huecos_dia.get((dia, ini), 0)
            if h_val > 0:
                hay_hueco = True
                fila_h += f"{h_val} "
            else:
                fila_h += ". "
    print(fila_d.rstrip())
    print(fila_c.rstrip())
    if hay_hueco:
        print(fila_h.rstrip())


# ---------------------------------------------------------------------------
# Resumen semanal por trabajador / dia
# ---------------------------------------------------------------------------

def imprimir_resumen_semanal(response: ScheduleResponse, problema: Problema):
    print("=" * 88)
    print("Resumen semanal - horas trabajadas por (trabajador, dia):")
    print()
    nombre_max = max(len(t["nombre"]) for t in TRABAJADORES)
    nombre_w = max(nombre_max, len("TRABAJADOR")) + 2
    cab = "TRABAJADOR".ljust(nombre_w)
    for d in problema.dias:
        cab += f"{d[:3]:>7}"
    cab += f"{'TOTAL':>9}{'RANGO h':>10}"
    print(cab)
    print("-" * len(cab))

    horas_dia_total = {d: 0.0 for d in problema.dias}
    for ct in response.cuadrante:
        fila = ct.nombre.ljust(nombre_w)
        for d in problema.dias:
            j = next((x for x in ct.jornadas if x.dia == d), None)
            h = j.horas if j else 0.0
            horas_dia_total[d] += h
            fila += f"{h:>7.1f}"
        fila += f"{ct.horas_semana:>9.1f}{ct.contrato_rango_horas:>10}"
        print(fila)

    print("-" * len(cab))
    fila = "TOTAL".ljust(nombre_w)
    for d in problema.dias:
        fila += f"{horas_dia_total[d]:>7.1f}"
    fila += f"{sum(horas_dia_total.values()):>9.1f}"
    print(fila)
    fila = "Demanda".ljust(nombre_w)
    total_demanda = 0.0
    for d in problema.dias:
        sp = sum(problema.demanda_num_dia[d])
        h = sp * problema.slot_duracion_min / 60
        total_demanda += h
        fila += f"{h:>7.1f}"
    fila += f"{total_demanda:>9.1f}"
    print(fila)


# ---------------------------------------------------------------------------
# Verificaciones
# ---------------------------------------------------------------------------

def imprimir_gaps_entre_jornadas(response: ScheduleResponse):
    print("=" * 88)
    print("Verificacion descanso 12 h entre jornadas (cruce de dia, ciclico):")
    print()
    nombre_max = max(len(t["nombre"]) for t in TRABAJADORES)
    nombre_w = max(nombre_max, len("TRABAJADOR")) + 2
    cruces = sorted({g.cruce for g in response.gaps_entre_jornadas})
    # Mantener el orden lunes->...->domingo->lunes:
    orden = ["LUN>MAR", "MAR>MIE", "MIE>JUE", "JUE>VIE",
             "VIE>SAB", "SAB>DOM", "DOM>LUN"]
    cruces = [c for c in orden if c in cruces]

    cab = "TRABAJADOR".ljust(nombre_w)
    for c in cruces:
        cab += f"{c:>9}"
    cab += f"{'MIN':>7}"
    print(cab)
    print("-" * len(cab))

    por_trab: dict = {t["nombre"]: {} for t in TRABAJADORES}
    for g in response.gaps_entre_jornadas:
        por_trab[g.trabajador][g.cruce] = g.gap_horas

    for t in TRABAJADORES:
        fila = t["nombre"].ljust(nombre_w)
        gaps_v = []
        for c in cruces:
            v = por_trab[t["nombre"]].get(c)
            if v is None:
                fila += f"{'-':>9}"
            else:
                fila += f"{v:>9.1f}"
                gaps_v.append(v)
        fila += f"{min(gaps_v):>7.1f}" if gaps_v else f"{'-':>7}"
        print(fila)


def imprimir_descanso_semanal(response: ScheduleResponse, problema: Problema):
    print("=" * 88)
    print("Verificacion descanso semanal (>= 2 dias seguidos, ciclico):")
    print()
    nombre_max = max(len(t["nombre"]) for t in TRABAJADORES)
    nombre_w = max(nombre_max, len("TRABAJADOR")) + 2
    cab = "TRABAJADOR".ljust(nombre_w)
    for d in problema.dias:
        cab += f"{d[:3]:>5}"
    cab += "   DESCANSO MAS LARGO"
    print(cab)
    print("-" * len(cab))

    for ct in response.cuadrante:
        patron = []
        for d in problema.dias:
            j = next((x for x in ct.jornadas if x.dia == d), None)
            patron.append(0 if (j is None or j.tipo == "descanso") else 1)
        fila = ct.nombre.ljust(nombre_w)
        for v in patron:
            fila += f"{'T' if v else '.':>5}"
        n = len(patron)
        max_run, run, mejor_inicio, inicio_actual = 0, 0, None, None
        for i in range(2 * n):
            if patron[i % n] == 0:
                if run == 0:
                    inicio_actual = i
                run += 1
                if run > max_run:
                    max_run = min(run, n)
                    mejor_inicio = inicio_actual
            else:
                run = 0
        if max_run == 0:
            fila += "   (ninguno)"
        else:
            dias_run = [problema.dias[(mejor_inicio + k) % n]
                        for k in range(max_run)]
            fila += f"   {'-'.join(d[:3] for d in dias_run)} ({max_run} dias)"
        print(fila)


def imprimir_restricciones_individuales(response: ScheduleResponse, problema: Problema):
    print("=" * 88)
    print("Verificacion restricciones individuales (PDF, por trabajador):")
    print()

    p = problema
    by_name = {ct.nombre: ct for ct in response.cuadrante}

    for t in p.trabajadores:
        r = t["restricciones"]
        claves = [k for k in r.keys() if k != "_texto_pdf"]
        if not claves:
            print(f"  {t['nombre']}: sin restricciones individuales.")
            continue
        print(f"  {t['nombre']}:")
        ct = by_name.get(t["nombre"])
        if ct is None:
            print("    (sin asignacion)")
            continue

        # Dias libres.
        for d in r.get("dias_libres", []):
            j = next((x for x in ct.jornadas if x.dia == d), None)
            ok = j is None or j.tipo == "descanso"
            print(f"    [{'OK' if ok else 'FAIL'}] descansa {d[:3]}")

        # No antes de.
        for regla in r.get("no_antes_de", []):
            limite = p.hora_a_minutos(regla["hora"])
            dias = p.dias if regla["dias"] == "TODOS" else regla["dias"]
            for d in dias:
                j = next((x for x in ct.jornadas if x.dia == d), None)
                if j is None or not j.tramos:
                    continue
                primer = min(p.hora_a_minutos(tr.inicio) for tr in j.tramos)
                ok = primer >= limite
                print(f"    [{'OK' if ok else 'FAIL'}] {d[:3]}: "
                      f"primer slot empieza a las {_fmt(primer)} "
                      f"(limite >= {regla['hora']})")

        # No despues de.
        for regla in r.get("no_despues_de", []):
            limite = p.hora_a_minutos(regla["hora"])
            dias = p.dias if regla["dias"] == "TODOS" else regla["dias"]
            for d in dias:
                j = next((x for x in ct.jornadas if x.dia == d), None)
                if j is None or not j.tramos:
                    continue
                ultimo_fin = max(p.hora_fin_a_minutos(tr.fin) for tr in j.tramos)
                # ultimo_start = ultimo_fin - slot_duracion
                ultimo_start = ultimo_fin - p.slot_duracion_min
                ok = ultimo_start < limite
                print(f"    [{'OK' if ok else 'FAIL'}] {d[:3]}: "
                      f"ultimo slot termina a las {_fmt(ultimo_fin)} "
                      f"(limite < {regla['hora']})")

        # Trabajar obligatorio.
        for regla in r.get("trabajar_obligatorio", []):
            d = regla["dia"]
            desde = p.hora_a_minutos(regla["desde"])
            hasta = p.hora_a_minutos(regla["hasta"])
            j = next((x for x in ct.jornadas if x.dia == d), None)
            cubre = 0
            if j is not None:
                ap_min = p.hora_a_minutos(p.horario_apertura[d][0])
                for tr in j.tramos:
                    s_ini = (p.hora_a_minutos(tr.inicio) - ap_min) // p.slot_duracion_min
                    s_fin = (p.hora_fin_a_minutos(tr.fin) - ap_min) // p.slot_duracion_min
                    for s in range(s_ini, s_fin):
                        sm = ap_min + s * p.slot_duracion_min
                        if desde <= sm < hasta:
                            cubre += 1
            ok = cubre >= 1
            print(f"    [{'OK' if ok else 'FAIL'}] {d[:3]}: trabaja "
                  f">=1 slot en {regla['desde']}-{regla['hasta']} "
                  f"(slots cubiertos: {cubre})")


def _fmt(total_min: int) -> str:
    if total_min == 24 * 60:
        return "00:00"
    h, m = divmod(total_min, 60)
    return f"{h:02d}:{m:02d}"


def imprimir_huecos_cobertura(response: ScheduleResponse):
    print("=" * 88)
    if not response.huecos_cobertura:
        print("Diagnostico de cobertura: TODOS los slots cubiertos. "
              "(0 huecos detectados.)")
        return
    total = sum(h.falta_personas for h in response.huecos_cobertura)
    print(f"Diagnostico de cobertura: {len(response.huecos_cobertura)} "
          f"slots con hueco ({total} slots-persona = "
          f"{total * 0.5:.1f} h sin cubrir).")
    print()
    print(f"  {'Dia':<10} {'Slot':<13} {'Demanda':>7} {'Cubierto':>9} "
          f"{'Hueco':>5}   Detalle por nivel")
    print(f"  {'-'*10} {'-'*13} {'-'*7} {'-'*9} {'-'*5}   {'-'*40}")
    for h in response.huecos_cobertura:
        detalle = ", ".join(f"{c} de {r}+" for r, c in h.falta_por_nivel.items())
        print(f"  {h.dia:<10} {h.inicio}-{h.fin}   {h.demanda_total:>7} "
              f"{h.cubierto:>9} {h.falta_personas:>5}   {detalle}")
    print()
    print("  Estos huecos son los minimos posibles dadas las restricciones")
    print("  legales y individuales del PDF. La subfase 0.12 implementara")
    print("  propuestas estructuradas para tratar de cerrarlos.")


def imprimir_huecos_etiquetas(response: ScheduleResponse):
    print("=" * 88)
    if not response.huecos_etiqueta:
        print("Verificacion etiquetas: TODOS los slots con etiqueta requerida cubiertos.")
        return
    print(f"Verificacion etiquetas: {len(response.huecos_etiqueta)} "
          f"slots SIN cubrir la etiqueta requerida.")
    for h in response.huecos_etiqueta:
        print(f"  {h.dia:<10} {h.inicio}-{h.fin}   "
              f"requiere {' / '.join(h.etiquetas_requeridas)}")
        if h.asignados:
            print(f"            asignados: {', '.join(h.asignados)}")


def imprimir_pausas_obligatorias(response: ScheduleResponse):
    print("=" * 88)
    print("Pausa de 20 min obligatoria en jornadas continuadas > 5 h:")
    print()
    if not response.pausas_obligatorias:
        print("  No hay jornadas continuadas > 5 h. Sin pausas obligatorias.")
        return
    print(f"  {len(response.pausas_obligatorias)} tramos continuados > 5 h.")
    print()
    print(f"  {'Trabajador':<12} {'Dia':<10} {'Horario':<13} {'Duracion':>9}")
    print(f"  {'-'*12} {'-'*10} {'-'*13} {'-'*9}")
    for pa in response.pausas_obligatorias:
        print(f"  {pa.trabajador:<12} {pa.dia:<10} {pa.inicio}-{pa.fin}    "
              f"{pa.duracion_horas:>5.1f} h")


def imprimir_metricas_objetivo(response: ScheduleResponse):
    print("=" * 88)
    print("Metricas del objetivo blando (subfase 0.11):")
    print()
    m = response.metricas
    print(f"  Total jornadas CONTINUADAS: {m.total_continuadas}")
    print(f"  Total jornadas PARTIDAS:    {m.total_partidas}")
    print(f"  Dispersion partidas (max - min entre trabajadores): {m.dispersion_partidas}")
    print()
    print(f"  {'Trabajador':<12} {'Continuadas':>12} {'Partidas':>9} {'Descansos':>10}")
    print(f"  {'-'*12} {'-'*12} {'-'*9} {'-'*10}")
    for ct in response.cuadrante:
        partidas = m.partidas_por_trabajador.get(ct.nombre, 0)
        continuadas = sum(1 for j in ct.jornadas if j.tipo == "continuada")
        descansos = sum(1 for j in ct.jornadas if j.tipo == "descanso")
        print(f"  {ct.nombre:<12} {continuadas:>12} {partidas:>9} {descansos:>10}")


def imprimir_cuadrante_por_trabajador(response: ScheduleResponse):
    print("=" * 88)
    print("Cuadrante semanal por trabajador (vista por persona):")
    print()
    for ct in response.cuadrante:
        print(f"  {ct.nombre}  -  rol {ct.rol}, contrato {ct.contrato_rango_horas}h, "
              f"total semana {ct.horas_semana:.1f} h")
        for j in ct.jornadas:
            if j.tipo == "descanso":
                print(f"    {j.dia:<10}: descanso")
                continue
            partes = " | ".join(
                f"{tr.inicio}-{tr.fin} ({tr.duracion_horas:.1f}h)"
                for tr in j.tramos
            )
            tipo_str = "continuada" if j.tipo == "continuada" else f"partida {len(j.tramos)} tramos"
            print(f"    {j.dia:<10}: {partes}  -> {j.horas:.1f}h, {tipo_str}")
        print()


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    seed_arg = None
    if len(sys.argv) > 1:
        try:
            seed_arg = int(sys.argv[1])
        except ValueError:
            print(f"Argumento '{sys.argv[1]}' no es un entero valido para seed.")
            sys.exit(1)
    main(seed=seed_arg)
