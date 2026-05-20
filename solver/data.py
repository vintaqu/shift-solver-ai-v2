"""
SHIFT SOLVER AI - Datos del problema
====================================
Fuente unica de verdad: docs/SHIFT SOLVER AI (PLANTEAMIENTO DEL PROBLEMA).pdf

Este modulo contiene los datos hardcodeados:
  - Constantes generales (dias, roles, etiquetas).
  - Horario de apertura del restaurante por dia.
  - Helpers para convertir entre horas en formato 'HH:MM' y slots de 30 min,
    helpers de timestamp absoluto desde lunes 00:00 (para 0.4) y helpers de
    contrato (slots semanales por trabajador segun su contrato, para 0.3).
  - Los 8 trabajadores de la plantilla (fielmente al PDF, con sus contratos,
    rol, etiquetas y restricciones individuales estructuradas para 0.6).
  - DEMANDA_NUM_DIA: demanda numerica por slot de cada dia (0.2).
  - DEMANDA_ROL_DIA: desglose por rol del PDF (0.7) - sanity check de
    coherencia con DEMANDA_NUM_DIA al cargar el modulo.
  - ETIQUETAS_DIA: etiquetas requeridas por slot (0.8) - sanity check de
    que cada etiqueta listada esta en ETIQUETAS.
"""

# ---------------------------------------------------------------------------
# Constantes generales
# ---------------------------------------------------------------------------

DIAS = [
    "LUNES", "MARTES", "MIERCOLES", "JUEVES",
    "VIERNES", "SABADO", "DOMINGO",
]

# Roles jerarquicos acumulativos: un nivel superior puede ejercer cualquiera
# de los inferiores.
# (PDF, seccion TRABAJADORES > ROLES:
#  "CAMARERO BASICO < SEMI-ENCARGADO < ENCARGADO < DUENO")
ROLES_JERARQUIA = ["CAMARERO_BASICO", "SEMI_ENCARGADO", "ENCARGADO", "DUENO"]

# Etiquetas independientes (PDF, seccion TRABAJADORES > ETIQUETAS).
ETIQUETAS = [
    "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
    "PLANCHISTA", "COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE",
]

# Cada slot dura 30 minutos. (PDF: "intervalos (slots) de 30 minutos").
SLOT_DURACION_MIN = 30
SLOTS_POR_HORA = 60 // SLOT_DURACION_MIN  # = 2


# ---------------------------------------------------------------------------
# Horario de apertura por dia
# (PDF, seccion NECESIDADES DEL RESTAURANTE > Horario de apertura y cierre)
# ---------------------------------------------------------------------------

HORARIO_APERTURA = {
    "LUNES":     ("06:00", "00:00"),
    "MARTES":    ("06:00", "00:00"),
    "MIERCOLES": ("06:00", "00:00"),
    "JUEVES":    ("06:00", "00:00"),
    "VIERNES":   ("06:00", "00:00"),
    "SABADO":    ("06:30", "00:00"),
    "DOMINGO":   ("06:30", "00:00"),
}


# ---------------------------------------------------------------------------
# Helpers de tiempo / slots
# ---------------------------------------------------------------------------

def hora_a_minutos(hora_str):
    """Convierte 'HH:MM' a minutos desde 00:00 del mismo dia."""
    h, m = map(int, hora_str.split(":"))
    return h * 60 + m


def hora_fin_a_minutos(hora_str):
    """Como hora_a_minutos, pero '00:00' representa medianoche del dia
    siguiente (1440 min). Se usa para los limites finales de franja."""
    if hora_str == "00:00":
        return 24 * 60
    return hora_a_minutos(hora_str)


def _min_a_hora(total_min):
    """Inversa de hora_a_minutos. 1440 -> '00:00' (medianoche del dia siguiente)."""
    if total_min == 24 * 60:
        return "00:00"
    h, m = divmod(total_min, 60)
    return f"{h:02d}:{m:02d}"


def num_slots_dia(dia):
    """Numero de slots de 30 min del dia (segun horario de apertura)."""
    apertura, cierre = HORARIO_APERTURA[dia]
    return (hora_fin_a_minutos(cierre) - hora_a_minutos(apertura)) // SLOT_DURACION_MIN


