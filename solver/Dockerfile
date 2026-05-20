# SHIFT SOLVER AI - Imagen del servicio HTTP (FastAPI + OR-Tools)
# Diseñada para desplegarse en Railway sin cambios:
#   - Escucha en 0.0.0.0:$PORT (Railway inyecta PORT al runtime; en local
#     se usa 8000 por defecto).
#   - La API key llega por env var SHIFT_SOLVER_API_KEY (configurable en
#     el panel de Railway / docker run -e).
#   - Imagen oficial slim de Python para reducir tamaño.

# Fijamos Python 3.13 porque ortools tiene wheels estables ya publicadas
# para esa version; 3.14 funciona en local pero algunas wheels llegaron
# tarde y la imagen 3.13-slim se construye mas rapido.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Instalamos primero las dependencias para aprovechar la cache de Docker:
# si solo cambia el codigo (no requirements.txt), esta capa no se reconstruye.
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copiamos el resto del codigo del solver.
COPY core.py main.py schemas.py solver.py data.py ./

# Health check del propio Docker - tambien lo usa Railway si lo configuras.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{__import__('os').environ.get(\"PORT\",\"8000\")}/health').read()" || exit 1

EXPOSE 8000

# Usamos `sh -c` para que la variable $PORT se expanda al runtime (Railway).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
