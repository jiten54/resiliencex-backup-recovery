"""
ResilienceX Root Application Entry Point
Re-exports FastAPI application for Render, Heroku, and standard WSGI/ASGI deployments.
Supports both:
  uvicorn main:app --host 0.0.0.0 --port $PORT
  uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
"""
import os

try:
    from backend.app.main import app
except ImportError:
    # When deployed with backend as root working directory
    from app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
