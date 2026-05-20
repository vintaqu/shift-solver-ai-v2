# solver/

Servicio Python con OR-Tools (CP-SAT) que genera el cuadrante horario.

- **CLI** (`solver.py`): script de desarrollo que usa los datos de `data.py`
  e imprime el cuadrante en formato texto. Útil para validación humana.
- **HTTP** (`main.py`): servicio FastAPI con `POST /solve` que recibe el
  problema completo en JSON y devuelve el cuadrante. Es el contrato que
  consumirá la web (Fase 3).

## Estructura

| Fichero | Rol |
|---|---|
| `core.py` | Motor del solver: construye el modelo CP-SAT, resuelve y serializa. Reutilizable. |
| `schemas.py` | Pydantic — define el contrato JSON (`ScheduleRequest` / `ScheduleResponse`). |
| `data.py` | Datos del PDF (8 trabajadores, demanda por slot/rol/etiqueta). Fixture para CLI y tests. |
| `solver.py` | Script CLI: lee `data.py` → llama a `core.resolver_problema` → imprime. |
| `main.py` | FastAPI con `GET /health`, `POST /solve` y autenticación por `x-api-key`. |
| `Dockerfile` | Imagen del servicio HTTP. Railway-friendly. |
| `requirements.txt` | Dependencias Python. |

## Ejecutar el CLI (modo dev)

```powershell
py -m venv solver/.venv
solver\.venv\Scripts\python.exe -m pip install -r solver/requirements.txt
solver\.venv\Scripts\python.exe solver/solver.py             # rotación determinista
solver\.venv\Scripts\python.exe solver/solver.py 42          # rotación alternativa con seed=42
```

## Ejecutar el servicio HTTP en local con uvicorn

Sin autenticación (modo dev):

```powershell
cd solver
..\solver\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Con autenticación:

```powershell
$env:SHIFT_SOLVER_API_KEY = "secreto-de-prueba"
..\solver\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Probar endpoints:

```bash
# Health (público)
curl http://127.0.0.1:8000/health

# Solve (requiere x-api-key si SHIFT_SOLVER_API_KEY está definido)
curl -X POST http://127.0.0.1:8000/solve \
  -H "Content-Type: application/json" \
  -H "x-api-key: secreto-de-prueba" \
  --data-binary @request.json
```

Para generar un `request.json` de ejemplo a partir de los datos de `data.py`:

```bash
solver\.venv\Scripts\python.exe -c "from core import request_desde_data_py; print(request_desde_data_py().model_dump_json())" > request.json
```

Documentación interactiva (Swagger): `http://127.0.0.1:8000/docs`.

## Ejecutar con Docker en local

Con Docker Desktop arrancado:

```bash
cd solver
docker build -t shift-solver:dev .
docker run --rm -p 8000:8000 -e SHIFT_SOLVER_API_KEY=secreto shift-solver:dev
```

El contenedor expone `0.0.0.0:8000`. Probar igual que con uvicorn (puerto 8000).

## Despliegue a Railway

El `Dockerfile` está diseñado para que Railway lo detecte automáticamente sin
configuración extra. Pasos (la mayoría desde el panel web de Railway, no
desde código):

1. **Subir el repo a GitHub** (público o privado, da igual).
2. En [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
   → seleccionar el repo. Railway detecta el `Dockerfile` en `solver/`.
3. Si tu repo tiene varios servicios, en **Settings → Root directory** poner
   `solver/`.
4. **Variables → New Variable**: añadir `SHIFT_SOLVER_API_KEY` con un secreto
   suficientemente largo. Railway inyecta también `PORT` automáticamente.
5. **Deploy**. Railway ejecuta `docker build` con el Dockerfile y lanza el
   contenedor. Tarda ~3-5 minutos la primera vez (instalar ortools).
6. Validar con `curl https://<tu-servicio>.railway.app/health` y luego con
   un POST a `/solve` usando la `x-api-key` definida.

Notas:
- El servidor escucha en `$PORT` (inyectado por Railway). El `Dockerfile` ya
  hace la expansión: `uvicorn ... --port ${PORT}`.
- El `HEALTHCHECK` del Dockerfile permite a Railway verificar que el
  servicio está vivo sin configuración extra.
- **Tiempo de cómputo**: el plan gratuito de Railway tiene CPU compartida
  y los 60 s de límite del solver pueden no bastar. Se puede subir el
  límite vía `parametros.time_limit_seconds` en cada request.

---

# Fase 0: estado por subfase

| Subfase | Cubre | Estado |
|---------|-------|--------|
| 0.1 | Solo lunes, solo cobertura numérica de la demanda | ✅ |
| 0.2 | Toda la semana, cobertura numérica | ✅ |
| 0.3 | Cumplimiento de horas semanales por contrato | ✅ |
| 0.4 | Descanso de 12 h entre jornadas | ✅ |
| 0.5 | Descanso semanal de 2 días seguidos | ✅ |
| 0.6 | Restricciones individuales (Edgar findes, Mayte tarde, JOSE L-J, etc.) | ✅ ¹ |
| 0.7 | Roles con jerarquía acumulativa | ✅ |
| 0.8 | Etiquetas requeridas por slot | ✅ |
| 0.9 | Jornada partida (3-5 h por tramo, ≥1.5 h descanso, ≤9 h ordinarias/día) | ✅ |
| 0.10 | Jornada continuada >5 h: pausa de 20 min como tiempo de trabajo | ✅ ² |
| 0.11 | Objetivo blando: maximizar continuadas, repartir partidas, equidad | ✅ |
| 0.12 | Modo soft: detección de infactibilidades y propuestas | pendiente |

# Fase 1: estado

| Hito | Estado |
|---|---|
| Refactor del motor a `core.py` | ✅ |
| Pydantic schemas en `schemas.py` | ✅ |
| FastAPI con `/health` y `/solve` (auth `x-api-key`) | ✅ |
| Dockerfile Railway-friendly | ✅ |
| Validado en local con `uvicorn` + curl | ✅ |
| Validado en local con `docker build` + curl | ✅ (imagen 538 MB, OPTIMAL en ~15 s) |
| Desplegado en Railway | ✅ (`shift-solver-ai-production.up.railway.app`) |

---

**¹** Al activar las restricciones individuales del PDF la cobertura exacta se vuelve infactible (concretamente VIE 21:30–00:00 + SAB 09:30–12:00 chocan con la regla de 12 h de descanso). El propio PDF prevé este caso ("El sistema resolverá el problema aunque haya huecos que no sea capaz de cubrir"), así que en 0.6 se adelanta parcialmente la subfase 0.12: la cobertura pasa a ser **blanda** con una variable `huecos[d, s]` y una penalización fuerte. El solver cubre todo lo posible y reporta los huecos mínimos. Las propuestas estructuradas para cerrar los huecos (cambios de contrato, plantilla extra, etc.) llegarán en 0.12.

**²** La pausa de 20 min cuenta como tiempo de trabajo según el PDF, así que no se descuenta del horario asignado. Como la granularidad del solver es de 30 min por slot, los 20 min caben dentro de 1 slot y no requieren restricción extra en el modelo: el restaurante escalona internamente las pausas de los tramos continuados >5 h. La subfase 0.10 añade una verificación post-hoc que lista esos tramos.