def slot_a_horario(dia, slot_idx):
    """Devuelve (inicio_str, fin_str) del slot dado dentro del dia."""
    apertura, _ = HORARIO_APERTURA[dia]
    inicio_min = hora_a_minutos(apertura) + slot_idx * SLOT_DURACION_MIN
    fin_min = inicio_min + SLOT_DURACION_MIN
    return (_min_a_hora(inicio_min), _min_a_hora(fin_min))


def minuto_inicio_dia(dia):
    """Minutos desde el comienzo de la semana (lunes 00:00) hasta las 00:00 del dia."""
    return DIAS.index(dia) * 24 * 60


def timestamp_slot_inicio(dia, s):
    """Minutos desde lunes 00:00 hasta el INICIO del slot s del dia."""
    return (
        minuto_inicio_dia(dia)
        + hora_a_minutos(HORARIO_APERTURA[dia][0])
        + s * SLOT_DURACION_MIN
    )


def timestamp_slot_fin(dia, s):
    """Minutos desde lunes 00:00 hasta el FIN del slot s del dia."""
    return timestamp_slot_inicio(dia, s) + SLOT_DURACION_MIN


def expandir_franjas_a_slots(dia, franjas):
    """
    Expande franjas (inicio, fin, demanda) a una lista demanda[s] = nº personas
    para cada slot del dia. La franja [inicio, fin) cubre todos los slots cuyo
    inicio cae en ese intervalo.
    """
    apertura_min = hora_a_minutos(HORARIO_APERTURA[dia][0])
    n = num_slots_dia(dia)
    demanda = [0] * n
    for inicio, fin, dem in franjas:
        s_ini = (hora_a_minutos(inicio) - apertura_min) // SLOT_DURACION_MIN
        s_fin = (hora_fin_a_minutos(fin) - apertura_min) // SLOT_DURACION_MIN
        for s in range(s_ini, s_fin):
            demanda[s] = dem
    return demanda


def expandir_franjas_rol_a_slots(dia, franjas):
    """
    Como expandir_franjas_a_slots pero cada franja lleva un dict {rol: cantidad}
    en lugar de un entero. Devuelve una lista de dicts (uno por slot) con la
    demanda desglosada por rol.
    """
    apertura_min = hora_a_minutos(HORARIO_APERTURA[dia][0])
    n = num_slots_dia(dia)
    demanda = [{} for _ in range(n)]
    for inicio, fin, dem_rol in franjas:
        s_ini = (hora_a_minutos(inicio) - apertura_min) // SLOT_DURACION_MIN
        s_fin = (hora_fin_a_minutos(fin) - apertura_min) // SLOT_DURACION_MIN
        for s in range(s_ini, s_fin):
            demanda[s] = dict(dem_rol)
    return demanda


def expandir_franjas_eti_a_slots(dia, franjas):
    """
    Como expandir_franjas_a_slots pero cada franja lleva una LISTA de etiquetas
    (las que dan cumplimiento al requisito por disyuncion: basta una persona
    del slot con cualquiera de ellas). Devuelve una lista de listas, una por slot.
    """
    apertura_min = hora_a_minutos(HORARIO_APERTURA[dia][0])
    n = num_slots_dia(dia)
    demanda = [[] for _ in range(n)]
    for inicio, fin, etiquetas in franjas:
        s_ini = (hora_a_minutos(inicio) - apertura_min) // SLOT_DURACION_MIN
        s_fin = (hora_fin_a_minutos(fin) - apertura_min) // SLOT_DURACION_MIN
        for s in range(s_ini, s_fin):
            demanda[s] = list(etiquetas)
    return demanda


# ---------------------------------------------------------------------------
# Helpers de contrato (Fase 0.3)
# ---------------------------------------------------------------------------

def slots_semanales_contrato(trabajador):
    """
    Devuelve (slots_min, slots_max) que el trabajador debe trabajar en la
    semana, segun su contrato y el COMPUTO SEMANAL puro (CONTEXT.md, seccion
    Arquitectura: "Empezamos con horizonte semanal").

    Reglas (PDF, "Habra condiciones y restricciones diferentes para cada
    trabajador. > 1. Horas semanales por contrato"):

    - "fijo" 40h: pueden subir hasta 44h en computo semanal puro pero NO
      pueden bajar. Rango [40, 44] h -> [80, 88] slots.
    - "fijo" no-40h (MAYTE 34h): el PDF solo describe flexibilidad explicita
      para los de 40h. Tratamos los fijos no-40h como horas exactas.
    - "horquilla" [a, b]: el minimo es obligatorio, el maximo de la horquilla
      acota arriba. Rango [a, b] h -> [2a, 2b] slots.
    """
    c = trabajador["contrato"]
    if c["tipo"] == "fijo":
        h = c["horas"]
        if h == 40:
            return (40 * SLOTS_POR_HORA, 44 * SLOTS_POR_HORA)
        return (h * SLOTS_POR_HORA, h * SLOTS_POR_HORA)
    # horquilla
    return (c["min_horas"] * SLOTS_POR_HORA, c["max_horas"] * SLOTS_POR_HORA)


