"""
SHIFT SOLVER AI - Motor del solver (reutilizable)
==================================================
Funcion publica principal:

    resolver_problema(request: ScheduleRequest, seed: int | None = None)
        -> ScheduleResponse

Encapsula la construccion del modelo CP-SAT (subfases 0.1-0.11), la
resolucion y la serializacion del resultado a un objeto Pydantic.

Diseñado para ser usado tanto desde:
  - El script CLI `solver.py` (que prepara un request a partir de data.py
    y luego imprime el response en formato texto para validacion humana).
  - El servicio FastAPI `main.py` (POST /solve).

El modelo CP-SAT y todas las restricciones son IDENTICOS al del solver
final de la Fase 0; lo unico que cambia es de donde vienen los datos
(parametros del request en lugar de globals de data.py).
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from schemas import (
    CuadranteTrabajador,
    Diagnostico,
    GapEntreJornadas,
    HuecoCobertura,
    HuecoEtiqueta,
    HorarioApertura,
    JornadaDia,
    Metricas,
    Parametros,
    PausaObligatoria,
    Propuesta,
    ScheduleRequest,
    ScheduleResponse,
    TramoDia,
)


# ---------------------------------------------------------------------------
# Constantes (independientes del request, vienen del PDF)
# ---------------------------------------------------------------------------

DESCANSO_MIN_ENTRE_JORNADAS_MIN = 12 * 60
SEMANA_MIN = 7 * 24 * 60

SLOTS_TRAMO_MIN = 6              # 3 h
SLOTS_TRAMO_MAX_PARTIDA = 10     # 5 h
SLOTS_GAP_MIN_PARTIDA = 3        # 1.5 h
SLOTS_DIA_MAX = 18               # 9 h ordinarias
N_TRAMOS_MAX = 2

PESO_HUECO = 1_000_000
PESO_PARTIDA = 1_000
PESO_DISPERSION = 100
PESO_SOBRECUB = 1


# ---------------------------------------------------------------------------
# Problema cargado: contenedor de los datos derivados del request
# ---------------------------------------------------------------------------

@dataclass
class Problema:
    """Estado derivado del request: dias, slot duracion, horarios, lista de
    trabajadores como dicts (compatible con el shape de data.py), demanda
    expandida por slot, etc. Tambien incluye los helpers de tiempo / slot /
    contrato como metodos para que toda la lógica pueda trabajar sobre el
    objeto Problema en lugar de usar globals."""

    dias: List[str]
    slot_duracion_min: int
    slots_por_hora: int
    horario_apertura: Dict[str, Tuple[str, str]]
    roles_jerarquia: List[str]
    etiquetas: List[str]
    trabajadores: List[dict]
    demanda_num_dia: Dict[str, List[int]]
    demanda_rol_dia: Dict[str, List[Dict[str, int]]]
    etiquetas_dia: Dict[str, List[List[str]]]
    parametros: Parametros = field(default_factory=Parametros)

    # ----- helpers de hora <-> minutos / slot -----

    def hora_a_minutos(self, h: str) -> int:
        hh, mm = map(int, h.split(":"))
        return hh * 60 + mm

    def hora_fin_a_minutos(self, h: str) -> int:
        if h == "00:00":
            return 24 * 60
        return self.hora_a_minutos(h)

    def _min_a_hora(self, total_min: int) -> str:
        if total_min == 24 * 60:
            return "00:00"
        h, m = divmod(total_min, 60)
        return f"{h:02d}:{m:02d}"

    def num_slots_dia(self, d: str) -> int:
        ap, ci = self.horario_apertura[d]
        return (
            self.hora_fin_a_minutos(ci) - self.hora_a_minutos(ap)
        ) // self.slot_duracion_min

    def slot_a_horario(self, d: str, s: int) -> Tuple[str, str]:
        ap, _ = self.horario_apertura[d]
        ini_min = self.hora_a_minutos(ap) + s * self.slot_duracion_min
        fin_min = ini_min + self.slot_duracion_min
        return (self._min_a_hora(ini_min), self._min_a_hora(fin_min))

    def minuto_inicio_dia(self, d: str) -> int:
        return self.dias.index(d) * 24 * 60

    def timestamp_slot_inicio(self, d: str, s: int) -> int:
        return (
            self.minuto_inicio_dia(d)
            + self.hora_a_minutos(self.horario_apertura[d][0])
            + s * self.slot_duracion_min
        )

    def timestamp_slot_fin(self, d: str, s: int) -> int:
        return self.timestamp_slot_inicio(d, s) + self.slot_duracion_min

    # ----- helpers de contrato -----

    def slots_semanales_contrato(self, t: dict) -> Tuple[int, int]:
        c = t["contrato"]
        if c["tipo"] == "fijo":
            h = c["horas"]
            if h == 40:
                return (40 * self.slots_por_hora, 44 * self.slots_por_hora)
            return (h * self.slots_por_hora, h * self.slots_por_hora)
        return (
            c["min_horas"] * self.slots_por_hora,
            c["max_horas"] * self.slots_por_hora,
        )

    def rango_horas_contrato_str(self, t: dict) -> str:
        s_min, s_max = self.slots_semanales_contrato(t)
        h_min = s_min // self.slots_por_hora
        h_max = s_max // self.slots_por_hora
        return f"{h_min}" if h_min == h_max else f"{h_min}-{h_max}"


# ---------------------------------------------------------------------------
# cargar_problema: ScheduleRequest -> Problema
# ---------------------------------------------------------------------------

def _expandir_franjas_num(franjas, apertura_min, n_slots, slot_duracion_min):
    out = [0] * n_slots
    for f in franjas:
        h_ini = _hora_a_min(f.inicio)
        h_fin = _hora_fin_a_min(f.fin)
        s_ini = (h_ini - apertura_min) // slot_duracion_min
        s_fin = (h_fin - apertura_min) // slot_duracion_min
        for s in range(s_ini, s_fin):
            out[s] = f.personas
    return out


def _expandir_franjas_rol(franjas, apertura_min, n_slots, slot_duracion_min):
    out = [{} for _ in range(n_slots)]
    for f in franjas:
        h_ini = _hora_a_min(f.inicio)
        h_fin = _hora_fin_a_min(f.fin)
        s_ini = (h_ini - apertura_min) // slot_duracion_min
        s_fin = (h_fin - apertura_min) // slot_duracion_min
        for s in range(s_ini, s_fin):
            out[s] = dict(f.personas_por_rol)
    return out


def _expandir_franjas_eti(franjas, apertura_min, n_slots, slot_duracion_min):
    out = [[] for _ in range(n_slots)]
    for f in franjas:
        h_ini = _hora_a_min(f.inicio)
        h_fin = _hora_fin_a_min(f.fin)
        s_ini = (h_ini - apertura_min) // slot_duracion_min
        s_fin = (h_fin - apertura_min) // slot_duracion_min
        for s in range(s_ini, s_fin):
            out[s] = list(f.etiquetas)
    return out


def _hora_a_min(h: str) -> int:
    hh, mm = map(int, h.split(":"))
    return hh * 60 + mm


def _hora_fin_a_min(h: str) -> int:
    if h == "00:00":
        return 24 * 60
    return _hora_a_min(h)


def cargar_problema(request: ScheduleRequest) -> Problema:
    """Convierte el request en un Problema con todos los datos derivados."""
    slot_duracion_min = request.slot_duracion_min
    slots_por_hora = 60 // slot_duracion_min
    horario_apertura = {
        d: (h.apertura, h.cierre) for d, h in request.horario_apertura.items()
    }

    # Trabajadores: Pydantic -> dict con shape compatible con data.py.
    trabajadores = []
    for t in request.trabajadores:
        c = t.contrato
        contrato_dict: dict = {"tipo": c.tipo}
        if c.tipo == "fijo":
            contrato_dict["horas"] = c.horas
        else:
            contrato_dict["min_horas"] = c.min_horas
            contrato_dict["max_horas"] = c.max_horas

        r = t.restricciones
        restricciones_dict: dict = {}
        if r.dias_libres:
            restricciones_dict["dias_libres"] = list(r.dias_libres)
        if r.no_antes_de:
            restricciones_dict["no_antes_de"] = [
                {"hora": x.hora, "dias": x.dias} for x in r.no_antes_de
            ]
        if r.no_despues_de:
            restricciones_dict["no_despues_de"] = [
                {"hora": x.hora, "dias": x.dias} for x in r.no_despues_de
            ]
        if r.trabajar_obligatorio:
            restricciones_dict["trabajar_obligatorio"] = [
                {"dia": x.dia, "desde": x.desde, "hasta": x.hasta}
                for x in r.trabajar_obligatorio
            ]
        if r.texto_pdf is not None:
            restricciones_dict["_texto_pdf"] = r.texto_pdf

        trabajadores.append({
            "nombre": t.nombre,
            "contrato": contrato_dict,
            "rol": t.rol,
            "etiquetas": list(t.etiquetas),
            "restricciones": restricciones_dict,
        })

    # Expandir franjas a vectores por slot, dia a dia.
    demanda_num_dia: Dict[str, List[int]] = {}
    demanda_rol_dia: Dict[str, List[Dict[str, int]]] = {}
    etiquetas_dia: Dict[str, List[List[str]]] = {}
    for d in request.dias:
        ap_str, ci_str = horario_apertura[d]
        apertura_min = _hora_a_min(ap_str)
        n_slots = (
            _hora_fin_a_min(ci_str) - apertura_min
        ) // slot_duracion_min
        demanda_num_dia[d] = _expandir_franjas_num(
            request.franjas_num.get(d, []),
            apertura_min, n_slots, slot_duracion_min,
        )
        demanda_rol_dia[d] = _expandir_franjas_rol(
            request.franjas_rol.get(d, []),
            apertura_min, n_slots, slot_duracion_min,
        )
        etiquetas_dia[d] = _expandir_franjas_eti(
            request.franjas_eti.get(d, []),
            apertura_min, n_slots, slot_duracion_min,
        )

    problema = Problema(
        dias=list(request.dias),
        slot_duracion_min=slot_duracion_min,
        slots_por_hora=slots_por_hora,
        horario_apertura=horario_apertura,
        roles_jerarquia=list(request.roles_jerarquia),
        etiquetas=list(request.etiquetas),
        trabajadores=trabajadores,
        demanda_num_dia=demanda_num_dia,
        demanda_rol_dia=demanda_rol_dia,
        etiquetas_dia=etiquetas_dia,
        parametros=request.parametros,
    )

    # Sanity check: la suma del desglose por rol debe coincidir con la
    # demanda numerica total slot a slot.
    for d in problema.dias:
        for s in range(problema.num_slots_dia(d)):
            suma_rol = sum(problema.demanda_rol_dia[d][s].values())
            num = problema.demanda_num_dia[d][s]
            if suma_rol != num:
                raise ValueError(
                    f"Inconsistencia: {d} slot {s} -> demanda numerica = {num} "
                    f"pero suma por rol = {suma_rol}"
                )
    # Sanity check: todas las etiquetas listadas estan en el catalogo.
    catalogo_etis = set(problema.etiquetas)
    for d in problema.dias:
        for s in range(problema.num_slots_dia(d)):
            for e in problema.etiquetas_dia[d][s]:
                if e not in catalogo_etis:
                    raise ValueError(
                        f"Etiqueta desconocida '{e}' en {d} slot {s}"
                    )

    return problema


# ---------------------------------------------------------------------------
# construir_modelo: Problema -> (model, vars)
# ---------------------------------------------------------------------------

@dataclass
class ModeloVars:
    """Conjunto de variables del modelo CP-SAT que necesitan accederse despues
    de resolver para serializar el response."""
    x: dict
    huecos: dict
    huecos_eti: dict
    trabaja_dia: dict
    es_partida_dia: dict


def construir_modelo(problema: Problema) -> Tuple[cp_model.CpModel, ModeloVars]:
    """Construye el modelo CP-SAT con todas las restricciones y el objetivo
    blando de la Fase 0. No resuelve."""
    p = problema
    n_trab = len(p.trabajadores)
    model = cp_model.CpModel()

    # Variables x[(w, d, s)] = 1 si el trabajador w trabaja el slot s del dia d.
    x = {}
    for w in range(n_trab):
        for d in p.dias:
            for s in range(p.num_slots_dia(d)):
                x[(w, d, s)] = model.NewBoolVar(f"x_{w}_{d}_{s}")

    # 0.6: restricciones individuales (fijaciones x = 0).
    for w, t in enumerate(p.trabajadores):
        r = t["restricciones"]
        for d in r.get("dias_libres", []):
            for s in range(p.num_slots_dia(d)):
                model.Add(x[(w, d, s)] == 0)
        for regla in r.get("no_antes_de", []):
            limite = p.hora_a_minutos(regla["hora"])
            dias = p.dias if regla["dias"] == "TODOS" else regla["dias"]
            for d in dias:
                ap_min = p.hora_a_minutos(p.horario_apertura[d][0])
                for s in range(p.num_slots_dia(d)):
                    if ap_min + s * p.slot_duracion_min < limite:
                        model.Add(x[(w, d, s)] == 0)
        for regla in r.get("no_despues_de", []):
            limite = p.hora_a_minutos(regla["hora"])
            dias = p.dias if regla["dias"] == "TODOS" else regla["dias"]
            for d in dias:
                ap_min = p.hora_a_minutos(p.horario_apertura[d][0])
                for s in range(p.num_slots_dia(d)):
                    if ap_min + s * p.slot_duracion_min >= limite:
                        model.Add(x[(w, d, s)] == 0)
        for regla in r.get("trabajar_obligatorio", []):
            d = regla["dia"]
            desde = p.hora_a_minutos(regla["desde"])
            hasta = p.hora_a_minutos(regla["hasta"])
            ap_min = p.hora_a_minutos(p.horario_apertura[d][0])
            slots_v = [
                s for s in range(p.num_slots_dia(d))
                if desde <= ap_min + s * p.slot_duracion_min < hasta
            ]
            if slots_v:
                model.Add(sum(x[(w, d, s)] for s in slots_v) >= 1)

    # 0.7: cobertura por rol jerarquico acumulado, blanda con huecos.
    huecos = {}
    for d in p.dias:
        for s in range(p.num_slots_dia(d)):
            demanda_s = p.demanda_rol_dia[d][s]
            for nivel_idx in range(len(p.roles_jerarquia)):
                roles_validos = p.roles_jerarquia[nivel_idx:]
                demanda_acum = sum(
                    demanda_s.get(r, 0) for r in roles_validos
                )
                if demanda_acum == 0:
                    continue
                asignados = sum(
                    x[(w, d, s)]
                    for w in range(n_trab)
                    if p.trabajadores[w]["rol"] in roles_validos
                )
                hueco = model.NewIntVar(
                    0, demanda_acum, f"hueco_{d}_{s}_n{nivel_idx}"
                )
                model.Add(asignados + hueco >= demanda_acum)
                huecos[(d, s, nivel_idx)] = hueco

    # 0.8: etiquetas por slot, blandas.
    huecos_eti = {}
    for d in p.dias:
        for s in range(p.num_slots_dia(d)):
            etis = p.etiquetas_dia[d][s]
            if not etis:
                continue
            etis_set = set(etis)
            candidatos = [
                w for w in range(n_trab)
                if etis_set.intersection(p.trabajadores[w]["etiquetas"])
            ]
            hueco = model.NewIntVar(0, 1, f"hueco_eti_{d}_{s}")
            if candidatos:
                model.Add(
                    sum(x[(w, d, s)] for w in candidatos) + hueco >= 1
                )
            else:
                model.Add(hueco == 1)
            huecos_eti[(d, s)] = hueco

    # 0.3: horas semanales por contrato.
    for w, t in enumerate(p.trabajadores):
        s_min, s_max = p.slots_semanales_contrato(t)
        total_w = sum(
            x[(w, d, s)]
            for d in p.dias
            for s in range(p.num_slots_dia(d))
        )
        if s_min == s_max:
            model.Add(total_w == s_min)
        else:
            model.Add(total_w >= s_min)
            model.Add(total_w <= s_max)

    # 0.4: 12 h descanso entre jornadas (ciclico).
    cruces = list(zip(p.dias, p.dias[1:] + [p.dias[0]]))
    for w in range(n_trab):
        for d_a, d_b in cruces:
            envuelve = p.dias.index(d_b) <= p.dias.index(d_a)
            offset_b = SEMANA_MIN if envuelve else 0
            for s_a in range(p.num_slots_dia(d_a)):
                t_fin_a = p.timestamp_slot_fin(d_a, s_a)
                for s_b in range(p.num_slots_dia(d_b)):
                    t_ini_b = p.timestamp_slot_inicio(d_b, s_b) + offset_b
                    if t_ini_b - t_fin_a < DESCANSO_MIN_ENTRE_JORNADAS_MIN:
                        model.Add(x[(w, d_a, s_a)] + x[(w, d_b, s_b)] <= 1)

    # 0.5: descanso semanal de 2 dias seguidos.
    trabaja_dia = {}
    for w in range(n_trab):
        for d in p.dias:
            t_var = model.NewBoolVar(f"trabaja_{w}_{d}")
            slots_d = sum(x[(w, d, s)] for s in range(p.num_slots_dia(d)))
            model.Add(slots_d >= 1).OnlyEnforceIf(t_var)
            model.Add(slots_d == 0).OnlyEnforceIf(t_var.Not())
            trabaja_dia[(w, d)] = t_var
    for w in range(n_trab):
        descansa_pares = []
        for d_a, d_b in cruces:
            dp = model.NewBoolVar(f"descansa_par_{w}_{d_a}_{d_b}")
            ta = trabaja_dia[(w, d_a)]
            tb = trabaja_dia[(w, d_b)]
            model.Add(ta + tb == 0).OnlyEnforceIf(dp)
            model.Add(ta + tb >= 1).OnlyEnforceIf(dp.Not())
            descansa_pares.append(dp)
        model.Add(sum(descansa_pares) >= 1)

    # 0.9: estructura de jornada (tramos) + EDGAR solo continuada.
    inicio_tramo = {}
    fin_tramo = {}
    es_partida_dia = {}
    for w, t_info in enumerate(p.trabajadores):
        edgar_solo_continuada = t_info["nombre"] == "EDGAR"
        for d in p.dias:
            n = p.num_slots_dia(d)
            for s in range(n):
                ini = model.NewBoolVar(f"ini_{w}_{d}_{s}")
                fin = model.NewBoolVar(f"fin_{w}_{d}_{s}")
                if s == 0:
                    model.Add(ini == x[(w, d, s)])
                else:
                    model.Add(ini >= x[(w, d, s)] - x[(w, d, s - 1)])
                    model.Add(ini <= x[(w, d, s)])
                    model.Add(ini <= 1 - x[(w, d, s - 1)])
                if s == n - 1:
                    model.Add(fin == x[(w, d, s)])
                else:
                    model.Add(fin >= x[(w, d, s)] - x[(w, d, s + 1)])
                    model.Add(fin <= x[(w, d, s)])
                    model.Add(fin <= 1 - x[(w, d, s + 1)])
                inicio_tramo[(w, d, s)] = ini
                fin_tramo[(w, d, s)] = fin

            n_tramos_dia = sum(inicio_tramo[(w, d, s)] for s in range(n))
            total_dia = sum(x[(w, d, s)] for s in range(n))

            if edgar_solo_continuada:
                model.Add(n_tramos_dia <= 1)
            else:
                model.Add(n_tramos_dia <= N_TRAMOS_MAX)
            model.Add(total_dia <= SLOTS_DIA_MAX)

            for s in range(n):
                if s + SLOTS_TRAMO_MIN - 1 >= n:
                    model.Add(inicio_tramo[(w, d, s)] == 0)
                else:
                    for i in range(1, SLOTS_TRAMO_MIN):
                        model.Add(
                            x[(w, d, s + i)] >= inicio_tramo[(w, d, s)]
                        )
            for s in range(n):
                for s2 in range(s + 1, min(s + 1 + SLOTS_GAP_MIN_PARTIDA, n)):
                    model.Add(
                        fin_tramo[(w, d, s)] + inicio_tramo[(w, d, s2)] <= 1
                    )

            es_partida = model.NewBoolVar(f"partida_{w}_{d}")
            model.Add(n_tramos_dia == N_TRAMOS_MAX).OnlyEnforceIf(es_partida)
            model.Add(n_tramos_dia <= 1).OnlyEnforceIf(es_partida.Not())
            es_partida_dia[(w, d)] = es_partida
            for s in range(n - SLOTS_TRAMO_MAX_PARTIDA):
                model.Add(
                    sum(
                        x[(w, d, s + i)]
                        for i in range(SLOTS_TRAMO_MAX_PARTIDA + 1)
                    ) <= SLOTS_TRAMO_MAX_PARTIDA
                ).OnlyEnforceIf(es_partida)

    # 0.11: objetivo blando.
    num_partidas_w = []
    for w in range(n_trab):
        np_w = model.NewIntVar(0, len(p.dias), f"npartidas_w{w}")
        model.Add(np_w == sum(es_partida_dia[(w, d)] for d in p.dias))
        num_partidas_w.append(np_w)
    max_p = model.NewIntVar(0, len(p.dias), "max_partidas")
    min_p = model.NewIntVar(0, len(p.dias), "min_partidas")
    model.AddMaxEquality(max_p, num_partidas_w)
    model.AddMinEquality(min_p, num_partidas_w)
    dispersion = model.NewIntVar(0, len(p.dias), "dispersion")
    model.Add(dispersion == max_p - min_p)

    model.Minimize(
        PESO_HUECO * sum(huecos.values())
        + PESO_HUECO * sum(huecos_eti.values())
        + PESO_PARTIDA * sum(es_partida_dia.values())
        + PESO_DISPERSION * dispersion
        + PESO_SOBRECUB * sum(x.values())
    )

    return model, ModeloVars(
        x=x, huecos=huecos, huecos_eti=huecos_eti,
        trabaja_dia=trabaja_dia, es_partida_dia=es_partida_dia,
    )


# ---------------------------------------------------------------------------
# Helpers para extraer la solucion (tramos por dia)
# ---------------------------------------------------------------------------

def tramos_dia(solver, x, w, dia, problema: Problema):
    """Devuelve la lista de tramos consecutivos (s_ini, s_fin) trabajados por
    el trabajador w el dia dado, segun la solucion del solver."""
    n = problema.num_slots_dia(dia)
    slots_t = [s for s in range(n) if solver.Value(x[(w, dia, s)])]
    if not slots_t:
        return []
    tramos = []
    ini = anterior = slots_t[0]
    for s in slots_t[1:]:
        if s == anterior + 1:
            anterior = s
        else:
            tramos.append((ini, anterior))
            ini = anterior = s
    tramos.append((ini, anterior))
    return tramos


def hueco_efectivo_slot(solver, problema, huecos, dia, s):
    """Personas faltantes efectivas en (dia, s) = max sobre niveles de
    huecos por nivel jerarquico."""
    valores = [
        solver.Value(huecos[(dia, s, ni)])
        for ni in range(len(problema.roles_jerarquia))
        if (dia, s, ni) in huecos
    ]
    return max(valores) if valores else 0


# ---------------------------------------------------------------------------
# serializar_response: extrae la solucion al objeto Pydantic
# ---------------------------------------------------------------------------

def serializar_response(
    solver: cp_model.CpSolver,
    status: int,
    problema: Problema,
    vars_: ModeloVars,
    seed: int | None,
) -> ScheduleResponse:
    """Construye el ScheduleResponse a partir de la solucion del solver."""
    p = problema
    x = vars_.x
    huecos = vars_.huecos
    huecos_eti = vars_.huecos_eti
    es_partida_dia = vars_.es_partida_dia
    trabaja_dia = vars_.trabaja_dia

    estado_name = solver.StatusName(status)

    # Si no hay solucion, devolver un response minimo con el estado.
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return ScheduleResponse(
            estado=estado_name,
            tiempo_calculo_segundos=solver.WallTime(),
            seed_usado=seed,
            slots_persona_demanda=sum(sum(p.demanda_num_dia[d]) for d in p.dias),
            slots_persona_asignados=0,
            slots_persona_huecos=0,
            horas_persona_demanda=0.0,
            horas_persona_asignadas=0.0,
            horas_persona_huecos=0.0,
            cuadrante=[],
            metricas=Metricas(
                total_continuadas=0, total_partidas=0,
                dispersion_partidas=0, partidas_por_trabajador={},
            ),
        )

    n_trab = len(p.trabajadores)
    sd = p.slot_duracion_min

    # ----- Cuadrante por trabajador -----
    cuadrante = []
    for w, t in enumerate(p.trabajadores):
        jornadas = []
        horas_semana = 0.0
        for d in p.dias:
            tramos = tramos_dia(solver, x, w, d, p)
            if not tramos:
                jornadas.append(JornadaDia(
                    dia=d, tipo="descanso", tramos=[], horas=0.0,
                    requiere_pausa_20min=False,
                ))
                continue
            tramos_s = []
            horas_dia = 0.0
            for s_ini, s_fin in tramos:
                h_ini, _ = p.slot_a_horario(d, s_ini)
                _, h_fin = p.slot_a_horario(d, s_fin)
                dur = (s_fin - s_ini + 1) * sd / 60
                horas_dia += dur
                tramos_s.append(TramoDia(
                    inicio=h_ini, fin=h_fin, duracion_horas=dur,
                ))
            tipo = "continuada" if len(tramos) == 1 else "partida"
            requiere_pausa = tipo == "continuada" and horas_dia > 5
            jornadas.append(JornadaDia(
                dia=d, tipo=tipo, tramos=tramos_s, horas=horas_dia,
                requiere_pausa_20min=requiere_pausa,
            ))
            horas_semana += horas_dia
        cuadrante.append(CuadranteTrabajador(
            nombre=t["nombre"],
            rol=t["rol"],
            contrato_rango_horas=p.rango_horas_contrato_str(t),
            horas_semana=horas_semana,
            jornadas=jornadas,
        ))

    # ----- Huecos de cobertura -----
    huecos_cob: List[HuecoCobertura] = []
    for d in p.dias:
        for s in range(p.num_slots_dia(d)):
            ef = hueco_efectivo_slot(solver, p, huecos, d, s)
            if ef == 0:
                continue
            por_nivel = {
                p.roles_jerarquia[ni]: solver.Value(huecos[(d, s, ni)])
                for ni in range(len(p.roles_jerarquia))
                if (d, s, ni) in huecos
                and solver.Value(huecos[(d, s, ni)]) > 0
            }
            ini, fin = p.slot_a_horario(d, s)
            demanda_total = p.demanda_num_dia[d][s]
            huecos_cob.append(HuecoCobertura(
                dia=d, inicio=ini, fin=fin,
                demanda_total=demanda_total,
                cubierto=demanda_total - ef,
                falta_personas=ef,
                falta_por_nivel=por_nivel,
            ))

    # ----- Huecos de etiqueta -----
    huecos_et: List[HuecoEtiqueta] = []
    for d in p.dias:
        for s in range(p.num_slots_dia(d)):
            if (d, s) not in huecos_eti:
                continue
            if solver.Value(huecos_eti[(d, s)]) == 0:
                continue
            ini, fin = p.slot_a_horario(d, s)
            asignados = [
                p.trabajadores[w]["nombre"]
                for w in range(n_trab) if solver.Value(x[(w, d, s)])
            ]
            huecos_et.append(HuecoEtiqueta(
                dia=d, inicio=ini, fin=fin,
                etiquetas_requeridas=list(p.etiquetas_dia[d][s]),
                asignados=asignados,
            ))

    # ----- Metricas (objetivo blando 0.11) -----
    partidas_por_trab = {
        p.trabajadores[w]["nombre"]:
            sum(solver.Value(es_partida_dia[(w, d)]) for d in p.dias)
        for w in range(n_trab)
    }
    total_partidas = sum(partidas_por_trab.values())
    total_continuadas = sum(
        1
        for w in range(n_trab) for d in p.dias
        if solver.Value(trabaja_dia[(w, d)])
        and not solver.Value(es_partida_dia[(w, d)])
    )
    valores_partidas = list(partidas_por_trab.values())
    dispersion = (
        max(valores_partidas) - min(valores_partidas)
        if valores_partidas else 0
    )
    metricas = Metricas(
        total_continuadas=total_continuadas,
        total_partidas=total_partidas,
        dispersion_partidas=dispersion,
        partidas_por_trabajador=partidas_por_trab,
    )

    # ----- Gaps entre jornadas (ciclico) -----
    gaps: List[GapEntreJornadas] = []
    cruces = list(zip(p.dias, p.dias[1:] + [p.dias[0]]))
    for w, t in enumerate(p.trabajadores):
        for d_a, d_b in cruces:
            envuelve = p.dias.index(d_b) <= p.dias.index(d_a)
            offset_b = SEMANA_MIN if envuelve else 0
            slots_a = [
                s for s in range(p.num_slots_dia(d_a))
                if solver.Value(x[(w, d_a, s)])
            ]
            slots_b = [
                s for s in range(p.num_slots_dia(d_b))
                if solver.Value(x[(w, d_b, s)])
            ]
            if not slots_a or not slots_b:
                gap_h = None
            else:
                t_fin_a = p.timestamp_slot_fin(d_a, max(slots_a))
                t_ini_b = p.timestamp_slot_inicio(d_b, min(slots_b)) + offset_b
                gap_h = (t_ini_b - t_fin_a) / 60
            gaps.append(GapEntreJornadas(
                trabajador=t["nombre"],
                cruce=f"{d_a[:3]}>{d_b[:3]}",
                gap_horas=gap_h,
            ))

    # ----- Pausas obligatorias (continuadas > 5 h) -----
    pausas: List[PausaObligatoria] = []
    for w, t in enumerate(p.trabajadores):
        for d in p.dias:
            tramos = tramos_dia(solver, x, w, d, p)
            if len(tramos) != 1:
                continue
            s_ini, s_fin = tramos[0]
            dur_h = (s_fin - s_ini + 1) * sd / 60
            if dur_h <= 5:
                continue
            h_ini, _ = p.slot_a_horario(d, s_ini)
            _, h_fin = p.slot_a_horario(d, s_fin)
            pausas.append(PausaObligatoria(
                trabajador=t["nombre"],
                dia=d, inicio=h_ini, fin=h_fin,
                duracion_horas=dur_h,
            ))

    # ----- Totales agregados -----
    sp_demanda = sum(sum(p.demanda_num_dia[d]) for d in p.dias)
    sp_asignados = sum(
        solver.Value(x[(w, d, s)])
        for w in range(n_trab)
        for d in p.dias
        for s in range(p.num_slots_dia(d))
    )
    sp_huecos = sum(
        hueco_efectivo_slot(solver, p, huecos, d, s)
        for d in p.dias
        for s in range(p.num_slots_dia(d))
    )

    return ScheduleResponse(
        estado=estado_name,
        tiempo_calculo_segundos=solver.WallTime(),
        seed_usado=seed,
        slots_persona_demanda=sp_demanda,
        slots_persona_asignados=sp_asignados,
        slots_persona_huecos=sp_huecos,
        horas_persona_demanda=sp_demanda * sd / 60,
        horas_persona_asignadas=sp_asignados * sd / 60,
        horas_persona_huecos=sp_huecos * sd / 60,
        cuadrante=cuadrante,
        huecos_cobertura=huecos_cob,
        huecos_etiqueta=huecos_et,
        metricas=metricas,
        gaps_entre_jornadas=gaps,
        pausas_obligatorias=pausas,
    )


# ---------------------------------------------------------------------------
# Subfase 0.12: diagnostico de infactibilidad / huecos estructurales
# ---------------------------------------------------------------------------

DIAS_ORDEN = ["LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO","DOMINGO"]


def _dia_label(d: str) -> str:
    return {
        "LUNES": "lunes", "MARTES": "martes", "MIERCOLES": "miércoles",
        "JUEVES": "jueves", "VIERNES": "viernes",
        "SABADO": "sábado", "DOMINGO": "domingo",
    }.get(d, d.lower())


def _capacidad_max_horas_trabajador(t: dict) -> float:
    """Horas máximas semanales razonables del trabajador segun su contrato."""
    c = t["contrato"]
    if c["tipo"] == "fijo":
        h = c["horas"]
        # Flexibilidad legal: contratos de 40h pueden subir a 44h.
        if h == 40:
            return 44.0
        return float(h)
    return float(c["max_horas"])


def _trabajador_disponible_dia(t: dict, dia: str) -> bool:
    """Devuelve False si el dia es dia_libre fijo del trabajador."""
    r = t.get("restricciones", {})
    return dia not in r.get("dias_libres", [])


def _trabajador_tiene_etiqueta(t: dict, etiqueta: str) -> bool:
    return etiqueta in t.get("etiquetas", [])


def _trabajador_rol_indice(t: dict, roles_jerarquia: List[str]) -> int:
    """Indice del rol del trabajador (0 = base, N-1 = top)."""
    try:
        return roles_jerarquia.index(t["rol"])
    except ValueError:
        return 0


def _hora_a_min(h: str) -> int:  # noqa: F811
    hh, mm = map(int, h.split(":"))
    return hh * 60 + mm


def _hora_fin_a_min(h: str) -> int:  # noqa: F811
    if h == "00:00":
        return 24 * 60
    return _hora_a_min(h)


def diagnosticar_infactibilidad(
    problema,
    huecos_por_slot: dict | None = None,
) -> Diagnostico:
    """Análisis estructural del problema cuando hay infactibilidad o huecos
    estructurales. Detecta cuellos de botella (capacidad, rol, etiqueta,
    restricciones individuales contradictorias) y genera propuestas accionables
    en español. NO vuelve a llamar al solver: usa solo análisis combinatorio
    sobre el `Problema` cargado.

    Args:
        problema: el Problema ya cargado (con expansion de demanda por slot).
        huecos_por_slot: opcional, dict {(dia, slot): n_personas_faltan} si la
                         solucion CP-SAT trajo huecos concretos para enriquecer
                         el diagnostico con info real.
    """
    p = problema
    sd = p.slot_duracion_min
    propuestas: List[Propuesta] = []

    # ----- Capacidad agregada -----
    demanda_slots = sum(
        p.demanda_num_dia[d][s]
        for d in p.dias
        for s in range(p.num_slots_dia(d))
    )
    demanda_total_h = demanda_slots * sd / 60.0
    capacidad_total_h = sum(_capacidad_max_horas_trabajador(t) for t in p.trabajadores)
    deficit_h = max(0.0, demanda_total_h - capacidad_total_h)

    # 1) Capacidad global insuficiente
    if deficit_h > 0.5:
        # ¿Cuanto se ampliaria si subimos las horquillas en +50%?
        capacidad_ampliada = sum(
            _capacidad_max_horas_trabajador(t) * (1.5 if t["contrato"]["tipo"] == "horquilla" else 1.1)
            for t in p.trabajadores
        )
        accion = (
            f"Amplía las horquillas o añade un trabajador (faltan ~{deficit_h:.0f}h). "
            f"Con horquillas +50% llegarías a {capacidad_ampliada:.0f}h totales."
            if capacidad_ampliada >= demanda_total_h
            else f"Añade al menos un trabajador (la plantilla actual no puede cubrir la demanda ni ampliando todas las horquillas; faltan ~{deficit_h:.0f}h)."
        )
        propuestas.append(Propuesta(
            severidad="critica",
            categoria="capacidad",
            titulo="Plantilla insuficiente para la demanda",
            mensaje=f"Demanda total: {demanda_total_h:.0f}h. Capacidad máxima de la plantilla: {capacidad_total_h:.0f}h. Faltan ~{deficit_h:.0f}h.",
            accion_sugerida=accion,
        ))

    # ----- Capacidad por dia con dias_libres aplicados -----
    for d in p.dias:
        demanda_dia_slots = sum(p.demanda_num_dia[d])
        demanda_dia_h = demanda_dia_slots * sd / 60.0
        # Cada trabajador disponible aporta como máximo 9h al dia.
        n_disponibles = sum(1 for t in p.trabajadores if _trabajador_disponible_dia(t, d))
        capacidad_dia_h = n_disponibles * 9.0
        if demanda_dia_h > capacidad_dia_h + 0.5:
            bloqueados = [t["nombre"] for t in p.trabajadores if not _trabajador_disponible_dia(t, d)]
            propuestas.append(Propuesta(
                severidad="alta",
                categoria="capacidad",
                titulo=f"{_dia_label(d).capitalize()}: capacidad diaria insuficiente",
                mensaje=(
                    f"El {_dia_label(d)} se necesitan {demanda_dia_h:.0f}h y solo "
                    f"{n_disponibles} trabajadores están disponibles ({capacidad_dia_h:.0f}h máx). "
                    f"Bloqueados por día libre: {', '.join(bloqueados) if bloqueados else 'ninguno'}."
                ),
                accion_sugerida=(
                    f"Libera el {_dia_label(d)} de algún trabajador con día libre fijo, "
                    f"o reduce la demanda de ese día."
                ) if bloqueados else
                f"Añade un trabajador con disponibilidad el {_dia_label(d)}.",
                afecta_dia=d,
            ))

    # ----- Cobertura por nivel jerarquico -----
    for d in p.dias:
        for nivel_idx, rol_min in enumerate(p.roles_jerarquia):
            # Demanda acumulada en este nivel o superior (suma jerárquica).
            n_disponibles_nivel = sum(
                1 for t in p.trabajadores
                if _trabajador_rol_indice(t, p.roles_jerarquia) >= nivel_idx
                and _trabajador_disponible_dia(t, d)
            )
            max_acumulado_demandado = max(
                (
                    sum(p.demanda_rol_dia[d][s].get(r, 0) for r in p.roles_jerarquia[nivel_idx:])
                    for s in range(p.num_slots_dia(d))
                ),
                default=0,
            )
            if max_acumulado_demandado > n_disponibles_nivel and nivel_idx > 0:
                propuestas.append(Propuesta(
                    severidad="alta",
                    categoria="rol",
                    titulo=f"Falta personal de rol {rol_min} o superior el {_dia_label(d)}",
                    mensaje=(
                        f"Se demanda hasta {max_acumulado_demandado} personas de rol "
                        f"{rol_min} o superior simultáneas, pero solo hay "
                        f"{n_disponibles_nivel} disponibles ese día."
                    ),
                    accion_sugerida=(
                        f"Promociona a un trabajador a rol {rol_min} o superior, "
                        f"o añade un nuevo trabajador en ese rol."
                    ),
                    afecta_dia=d,
                ))

    # ----- Cobertura por etiqueta -----
    etiquetas_requeridas = set()
    for d in p.dias:
        for s in range(p.num_slots_dia(d)):
            for e in p.etiquetas_dia[d][s]:
                etiquetas_requeridas.add(e)
    for e in etiquetas_requeridas:
        workers_con_etiqueta = [t["nombre"] for t in p.trabajadores if _trabajador_tiene_etiqueta(t, e)]
        if len(workers_con_etiqueta) == 0:
            propuestas.append(Propuesta(
                severidad="critica",
                categoria="etiqueta",
                titulo=f"Etiqueta «{e}» sin nadie capacitado",
                mensaje=f"Se requiere la etiqueta «{e}» en alguna franja pero ningún trabajador la tiene.",
                accion_sugerida=f"Capacita a algún trabajador en «{e}» o quita esa etiqueta de la franja.",
            ))
        elif len(workers_con_etiqueta) == 1:
            propuestas.append(Propuesta(
                severidad="media",
                categoria="etiqueta",
                titulo=f"Etiqueta «{e}» con solo un trabajador",
                mensaje=f"«{e}» la tiene solo {workers_con_etiqueta[0]} — punto único de fallo.",
                accion_sugerida=f"Capacita a un segundo trabajador en «{e}» para tener margen.",
                afecta_trabajador=workers_con_etiqueta[0],
            ))

    # ----- Restricciones individuales contradictorias -----
    for t in p.trabajadores:
        r = t.get("restricciones", {})
        dias_libres = set(r.get("dias_libres", []))

        # trabajar_obligatorio en un dia_libre
        for to in r.get("trabajar_obligatorio", []):
            if to["dia"] in dias_libres:
                propuestas.append(Propuesta(
                    severidad="critica",
                    categoria="restriccion",
                    titulo=f"{t['nombre']}: restricciones contradictorias",
                    mensaje=(
                        f"{t['nombre']} tiene el {_dia_label(to['dia'])} como día libre fijo "
                        f"y a la vez una ventana obligatoria {to['desde']}–{to['hasta']} ese día."
                    ),
                    accion_sugerida=f"Elimina una de las dos restricciones de {t['nombre']} para el {_dia_label(to['dia'])}.",
                    afecta_trabajador=t["nombre"],
                    afecta_dia=to["dia"],
                ))
            # ventana obligatoria contradicha por no_antes/no_despues
            desde_min = _hora_a_min(to["desde"])
            hasta_min = _hora_fin_a_min(to["hasta"])
            for na in r.get("no_antes_de", []):
                aplica = na["dias"] == "TODOS" or to["dia"] in (na["dias"] if isinstance(na["dias"], list) else [na["dias"]])
                if aplica and _hora_a_min(na["hora"]) > desde_min:
                    propuestas.append(Propuesta(
                        severidad="critica",
                        categoria="restriccion",
                        titulo=f"{t['nombre']}: ventana obligatoria choca con «no antes de»",
                        mensaje=(
                            f"{t['nombre']} debe trabajar desde las {to['desde']} el {_dia_label(to['dia'])} "
                            f"pero no puede empezar antes de las {na['hora']}."
                        ),
                        accion_sugerida=f"Ajusta la ventana obligatoria o la regla «no antes de» de {t['nombre']}.",
                        afecta_trabajador=t["nombre"],
                        afecta_dia=to["dia"],
                    ))
            for nd in r.get("no_despues_de", []):
                aplica = nd["dias"] == "TODOS" or to["dia"] in (nd["dias"] if isinstance(nd["dias"], list) else [nd["dias"]])
                if aplica and _hora_a_min(nd["hora"]) < hasta_min:
                    propuestas.append(Propuesta(
                        severidad="critica",
                        categoria="restriccion",
                        titulo=f"{t['nombre']}: ventana obligatoria choca con «no después de»",
                        mensaje=(
                            f"{t['nombre']} debe trabajar hasta las {to['hasta']} el {_dia_label(to['dia'])} "
                            f"pero no puede trabajar después de las {nd['hora']}."
                        ),
                        accion_sugerida=f"Ajusta la ventana obligatoria o la regla «no después de» de {t['nombre']}.",
                        afecta_trabajador=t["nombre"],
                        afecta_dia=to["dia"],
                    ))

        # Trabajador con todos los dias bloqueados
        if len(dias_libres) >= 6:
            propuestas.append(Propuesta(
                severidad="alta",
                categoria="restriccion",
                titulo=f"{t['nombre']}: casi sin días disponibles",
                mensaje=f"{t['nombre']} solo puede trabajar {7 - len(dias_libres)} día(s) a la semana.",
                accion_sugerida=f"Revisa los días libres de {t['nombre']} si su contrato es de muchas horas.",
                afecta_trabajador=t["nombre"],
            ))

    # ----- Horquillas demasiado estrechas vs contrato fijo -----
    for t in p.trabajadores:
        c = t["contrato"]
        if c["tipo"] == "horquilla":
            ancho = c["max_horas"] - c["min_horas"]
            # Si el deficit global existe y el max esta cerca del min, sugerir ampliar.
            if deficit_h > 0.5 and ancho < 16:
                propuestas.append(Propuesta(
                    severidad="media",
                    categoria="contrato",
                    titulo=f"{t['nombre']}: horquilla estrecha podría ampliarse",
                    mensaje=(
                        f"{t['nombre']} tiene horquilla {c['min_horas']}-{c['max_horas']}h "
                        f"({ancho}h de margen). Ampliar el techo daría aire al cuadrante."
                    ),
                    accion_sugerida=f"Sube el máximo de la horquilla de {t['nombre']} a {c['max_horas'] + 8}h.",
                    afecta_trabajador=t["nombre"],
                ))

    # ----- Huecos por dia/franja del solver actual (si vinieron) -----
    if huecos_por_slot:
        huecos_por_dia: Dict[str, int] = {}
        for (d, s), n in huecos_por_slot.items():
            huecos_por_dia[d] = huecos_por_dia.get(d, 0) + n
        top_dia = max(huecos_por_dia.items(), key=lambda x: x[1], default=None)
        if top_dia and top_dia[1] > 0:
            propuestas.append(Propuesta(
                severidad="media",
                categoria="capacidad",
                titulo=f"El {_dia_label(top_dia[0])} concentra la mayor parte de los huecos",
                mensaje=f"Quedan {top_dia[1]} slots-persona sin cubrir el {_dia_label(top_dia[0])}.",
                accion_sugerida=f"Aumenta la disponibilidad del {_dia_label(top_dia[0])} (libera días, sube horquilla de algún trabajador, o suaviza la demanda de ese día).",
                afecta_dia=top_dia[0],
            ))

    # Ordenar por severidad
    sev_order = {"critica": 0, "alta": 1, "media": 2, "baja": 3}
    propuestas.sort(key=lambda p_: sev_order.get(p_.severidad, 9))

    return Diagnostico(
        capacidad_total_h=round(capacidad_total_h, 1),
        demanda_total_h=round(demanda_total_h, 1),
        deficit_h=round(deficit_h, 1),
        propuestas=propuestas,
    )


# ---------------------------------------------------------------------------
# resolver_problema: orquestador publico
# ---------------------------------------------------------------------------

def resolver_problema(
    request: ScheduleRequest,
    seed: int | None = None,
) -> ScheduleResponse:
    """Carga el problema, construye el modelo, resuelve y serializa la
    respuesta. `seed` opcional aleatoriza la busqueda interna de CP-SAT
    para obtener una rotacion alternativa equivalente.

    Subfase 0.12: si el solver devuelve INFEASIBLE o si hay huecos
    estructurales (> 2% de la demanda), se añade un Diagnostico con
    propuestas accionables explicando los cuellos de botella.
    """
    problema = cargar_problema(request)
    model, vars_ = construir_modelo(problema)

    solver = cp_model.CpSolver()
    if seed is not None:
        solver.parameters.random_seed = seed
        solver.parameters.randomize_search = True
    if request.parametros.time_limit_seconds is not None:
        solver.parameters.max_time_in_seconds = (
            request.parametros.time_limit_seconds
        )

    status = solver.Solve(model)
    response = serializar_response(solver, status, problema, vars_, seed)

    # Subfase 0.12: añadir diagnóstico si procede.
    necesita_diagnostico = (
        response.estado in ("INFEASIBLE", "MODEL_INVALID", "UNKNOWN")
        or (
            response.slots_persona_demanda > 0
            and response.slots_persona_huecos / response.slots_persona_demanda > 0.02
        )
    )
    if necesita_diagnostico:
        # Si tenemos solución parcial, extraemos los huecos slot-a-slot para
        # enriquecer el análisis.
        huecos_por_slot: dict = {}
        if response.estado not in ("INFEASIBLE", "MODEL_INVALID"):
            for h in response.huecos_cobertura:
                huecos_por_slot[(h.dia, h.inicio)] = h.falta_personas
        response.diagnostico = diagnosticar_infactibilidad(problema, huecos_por_slot)

    return response


# ---------------------------------------------------------------------------
# request_desde_data_py: helper para el script CLI
# ---------------------------------------------------------------------------

def request_desde_data_py(
    seed: int | None = None,
    time_limit_seconds: float | None = 60.0,
) -> ScheduleRequest:
    """Construye un ScheduleRequest a partir de los datos de `data.py` (los
    8 trabajadores y la demanda fielmente al PDF). Lo usa el script CLI."""
    import data
    from schemas import (
        Contrato, FranjaEti, FranjaNum, FranjaRol,
        NoAntesDeRegla, NoDespuesDeRegla, Restricciones, Trabajador,
        TrabajarObligatorioRegla,
    )

    trabajadores = []
    for t in data.TRABAJADORES:
        c = t["contrato"]
        if c["tipo"] == "fijo":
            contrato = Contrato(tipo="fijo", horas=c["horas"])
        else:
            contrato = Contrato(
                tipo="horquilla",
                min_horas=c["min_horas"],
                max_horas=c["max_horas"],
            )
        r = t.get("restricciones", {})
        restricciones = Restricciones(
            dias_libres=list(r.get("dias_libres", [])),
            no_antes_de=[
                NoAntesDeRegla(hora=x["hora"], dias=x["dias"])
                for x in r.get("no_antes_de", [])
            ],
            no_despues_de=[
                NoDespuesDeRegla(hora=x["hora"], dias=x["dias"])
                for x in r.get("no_despues_de", [])
            ],
            trabajar_obligatorio=[
                TrabajarObligatorioRegla(
                    dia=x["dia"], desde=x["desde"], hasta=x["hasta"],
                )
                for x in r.get("trabajar_obligatorio", [])
            ],
            texto_pdf=r.get("_texto_pdf"),
        )
        trabajadores.append(Trabajador(
            nombre=t["nombre"],
            contrato=contrato,
            rol=t["rol"],
            etiquetas=list(t["etiquetas"]),
            restricciones=restricciones,
        ))

    franjas_num = {
        d: [FranjaNum(inicio=ini, fin=fin, personas=p)
            for ini, fin, p in data.FRANJAS_NUM_DIA[d]]
        for d in data.DIAS
    }
    franjas_rol = {
        d: [FranjaRol(inicio=ini, fin=fin, personas_por_rol=dict(pr))
            for ini, fin, pr in data.FRANJAS_ROL_DIA[d]]
        for d in data.DIAS
    }
    franjas_eti = {
        d: [FranjaEti(inicio=ini, fin=fin, etiquetas=list(et))
            for ini, fin, et in data.FRANJAS_ETI_DIA[d]]
        for d in data.DIAS
    }

    return ScheduleRequest(
        dias=list(data.DIAS),
        roles_jerarquia=list(data.ROLES_JERARQUIA),
        etiquetas=list(data.ETIQUETAS),
        slot_duracion_min=data.SLOT_DURACION_MIN,
        horario_apertura={
            d: HorarioApertura(apertura=ap, cierre=ci)
            for d, (ap, ci) in data.HORARIO_APERTURA.items()
        },
        trabajadores=trabajadores,
        franjas_num=franjas_num,
        franjas_rol=franjas_rol,
        franjas_eti=franjas_eti,
        parametros=Parametros(
            seed=seed, time_limit_seconds=time_limit_seconds,
        ),
    )
