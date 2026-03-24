"""FastAPI application — REST API for Public Comment Intelligence dashboard."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from graph import init_schema, close_driver
from api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_schema()
    yield
    # Shutdown
    close_driver()


app = FastAPI(
    title="Public Comment Intelligence API",
    description="AI-Enabled Public Comment Intelligence & Substantiveness Analysis",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