def rango_horas_contrato_str(trabajador):
    """Texto compacto del rango efectivo: '40-44', '34', '12-28'."""
    s_min, s_max = slots_semanales_contrato(trabajador)
    h_min = s_min // SLOTS_POR_HORA
    h_max = s_max // SLOTS_POR_HORA
    return f"{h_min}" if h_min == h_max else f"{h_min}-{h_max}"


# ---------------------------------------------------------------------------
# Trabajadores
# (PDF, seccion TRABAJADORES, los 8 trabajadores)
# ---------------------------------------------------------------------------
#
# Estructura del contrato:
#   - {"tipo": "fijo", "horas": N}            -> contrato de N h/semana exactas
#   - {"tipo": "horquilla", "min_horas": A,
#                           "max_horas": B}   -> horquilla [A, B] h/semana,
#                                                A es obligatorio, [A..B] flex
#
# El campo `restricciones` queda como dict descriptivo. En la subfase 0.6 se
# traduciran los textos del PDF a reglas estructuradas que el solver pueda
# consumir directamente.

TRABAJADORES = [
    {
        "nombre": "EDGAR",
        "contrato": {"tipo": "horquilla", "min_horas": 12, "max_horas": 28},
        "rol": "DUENO",
        "etiquetas": ["CAJERA", "BANDEJERA", "COMANDERA", "BARRA", "DELIVERY"],
        "restricciones": {
            "_texto_pdf": (
                "Sabado y Domingo como dias de descanso. No puede trabajar "
                "antes de las 08:00h ni mas tarde de las 18:00h. Puede "
                "descansar mas dias entre semana si el calculo lo favorece. "
                "No trabaja partido, solo seguido."
            ),
            "dias_libres": ["SABADO", "DOMINGO"],
            "no_antes_de": [{"hora": "08:00", "dias": "TODOS"}],
            "no_despues_de": [{"hora": "18:00", "dias": "TODOS"}],
            # "solo_continuado": True  -> se modela en la subfase 0.9
            # cuando se introduzca el concepto de tramo.
        },
    },
    {
        "nombre": "SARA",
        "contrato": {"tipo": "fijo", "horas": 40},
        "rol": "ENCARGADO",
        "etiquetas": [
            "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
            "PLANCHISTA", "COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE",
        ],
        "restricciones": {
            "_texto_pdf": (
                "Domingo como dia de descanso. Jueves tiene que trabajar en "
                "algun momento entre las 11:00h y las 13:00h obligatoriamente."
            ),
            "dias_libres": ["DOMINGO"],
            "trabajar_obligatorio": [
                {"dia": "JUEVES", "desde": "11:00", "hasta": "13:00"},
            ],
        },
    },
    {
        "nombre": "MILAGROS",
        "contrato": {"tipo": "fijo", "horas": 40},
        "rol": "SEMI_ENCARGADO",
        "etiquetas": [
            "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
            "COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE",
        ],
        "restricciones": {"_texto_pdf": "Ninguna."},
    },
    {
        "nombre": "DANA",
        "contrato": {"tipo": "fijo", "horas": 40},
        "rol": "SEMI_ENCARGADO",
        "etiquetas": [
            "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
            "COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE",
        ],
        "restricciones": {"_texto_pdf": "Ninguna."},
    },
    {
        "nombre": "YULI",
        "contrato": {"tipo": "fijo", "horas": 40},
        "rol": "CAMARERO_BASICO",
        "etiquetas": [
            "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
            "COMANDERA", "BARRA", "CIERRE",
        ],
        "restricciones": {"_texto_pdf": "Ninguna."},
    },
    {
        "nombre": "ANASTASIA",
        "contrato": {"tipo": "fijo", "horas": 40},
        "rol": "CAMARERO_BASICO",
        "etiquetas": [
            "PASTAS", "APERTURA", "CAJERA", "BARISTA", "BANDEJERA",
            "COMANDERA", "BARRA", "CIERRE",
        ],
        "restricciones": {"_texto_pdf": "Ninguna."},
    },
    {
        "nombre": "MAYTE",
        "contrato": {"tipo": "fijo", "horas": 34},
        "rol": "CAMARERO_BASICO",
        "etiquetas": [
            "APERTURA", "CAJERA", "BARISTA", "BANDEJERA", "COMANDERA", "BARRA",
        ],
        "restricciones": {
            "_texto_pdf": (
                "De DOMINGO a JUEVES no puede trabajar mas tarde de las 22:00h. "
                "De LUNES a DOMINGO no puede trabajar antes de las 07:00h."
            ),
            "no_antes_de": [{"hora": "07:00", "dias": "TODOS"}],
            "no_despues_de": [{
                "hora": "22:00",
                "dias": ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES"],
            }],
        },
    },
    {
        "nombre": "JOSE",
        "contrato": {"tipo": "horquilla", "min_horas": 12, "max_horas": 28},
        "rol": "CAMARERO_BASICO",
        "etiquetas": [
            "CAJERA", "BARISTA", "BANDEJERA", "PLANCHISTA",
            "COMANDERA", "BARRA", "CIERRE",
        ],
        "restricciones": {
            "_texto_pdf": (
                "DOMINGO no puede trabajar mas tarde de las 22:00h. "
                "LUNES a JUEVES no puede trabajar. "
                "De LUNES a DOMINGO no puede trabajar antes de las 07:00h."
            ),
            "dias_libres": ["LUNES", "MARTES", "MIERCOLES", "JUEVES"],
            "no_antes_de": [{"hora": "07:00", "dias": "TODOS"}],
            "no_despues_de": [{"hora": "22:00", "dias": ["DOMINGO"]}],
        },
    },
]


