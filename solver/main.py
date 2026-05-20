"""
SHIFT SOLVER AI - Servicio HTTP (FastAPI)
==========================================
Expone el solver como un servicio HTTP para que la aplicacion web (Fase 3)
pueda consumirlo. La logica del solver vive en `core.py`; este modulo solo
se ocupa de la capa HTTP: routing, autenticacion por API key y un endpoint
de health para los chequeos del orquestador (Railway, Docker, etc.).

Endpoints:
  - GET  /health    -> 200 OK con info de servicio (sin auth).
  - POST /solve     -> ejecuta el solver y devuelve el cuadrante (con auth).

Autenticacion: header `x-api-key`. La key se configura por variable de
entorno SHIFT_SOLVER_API_KEY. Si NO esta definida, el servicio arranca en
"modo desarrollo" sin autenticacion (util en local; en produccion siempre
debe definirse la variable).

Uso local:
    uvicorn main:app --reload --port 8000
"""

import logging
import os
import random
from typing import List

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from core import resolver_problema
from schemas import ScheduleRequest, ScheduleResponse


logger = logging.getLogger("shift_solver")
logging.basicConfig(level=logging.INFO)


API_KEY_ENV = "SHIFT_SOLVER_API_KEY"
API_KEY = os.environ.get(API_KEY_ENV)

app = FastAPI(
    title="Shift Solver AI",
    description=(
        "Genera cuadrantes horarios semanales para un restaurante a partir "
        "de las necesidades del negocio, los trabajadores disponibles y la "
        "legislacion laboral. Motor: OR-Tools CP-SAT."
    ),
    version="0.11.0",
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    auth_required: bool
    version: str


@app.get("/health", response_model=HealthResponse)
def health():
    """Health check sin autenticacion. Lo usan Railway / Docker / etc."""
    return HealthResponse(
        status="ok",
        auth_required=API_KEY is not None,
        version=app.version,
    )


# ---------------------------------------------------------------------------
# Solve
# ---------------------------------------------------------------------------

def _check_auth(x_api_key: str | None):
    if API_KEY is None:
        # Modo dev: sin autenticacion.
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta o no es valido el header 'x-api-key'.",
        )


@app.post("/solve", response_model=ScheduleResponse)
def solve(
    request: ScheduleRequest,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
):
    """Ejecuta el solver con los datos del request y devuelve el cuadrante."""
    _check_auth(x_api_key)

    seed = request.parametros.seed
    logger.info(
        "POST /solve - %d trabajadores, %d dias, seed=%s, time_limit=%s",
        len(request.trabajadores),
        len(request.dias),
        seed,
        request.parametros.time_limit_seconds,
    )

    try:
        response = resolver_problema(request, seed=seed)
    except ValueError as e:
        # Errores de validacion del problema (sanity checks de cargar_problema).
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error inesperado al resolver el problema")
        raise HTTPException(
            status_code=500, detail=f"Error interno del solver: {e}"
        )

    logger.info(
        "POST /solve OK - estado=%s, tiempo=%.2fs, huecos=%d sp",
        response.estado,
        response.tiempo_calculo_segundos,
        response.slots_persona_huecos,
    )
    return response


# ---------------------------------------------------------------------------
# Solve variants (multiples soluciones equivalentes)
# ---------------------------------------------------------------------------

class SolveVariantsRequest(BaseModel):
    """Pide N soluciones independientes del mismo problema, cada una con un
    seed aleatorio distinto. CP-SAT con `randomize_search=True` explora el
    espacio de soluciones en orden distinto y, cuando hay degeneracion en el
    optimo (lo habitual en cuadrantes), produce asignaciones diferentes pero
    de calidad equivalente."""
    request: ScheduleRequest
    num_variants: int = Field(default=3, ge=1, le=8)


class SolveVariantsResponse(BaseModel):
    """Lista ordenada de variantes generadas. La primera no tiene por que ser
    la mejor: la web ordena por calidad antes de mostrarlas."""
    variants: List[ScheduleResponse]


@app.post("/solve-variants", response_model=SolveVariantsResponse)
def solve_variants(
    body: SolveVariantsRequest,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
):
    """Genera N cuadrantes equivalentes en calidad pero distintos en
    asignacion. Cada variante usa un seed aleatorio independiente para que
    CP-SAT explore caminos distintos del arbol de busqueda."""
    _check_auth(x_api_key)

    n = body.num_variants
    base_seed = random.randint(1, 10_000_000)
    seeds = [base_seed + i for i in range(n)]

    logger.info(
        "POST /solve-variants - %d variantes, %d trabajadores, seeds=%s",
        n, len(body.request.trabajadores), seeds,
    )

    variants: List[ScheduleResponse] = []
    for i, seed in enumerate(seeds):
        # Ensure each variant uses its own seed (overrides what may have been
        # passed in body.request.parametros.seed).
        body.request.parametros.seed = seed
        try:
            response = resolver_problema(body.request, seed=seed)
            variants.append(response)
            logger.info(
                "  variant %d/%d: estado=%s, huecos=%d, partidas=%d, tiempo=%.2fs",
                i + 1, n, response.estado,
                response.slots_persona_huecos,
                response.metricas.total_partidas,
                response.tiempo_calculo_segundos,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.exception("Error inesperado en variante %d", i + 1)
            raise HTTPException(
                status_code=500, detail=f"Error en variante {i + 1}: {e}"
            )

    return SolveVariantsResponse(variants=variants)
