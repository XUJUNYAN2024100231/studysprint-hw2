from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def task(id="one", **updates):
    return {"id": id, "title": "Write a report", "course": "Open Source SW",
            "due": "2026-11-02", "minutes": 120, "priority": "medium",
            "completed": False, **updates}


def request(tasks, **updates):
    return {"tasks": tasks, "start_date": "2026-10-29", "days": 7,
            "daily_minutes": 120, **updates}


def test_health_and_frontend():
    assert client.get("/api/health").json()["status"] == "ok"
    assert "StudySprint" in client.get("/").text
    assert client.get("/static/app.js").status_code == 200


def test_deadline_precedes_priority():
    result = client.post("/api/plan", json=request([
        task("late", due="2026-11-02", priority="high"),
        task("urgent", due="2026-10-29", priority="low"),
    ])).json()
    assert result["days"][0]["sessions"][0]["task_id"] == "urgent"


def test_priority_breaks_deadline_ties():
    result = client.post("/api/plan", json=request([
        task("low", priority="low"), task("high", priority="high")
    ])).json()
    assert result["days"][0]["sessions"][0]["task_id"] == "high"


def test_completed_tasks_do_not_use_capacity():
    result = client.post("/api/plan", json=request([task(completed=True)])).json()
    assert result["summary"]["scheduled_minutes"] == 0
    assert result["summary"]["completed_tasks"] == 1


def test_overdue_tasks_are_flagged_and_not_scheduled_late():
    result = client.post("/api/plan", json=request([task(due="2026-10-28")])).json()
    assert result["tasks"][0]["status"] == "overdue"
    assert result["tasks"][0]["unscheduled_minutes"] == 120
    assert result["summary"]["scheduled_minutes"] == 0


def test_deadline_capacity_failure_is_visible():
    result = client.post("/api/plan", json=request([
        task(due="2026-10-29", minutes=180)
    ])).json()
    assert result["tasks"][0]["status"] == "at_risk"
    assert result["tasks"][0]["unscheduled_minutes"] == 60
    assert result["summary"]["at_risk_tasks"] == 1


def test_future_work_is_distinguished_from_missed_deadlines():
    result = client.post("/api/plan", json=request([
        task(due="2027-01-01", minutes=300)
    ], days=1)).json()
    assert result["tasks"][0]["status"] == "beyond_horizon"
    assert result["summary"]["at_risk_tasks"] == 0


def test_schedule_conserves_work_and_never_exceeds_capacity():
    items = [task(str(i), due=(date(2026,10,29)+timedelta(days=i%5)).isoformat(),
                  minutes=15*(i+1)) for i in range(12)]
    result = client.post("/api/plan", json=request(items, daily_minutes=90)).json()
    assert sum(item["minutes"] for item in items) == (
        result["summary"]["scheduled_minutes"] + result["summary"]["unscheduled_minutes"])
    deadlines = {item["id"]: item["due"] for item in items}
    for day in result["days"]:
        assert sum(s["minutes"] for s in day["sessions"]) == day["scheduled_minutes"] <= 90
        assert all(day["date"] <= deadlines[s["task_id"]] for s in day["sessions"])


def test_empty_plan_is_valid():
    result = client.post("/api/plan", json=request([]))
    assert result.status_code == 200
    assert result.json()["summary"]["demand_minutes"] == 0


@pytest.mark.parametrize("change", [
    {"minutes": -15}, {"minutes": 0}, {"minutes": 16}, {"minutes": 10095},
    {"title": "   "}, {"due": "not-a-date"}, {"priority": "urgent"},
    {"minutes": True}, {"completed": "false"},
])
def test_invalid_task_data_returns_422(change):
    assert client.post("/api/plan", json=request([task(**change)])).status_code == 422


@pytest.mark.parametrize("change", [
    {"days": 0}, {"days": 15}, {"daily_minutes": 0}, {"daily_minutes": 31},
    {"start_date": "9999-12-31", "days": 7},
])
def test_invalid_window_returns_422(change):
    assert client.post("/api/plan", json=request([], **change)).status_code == 422


def test_duplicate_ids_are_rejected():
    assert client.post("/api/plan", json=request([task(),task()])).status_code == 422


def test_tasks_are_not_shared_or_stored_on_the_server():
    client.post("/api/plan", json=request([task()]))
    assert client.post("/api/plan", json=request([])).json()["tasks"] == []


def test_security_headers_and_missing_route():
    assert client.get("/api/health").headers["x-content-type-options"] == "nosniff"
    assert client.get("/api/health").headers["cache-control"] == "no-store"
    assert client.get("/missing").status_code == 404