# ---------------------------------------------------------------------------
# Necesidades del restaurante - solo cobertura numerica (Fase 0.2)
# (PDF, tabla "NUMERO EXACTO DE PERSONAS NECESARIAS", una tabla por bloque
#  de dias: LMXJ comparten / VIERNES / SABADO / DOMINGO).
# ---------------------------------------------------------------------------
#
# Los desgloses por rol y etiqueta de los slots se anadiran en las subfases
# 0.7 y 0.8 respectivamente.

# Franjas en formato (inicio, fin, n_personas) tal y como aparecen en el PDF.

# LUNES, MARTES, MIERCOLES y JUEVES comparten la misma tabla numerica.
FRANJAS_LMXJ_NUM = [
    ("06:00", "06:30", 1),
    ("06:30", "07:00", 1),
    ("07:00", "08:00", 2),
    ("08:00", "09:30", 3),
    ("09:30", "12:00", 3),
    ("12:00", "12:30", 3),
    ("12:30", "13:00", 2),
    ("13:00", "14:00", 2),
    ("14:00", "16:00", 2),
    ("16:00", "16:30", 2),
    ("16:30", "17:00", 2),
    ("17:00", "18:00", 2),
    ("18:00", "18:30", 2),
    ("18:30", "20:00", 2),
    ("20:00", "22:00", 2),
    ("22:00", "00:00", 2),
]

# VIERNES: identico a LMXJ hasta las 18:00; mas demanda de 18:00 a 00:00.
FRANJAS_VIERNES_NUM = [
    ("06:00", "06:30", 1),
    ("06:30", "07:00", 1),
    ("07:00", "08:00", 2),
    ("08:00", "09:30", 3),
    ("09:30", "12:00", 3),
    ("12:00", "12:30", 3),
    ("12:30", "13:00", 2),
    ("13:00", "14:00", 2),
    ("14:00", "16:00", 2),
    ("16:00", "16:30", 2),
    ("16:30", "17:00", 2),
    ("17:00", "18:00", 2),
    ("18:00", "18:30", 3),
    ("18:30", "20:00", 3),
    ("20:00", "22:00", 4),
    ("22:00", "00:00", 4),
]

