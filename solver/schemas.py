"""
SHIFT SOLVER AI - Esquemas Pydantic del contrato JSON
=====================================================
Define la entrada (`ScheduleRequest`) y la salida (`ScheduleResponse`) del
endpoint POST /solve. Es el CONTRATO ESTABLE entre el servicio solver y la
aplicacion web (Fase 3 en adelante).

Diseño:
  - Los datos de entrada espejan fielmente los de `data.py`: dias, horario
    de apertura, trabajadores, franjas de demanda numerica/rol/etiqueta,
    parametros del solver. Asi la conversion data.py -> request es trivial.
  - La salida es "human friendly": horarios en formato HH:MM (ya legibles
    por la web), tramos agrupados por trabajador, huecos detallados.

Decisiones de modelado:
  - Las franjas se envian como listas de objetos (no tuplas) para que sean
    autodescriptivas en JSON y faciles de leer.
  - El campo `restricciones` permite sub-claves opcionales (mismo patron
    que en data.py); ausencia equivale a "ninguna restriccion".
  - `seed` es opcional: sin seed -> resolucion determinista (siempre la
    misma rotacion); con seed -> rotacion alternativa equivalente.
"""

from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Entrada (ScheduleRequest)
# ---------------------------------------------------------------------------

class HorarioApertura(BaseModel):
    """Horario de apertura del restaurante para un dia concreto."""
    apertura: str  # "HH:MM" - hora de apertura del local
    cierre: str    # "HH:MM" - hora de cierre. Usar "00:00" para medianoche.


class Contrato(BaseModel):
    """Contrato del trabajador. Solo uno de los dos formatos a la vez."""
    tipo: Literal["fijo", "horquilla"]
    # Si tipo == "fijo": cuantas horas semanales exactas tiene el contrato.
    horas: Optional[int] = None
    # Si tipo == "horquilla": rango de horas semanales [min, max].
    min_horas: Optional[int] = None
    max_horas: Optional[int] = None


class NoAntesDeRegla(BaseModel):
    """No puede empezar a trabajar antes de cierta hora en los dias dados."""
    hora: str  # "HH:MM"
    dias: Union[Literal["TODOS"], List[str]]


class NoDespuesDeRegla(BaseModel):
    """No puede trabajar mas tarde de cierta hora en los dias dados."""
    hora: str  # "HH:MM"
    dias: Union[Literal["TODOS"], List[str]]


class TrabajarObligatorioRegla(BaseModel):
    """Debe trabajar al menos un slot dentro de la ventana en el dia dado."""
    dia: str
    desde: str  # "HH:MM"
    hasta: str  # "HH:MM"


class Restricciones(BaseModel):
    """Restricciones individuales del trabajador (todas opcionales)."""
    dias_libres: List[str] = Field(default_factory=list)
    no_antes_de: List[NoAntesDeRegla] = Field(default_factory=list)
    no_despues_de: List[NoDespuesDeRegla] = Field(default_factory=list)
    trabajar_obligatorio: List[TrabajarObligatorioRegla] = Field(
        default_factory=list
    )
    # Texto literal del PDF u otra fuente, opcional - util para diagnostico.
    texto_pdf: Optional[str] = None


class Trabajador(BaseModel):
    nombre: str
    contrato: Contrato
    rol: str
    etiquetas: List[str] = Field(default_factory=list)
    restricciones: Restricciones = Field(default_factory=Restricciones)


class FranjaNum(BaseModel):
    """Demanda numerica para una franja [inicio, fin) de un dia."""
    inicio: str    # "HH:MM"
    fin: str       # "HH:MM" - usar "00:00" para medianoche.
    personas: int


class FranjaRol(BaseModel):
    """Demanda por rol para una franja [inicio, fin) de un dia.
    El dict mapea rol -> cantidad. La suma debe coincidir con la demanda
    numerica total para el mismo intervalo (sanity check del solver)."""
    inicio: str
    fin: str
    personas_por_rol: Dict[str, int]


class FranjaEti(BaseModel):
    """Etiquetas requeridas para una franja [inicio, fin) de un dia.
    La lectura aplicada es DISYUNCION: basta con que UNA persona del slot
    tenga ALGUNA de las etiquetas listadas."""
    inicio: str
    fin: str
    etiquetas: List[str]


class Parametros(BaseModel):
    """Parametros opcionales del solver."""
    # Si se da, se aleatoriza la busqueda interna de CP-SAT y se obtiene
    # una rotacion distinta (igualmente optima).
    seed: Optional[int] = None
    # Tope de tiempo de calculo en segundos. None -> sin tope (usar con cuidado).
    time_limit_seconds: Optional[float] = 60.0


class ScheduleRequest(BaseModel):
    """Entrada del endpoint POST /solve."""
    dias: List[str]
    roles_jerarquia: List[str]   # de menor a mayor (CB, SEMI, ENC, DUE)
    etiquetas: List[str]         # catalogo de etiquetas validas
    slot_duracion_min: int = 30
    horario_apertura: Dict[str, HorarioApertura]
    trabajadores: List[Trabajador]
    franjas_num: Dict[str, List[FranjaNum]]
    franjas_rol: Dict[str, List[FranjaRol]]
    franjas_eti: Dict[str, List[FranjaEti]]
    parametros: Parametros = Field(default_factory=Parametros)


