"""StudySprint: a deadline-aware planning service for HW2."""
from datetime import date, timedelta
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

BASE = Path(__file__).resolve().parent
VERSION = "1.0.3"
app = FastAPI(title="StudySprint API", version=VERSION)


class Task(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=100)
    course: str = Field(default="General", min_length=1, max_length=60)
    due: date
    minutes: int = Field(ge=15, le=10080, multiple_of=15, strict=True)
    priority: Literal["high", "medium", "low"] = "medium"
    completed: bool = Field(default=False, strict=True)

    @field_validator("id", "title", "course")
    @classmethod
    def trim_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Text must not be blank")
        return value


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[Task] = Field(max_length=100)
    start_date: date
    days: int = Field(default=7, ge=1, le=14, strict=True)
    daily_minutes: int = Field(default=120, ge=15, le=720, multiple_of=15, strict=True)

    @model_validator(mode="after")
    def validate_request(self):
        ids = [task.id for task in self.tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("Every task must have a unique id")
        if self.start_date > date.max - timedelta(days=self.days - 1):
            raise ValueError("Planning window exceeds the supported date range")
        return self


def create_plan(payload: PlanRequest):
    """Allocate 15-minute blocks by earliest deadline, then priority.

    A deadline includes that entire day. Overdue tasks are reported rather than
    silently scheduled after their deadline. Completed tasks consume no capacity.
    """
    active = [task for task in payload.tasks if not task.completed]
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    ordered = sorted(active, key=lambda task: (task.due, priority_rank[task.priority]))
    remaining = {task.id: task.minutes for task in active}
    days = []
    for offset in range(payload.days):
        day = payload.start_date + timedelta(days=offset)
        capacity = payload.daily_minutes
        sessions = []
        for task in ordered:
            if task.due < day or remaining[task.id] == 0:
                continue
            allocated = min(remaining[task.id], capacity)
            if allocated:
                sessions.append({"task_id": task.id, "title": task.title,
                                 "course": task.course, "minutes": allocated,
                                 "priority": task.priority})
                remaining[task.id] -= allocated
                capacity -= allocated
            if not capacity:
                break
        days.append({"date": day.isoformat(), "capacity_minutes": payload.daily_minutes,
                     "scheduled_minutes": payload.daily_minutes - capacity,
                     "sessions": sessions})
    last_day = payload.start_date + timedelta(days=payload.days - 1)
    results = []
    for task in active:
        left = remaining[task.id]
        if task.due < payload.start_date:
            status = "overdue"
        elif not left:
            status = "planned"
        elif task.due <= last_day:
            status = "at_risk"
        else:
            status = "beyond_horizon"
        results.append({"task_id": task.id, "title": task.title, "due": task.due.isoformat(),
                        "status": status, "scheduled_minutes": task.minutes - left,
                        "unscheduled_minutes": left})
    demand = sum(task.minutes for task in active)
    scheduled = sum(day["scheduled_minutes"] for day in days)
    return {"algorithm": "earliest-deadline-first / priority tie-break",
            "days": days, "tasks": results,
            "summary": {"active_tasks": len(active),
                        "completed_tasks": len(payload.tasks) - len(active),
                        "demand_minutes": demand, "scheduled_minutes": scheduled,
                        "unscheduled_minutes": demand - scheduled,
                        "capacity_minutes": payload.daily_minutes * payload.days,
                        "at_risk_tasks": sum(task["status"] in ("overdue", "at_risk") for task in results)}}


@app.middleware("http")
async def response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "StudySprint", "version": VERSION,
            "revision": os.environ.get("RENDER_GIT_COMMIT", "local")[:12]}


@app.post("/api/plan")
def plan(payload: PlanRequest):
    return create_plan(payload)


@app.get("/")
def home():
    return FileResponse(BASE / "static" / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