# SABADO: apertura a las 06:30. Mas demanda de manana y noche que LMXJ.
FRANJAS_SABADO_NUM = [
    ("06:30", "07:30", 1),
    ("07:30", "08:00", 2),
    ("08:00", "09:30", 3),
    ("09:30", "12:00", 4),
    ("12:00", "12:30", 4),
    ("12:30", "13:00", 2),
    ("13:00", "14:00", 2),
    ("14:00", "16:00", 2),
    ("16:00", "16:30", 2),
    ("16:30", "17:00", 2),
    ("17:00", "18:00", 2),
    ("18:00", "18:30", 3),
    ("18:30", "20:00", 3),
    ("20:00", "22:00", 4),
    ("22:00", "00:00", 4),
]

# DOMINGO: apertura a las 06:30. Manana como SABADO; tarde/noche como LMXJ.
FRANJAS_DOMINGO_NUM = [
    ("06:30", "07:30", 1),
    ("07:30", "08:00", 2),
    ("08:00", "09:30", 3),
    ("09:30", "12:00", 4),
    ("12:00", "12:30", 4),
    ("12:30", "13:00", 2),
    ("13:00", "14:00", 2),
    ("14:00", "16:00", 2),
    ("16:00", "16:30", 2),
    ("16:30", "17:00", 2),
    ("17:00", "18:00", 2),
    ("18:00", "18:30", 2),
    ("18:30", "20:00", 2),
    ("20:00", "22:00", 2),
    ("22:00", "00:00", 2),
]

# Vector demanda[s] = personas requeridas en el slot s, para cada dia.
DEMANDA_NUM_DIA = {
    "LUNES":     expandir_franjas_a_slots("LUNES",     FRANJAS_LMXJ_NUM),
    "MARTES":    expandir_franjas_a_slots("MARTES",    FRANJAS_LMXJ_NUM),
    "MIERCOLES": expandir_franjas_a_slots("MIERCOLES", FRANJAS_LMXJ_NUM),
    "JUEVES":    expandir_franjas_a_slots("JUEVES",    FRANJAS_LMXJ_NUM),
    "VIERNES":   expandir_franjas_a_slots("VIERNES",   FRANJAS_VIERNES_NUM),
    "SABADO":    expandir_franjas_a_slots("SABADO",    FRANJAS_SABADO_NUM),
    "DOMINGO":   expandir_franjas_a_slots("DOMINGO",   FRANJAS_DOMINGO_NUM),
}


# ---------------------------------------------------------------------------
# Necesidades del restaurante - desglose por ROL (Fase 0.7)
# (PDF, tabla "NUMERO EXACTO DE PERSONAS NECESARIAS POR ROL")
# ---------------------------------------------------------------------------
#
# Por la jerarquia acumulativa, "demanda CB=2 + SEMI=1" significa que entre
# las 3 personas asignadas debe haber al menos 1 con rol >= SEMI_ENCARGADO.
# Las restricciones del solver lo imponen como acumulado por nivel.

