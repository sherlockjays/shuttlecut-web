"""Celery task for automatic rally analysis - runs on local PC GPU worker"""
import logging, sys
from celery import Celery
from sqlalchemy.orm import Session

sys.path.insert(0, "/app")
log = logging.getLogger(__name__)

from core.config import require_env

REDIS_URL = require_env("REDIS_URL")
celery = Celery("shuttlecut_autoedit", broker=REDIS_URL, backend=REDIS_URL)

# Route auto_analysis tasks to the dedicated GPU worker queue
celery.conf.task_routes = {
    "workers.auto_tasks.run_auto_analysis": {"queue": "autoedit"},
}


@celery.task(name="workers.auto_tasks.run_auto_analysis", bind=True, max_retries=0)
def run_auto_analysis(self, autoedit_project_id: int):
    """
    Dispatched to the local PC GPU worker via 'autoedit' queue.
    The GPU worker imports and runs analysis/pipeline.py with the same task name.
    This stub exists on the NAS backend so .delay() can dispatch to the queue.
    """
    from models.database import SessionLocal, AutoEditProject
    db: Session = SessionLocal()
    project = db.query(AutoEditProject).get(autoedit_project_id)
    try:
        if not project:
            log.error(f"AutoEditProject {autoedit_project_id} not found")
            return
        # If this runs on NAS backend (no GPU), mark error
        project.analysis_status = "error"
        project.error_msg = "GPU worker not connected. Start the local PC worker."
        db.commit()
    finally:
        db.close()