# ---------------------------------------------------------------------------
# Salida (ScheduleResponse)
# ---------------------------------------------------------------------------

class TramoDia(BaseModel):
    """Un tramo trabajado dentro de un dia."""
    inicio: str          # "HH:MM"
    fin: str             # "HH:MM"
    duracion_horas: float


class JornadaDia(BaseModel):
    """La jornada de un trabajador en un dia concreto."""
    dia: str
    tipo: Literal["descanso", "continuada", "partida"]
    tramos: List[TramoDia] = Field(default_factory=list)
    horas: float
    # True si el dia es continuada > 5 h y por tanto el restaurante debe
    # asignar internamente la pausa legal de 20 min (PDF, punto 5).
    requiere_pausa_20min: bool = False


class CuadranteTrabajador(BaseModel):
    nombre: str
    rol: str
    contrato_rango_horas: str    # "40-44", "34", "12-28"
    horas_semana: float
    jornadas: List[JornadaDia]


class HuecoCobertura(BaseModel):
    """Slot que ha quedado sin cubrir (cobertura blanda - subfase 0.7)."""
    dia: str
    inicio: str
    fin: str
    demanda_total: int
    cubierto: int
    falta_personas: int
    # Detalle por nivel jerarquico: {rol_minimo: cantidad_faltante_de_ese_rol_o_superior}.
    falta_por_nivel: Dict[str, int]


class HuecoEtiqueta(BaseModel):
    """Slot que tenia etiquetas requeridas y ninguna persona asignada las
    tenia (sub-fase 0.8). En la practica no deberia ocurrir si la plantilla
    cubre todas las etiquetas."""
    dia: str
    inicio: str
    fin: str
    etiquetas_requeridas: List[str]
    asignados: List[str]    # nombres de los trabajadores asignados al slot


class GapEntreJornadas(BaseModel):
    """Distancia (en horas) entre el final de la jornada de un dia y el
    inicio del dia siguiente (ciclico). Debe ser >= 12 h."""
    trabajador: str
    cruce: str             # "LUN>MAR", ..., "DOM>LUN"
    gap_horas: Optional[float] = None    # None si descansa uno de los dos dias


class PausaObligatoria(BaseModel):
    """Tramo continuado > 5 h que requiere pausa interna de 20 min."""
    trabajador: str
    dia: str
    inicio: str
    fin: str
    duracion_horas: float


class Metricas(BaseModel):
    total_continuadas: int
    total_partidas: int
    dispersion_partidas: int   # max - min entre trabajadores
    partidas_por_trabajador: Dict[str, int]


class Propuesta(BaseModel):
    """Propuesta de cambio para resolver una infactibilidad detectada
    (subfase 0.12). Cada propuesta describe un cuello de botella concreto
    y sugiere una accion clara que el usuario puede ejecutar en la web."""
    severidad: Literal["critica", "alta", "media", "baja"]
    categoria: Literal["capacidad", "rol", "etiqueta", "restriccion", "contrato"]
    titulo: str
    mensaje: str
    accion_sugerida: str
    afecta_trabajador: Optional[str] = None
    afecta_dia: Optional[str] = None


class Diagnostico(BaseModel):
    """Diagnostico del cuadrante cuando es INFEASIBLE o tiene muchos huecos.
    Contiene KPIs globales de capacidad y una lista de propuestas accionables
    ordenadas por severidad."""
    capacidad_total_h: float
    demanda_total_h: float
    deficit_h: float
    propuestas: List[Propuesta] = Field(default_factory=list)


class ScheduleResponse(BaseModel):
    """Salida del endpoint POST /solve."""
    estado: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"]
    tiempo_calculo_segundos: float
    seed_usado: Optional[int] = None
    # Cobertura agregada.
    slots_persona_demanda: int
    slots_persona_asignados: int
    slots_persona_huecos: int        # personas faltantes efectivas (max sobre niveles)
    horas_persona_demanda: float
    horas_persona_asignadas: float
    horas_persona_huecos: float
    # Cuadrante por trabajador.
    cuadrante: List[CuadranteTrabajador]
    # Huecos detectados (vacios si la cobertura es exacta).
    huecos_cobertura: List[HuecoCobertura] = Field(default_factory=list)
    huecos_etiqueta: List[HuecoEtiqueta] = Field(default_factory=list)
    # Metricas del objetivo blando (subfase 0.11).
    metricas: Metricas
    # Verificaciones post-hoc (las hace el solver para que la web no tenga
    # que recalcular).
    gaps_entre_jornadas: List[GapEntreJornadas] = Field(default_factory=list)
    pausas_obligatorias: List[PausaObligatoria] = Field(default_factory=list)
    # Diagnostico de infactibilidad (subfase 0.12). Solo se rellena cuando
    # el solver no encuentra solucion o devuelve un cuadrante con huecos
    # estructurales relevantes. Si todo va bien, queda en None.
    diagnostico: Optional[Diagnostico] = None
