"""Exercise the real running container API and packaged static assets."""
import argparse
import json
import urllib.request


def smoke(base, revision):
    with urllib.request.urlopen(base + "/api/health", timeout=5) as response:
        health = json.load(response)
    assert health["status"] == "ok" and health["service"] == "StudySprint"
    assert health["revision_full"] == revision, "Unexpected image revision"
    payload = {"tasks": [{"id": "smoke", "title": "Docker pipeline report", "course": "Open Source SW",
               "due": "2026-11-09", "minutes": 180, "priority": "high", "completed": False}],
               "start_date": "2026-11-06", "days": 3, "daily_minutes": 60}
    request = urllib.request.Request(base + "/api/plan", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        plan = json.load(response)
    assert plan["summary"]["scheduled_minutes"] == 180
    assert plan["summary"]["unscheduled_minutes"] == 0
    assert [day["scheduled_minutes"] for day in plan["days"]] == [60, 60, 60]
    for route, marker in [("/", "StudySprint"), ("/static/app.js", "language-select"),
                          ("/static/i18n.js", "나의 학습 공간"), ("/docs", "swagger")]:
        with urllib.request.urlopen(base + route, timeout=5) as response:
            assert marker in response.read().decode("utf-8"), route
    print(json.dumps({"smoke_tests": "passed", "health": health,
                      "scheduled_minutes": 180, "daily_minutes": [60, 60, 60]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--revision", required=True)
    arguments = parser.parse_args()
    smoke(arguments.base_url.rstrip("/"), arguments.revision)