# LMXJ comparten tabla de roles.
FRANJAS_LMXJ_ROL = [
    ("06:00", "06:30", {"CAMARERO_BASICO": 1}),
    ("06:30", "07:00", {"CAMARERO_BASICO": 1}),
    ("07:00", "08:00", {"CAMARERO_BASICO": 2}),
    ("08:00", "09:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("09:30", "12:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("12:00", "12:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("12:30", "13:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("13:00", "14:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("14:00", "16:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:00", "16:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:30", "17:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("17:00", "18:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:00", "18:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:30", "20:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("20:00", "22:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("22:00", "00:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
]

# VIERNES: igual que LMXJ hasta 18:00; aparece ENC en la franja 20:00-00:00.
FRANJAS_VIERNES_ROL = [
    ("06:00", "06:30", {"CAMARERO_BASICO": 1}),
    ("06:30", "07:00", {"CAMARERO_BASICO": 1}),
    ("07:00", "08:00", {"CAMARERO_BASICO": 2}),
    ("08:00", "09:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("09:30", "12:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("12:00", "12:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("12:30", "13:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("13:00", "14:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("14:00", "16:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:00", "16:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:30", "17:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("17:00", "18:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:00", "18:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("18:30", "20:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("20:00", "22:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1, "ENCARGADO": 1}),
    ("22:00", "00:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1, "ENCARGADO": 1}),
]

# SABADO: apertura 06:30, ENC en franja nocturna como VIE.
FRANJAS_SABADO_ROL = [
    ("06:30", "07:30", {"CAMARERO_BASICO": 1}),
    ("07:30", "08:00", {"CAMARERO_BASICO": 2}),
    ("08:00", "09:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("09:30", "12:00", {"CAMARERO_BASICO": 3, "SEMI_ENCARGADO": 1}),
    ("12:00", "12:30", {"CAMARERO_BASICO": 3, "SEMI_ENCARGADO": 1}),
    ("12:30", "13:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("13:00", "14:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("14:00", "16:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:00", "16:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:30", "17:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("17:00", "18:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:00", "18:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("18:30", "20:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("20:00", "22:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1, "ENCARGADO": 1}),
    ("22:00", "00:00", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1, "ENCARGADO": 1}),
]

# DOMINGO: apertura 06:30, sin demanda de ENC (mas tranquilo).
FRANJAS_DOMINGO_ROL = [
    ("06:30", "07:30", {"CAMARERO_BASICO": 1}),
    ("07:30", "08:00", {"CAMARERO_BASICO": 2}),
    ("08:00", "09:30", {"CAMARERO_BASICO": 2, "SEMI_ENCARGADO": 1}),
    ("09:30", "12:00", {"CAMARERO_BASICO": 3, "SEMI_ENCARGADO": 1}),
    ("12:00", "12:30", {"CAMARERO_BASICO": 3, "SEMI_ENCARGADO": 1}),
    ("12:30", "13:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("13:00", "14:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("14:00", "16:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:00", "16:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("16:30", "17:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("17:00", "18:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:00", "18:30", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("18:30", "20:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("20:00", "22:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
    ("22:00", "00:00", {"CAMARERO_BASICO": 1, "SEMI_ENCARGADO": 1}),
]

# Por dia, lista de dicts {rol: cantidad}, una por slot.
DEMANDA_ROL_DIA = {
    "LUNES":     expandir_franjas_rol_a_slots("LUNES",     FRANJAS_LMXJ_ROL),
    "MARTES":    expandir_franjas_rol_a_slots("MARTES",    FRANJAS_LMXJ_ROL),
    "MIERCOLES": expandir_franjas_rol_a_slots("MIERCOLES", FRANJAS_LMXJ_ROL),
    "JUEVES":    expandir_franjas_rol_a_slots("JUEVES",    FRANJAS_LMXJ_ROL),
    "VIERNES":   expandir_franjas_rol_a_slots("VIERNES",   FRANJAS_VIERNES_ROL),
    "SABADO":    expandir_franjas_rol_a_slots("SABADO",    FRANJAS_SABADO_ROL),
    "DOMINGO":   expandir_franjas_rol_a_slots("DOMINGO",   FRANJAS_DOMINGO_ROL),
}


# Sanity check al cargar el modulo: la suma del desglose por rol de cada slot
# debe coincidir con la demanda numerica total de ese mismo slot. Si no, la
# tabla del PDF se ha transcrito de forma incoherente.
for _dia in DIAS:
    for _s in range(num_slots_dia(_dia)):
        _suma_rol = sum(DEMANDA_ROL_DIA[_dia][_s].values())
        _num = DEMANDA_NUM_DIA[_dia][_s]
        assert _suma_rol == _num, (
            f"Inconsistencia: {_dia} slot {_s} -> demanda numerica = {_num} "
            f"pero suma por rol = {_suma_rol} ({DEMANDA_ROL_DIA[_dia][_s]})"
        )


# ---------------------------------------------------------------------------
# Necesidades del restaurante - ETIQUETAS por slot (Fase 0.8)
# (PDF, tabla "ETIQUETAS (con que haya una persona con la etiqueta es
#  suficiente)" - dos tablas: LUN-VIE y SAB-DOM).
# ---------------------------------------------------------------------------
#
# Lectura aplicada (literal del PDF): la lista de etiquetas de un slot es una
# DISYUNCION -> para satisfacer el requisito basta con que UNA persona del
# slot tenga ALGUNA de las etiquetas listadas. Esta es la lectura mas natural
# del enunciado "con que haya una persona con la etiqueta es suficiente".

# LUN-MAR-MIE-JUE-VIE comparten esta tabla.
FRANJAS_LMXJV_ETI = [
    ("06:00", "06:30", ["PASTAS"]),
    ("06:30", "07:00", ["PASTAS"]),
    ("07:00", "08:00", ["APERTURA", "CAJERA", "BARISTA", "BANDEJERA"]),
    ("08:00", "09:30", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("09:30", "12:00", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("12:00", "12:30", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("12:30", "13:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("13:00", "14:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("14:00", "16:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("16:00", "16:30", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("16:30", "17:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("17:00", "18:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("18:00", "18:30", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("18:30", "20:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("20:00", "22:00", ["COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE"]),
    ("22:00", "00:00", ["COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE"]),
]

# SAB-DOM comparten otra tabla (apertura 06:30).
FRANJAS_SD_ETI = [
    ("06:30", "07:30", ["PASTAS"]),
    ("07:30", "08:00", ["APERTURA", "CAJERA", "BARISTA", "BANDEJERA"]),
    ("08:00", "09:30", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("09:30", "12:00", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("12:00", "12:30", ["CAJERA", "BARISTA", "BANDEJERA"]),
    ("12:30", "13:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("13:00", "14:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("14:00", "16:00", ["COMANDERA", "BARRA", "DELIVERY"]),
    ("16:00", "16:30", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("16:30", "17:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("17:00", "18:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("18:00", "18:30", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("18:30", "20:00", ["CAJERA", "BARISTA", "BANDEJERA", "COMANDERA"]),
    ("20:00", "22:00", ["COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE"]),
    ("22:00", "00:00", ["COMANDERA", "BARRA", "DELIVERY", "CIERRE", "CONTABLE"]),
]

# Por dia, lista de listas de etiquetas (una lista por slot).
ETIQUETAS_DIA = {
    "LUNES":     expandir_franjas_eti_a_slots("LUNES",     FRANJAS_LMXJV_ETI),
    "MARTES":    expandir_franjas_eti_a_slots("MARTES",    FRANJAS_LMXJV_ETI),
    "MIERCOLES": expandir_franjas_eti_a_slots("MIERCOLES", FRANJAS_LMXJV_ETI),
    "JUEVES":    expandir_franjas_eti_a_slots("JUEVES",    FRANJAS_LMXJV_ETI),
    "VIERNES":   expandir_franjas_eti_a_slots("VIERNES",   FRANJAS_LMXJV_ETI),
    "SABADO":    expandir_franjas_eti_a_slots("SABADO",    FRANJAS_SD_ETI),
    "DOMINGO":   expandir_franjas_eti_a_slots("DOMINGO",   FRANJAS_SD_ETI),
}


# ---------------------------------------------------------------------------
# Mapeos dia -> franjas (Fase 1)
# ---------------------------------------------------------------------------
# Necesarios para construir un ScheduleRequest a partir de los datos de este
# modulo (helper `request_desde_data_py` en core.py).

FRANJAS_NUM_DIA = {
    "LUNES":     FRANJAS_LMXJ_NUM,
    "MARTES":    FRANJAS_LMXJ_NUM,
    "MIERCOLES": FRANJAS_LMXJ_NUM,
    "JUEVES":    FRANJAS_LMXJ_NUM,
    "VIERNES":   FRANJAS_VIERNES_NUM,
    "SABADO":    FRANJAS_SABADO_NUM,
    "DOMINGO":   FRANJAS_DOMINGO_NUM,
}

FRANJAS_ROL_DIA = {
    "LUNES":     FRANJAS_LMXJ_ROL,
    "MARTES":    FRANJAS_LMXJ_ROL,
    "MIERCOLES": FRANJAS_LMXJ_ROL,
    "JUEVES":    FRANJAS_LMXJ_ROL,
    "VIERNES":   FRANJAS_VIERNES_ROL,
    "SABADO":    FRANJAS_SABADO_ROL,
    "DOMINGO":   FRANJAS_DOMINGO_ROL,
}

FRANJAS_ETI_DIA = {
    "LUNES":     FRANJAS_LMXJV_ETI,
    "MARTES":    FRANJAS_LMXJV_ETI,
    "MIERCOLES": FRANJAS_LMXJV_ETI,
    "JUEVES":    FRANJAS_LMXJV_ETI,
    "VIERNES":   FRANJAS_LMXJV_ETI,
    "SABADO":    FRANJAS_SD_ETI,
    "DOMINGO":   FRANJAS_SD_ETI,
}


# Sanity check: todas las etiquetas listadas en las tablas estan en ETIQUETAS.
for _dia in DIAS:
    for _s in range(num_slots_dia(_dia)):
        for _t in ETIQUETAS_DIA[_dia][_s]:
            assert _t in ETIQUETAS, (
                f"Etiqueta desconocida '{_t}' en {_dia} slot {_s}"
            )
