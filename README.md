# StudySprint

A deadline-aware study planner: turn assignment estimates into a realistic daily schedule, and see when a deadline cannot fit the available study time.

## Original topic

This is an education/productivity service. It plans academic workloads; the lecture's face age/gender estimation example is not reused. The implementation uses deterministic scheduling and DevOps, with no machine-learning model, paid API, or model download.

## Features

- Add, edit, complete, search, and delete assignments.
- Choose a start date, daily time budget, and planning window.
- Generate a plan through the Python API using earliest deadline first, with priority as a tie-breaker.
- See overdue tasks, capacity shortfalls, and work extending beyond the planning window.
- Keep tasks in the current browser's localStorage; import/export JSON for backup.
- Responsive desktop/mobile interface; visible service status, version, and deployed commit revision.

## Run locally on Windows

Requirements: Python 3.13 and internet access for the initial dependency installation.

From this folder, run in PowerShell:

```powershell
python -m pip install -r requirements.txt
python main.py
```

Open http://127.0.0.1:8000 and choose **Try sample tasks**, or add your own assignments. Stop the server with Ctrl+C. If VS Code uses a different Python interpreter, use that interpreter's full path for both commands.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The tests cover deadline ordering, priority ties, completed/overdue tasks, insufficient capacity, workload conservation, invalid input, frontend routes, and health checks. The local browser QA and its screenshots are provided separately from the public source tree.

## API and design

- `GET /api/health`: service status, application version, and current revision.
- `POST /api/plan`: validate the supplied assignments and compute a plan.
- `GET /`: web interface; assets are served under `/static/`.

Each estimate and daily budget is a multiple of 15 minutes. A due date includes that entire day. Sessions can be split across days. Completed assignments consume no capacity. An overdue task is flagged rather than scheduled after its deadline. An unfinished task due after the planning window is distinguished from a missed deadline.

User tasks are sent to the planning API when a plan is requested, processed in memory, and not stored in a server database. Browser storage is specific to the device and browser profile; this is not a cross-device account service. Clearing browser data removes saved tasks, so use JSON export for backup. Sample tasks are clearly marked as sample data.

## GitHub and automatic deployment

1. Upload this folder's contents to the root of a new GitHub repository, including `.github/workflows/ci.yml` and `render.yaml`.
2. GitHub Actions runs the tests on pushes to `main` and on pull requests.
3. Sign in to Render and connect the GitHub account/repository. Create a Blueprint from `render.yaml`, or a Python Web Service with the settings below.
4. Set Auto-Deploy to **After CI Checks Pass**. A passing push to `main` triggers the deploy; a failing check blocks it.
5. After the service reports a successful deploy, open its actual URL and `/api/health`. The health response's revision should match the GitHub commit.

| Render setting | Value |
| --- | --- |
| Runtime | Python |
| Build command | `python -m pip install -r requirements.txt` |
| Start command | `python -m uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/health` |
| Auto-Deploy | After CI Checks Pass |
| Instance plan | Free, if available for the account |

Connect the GitHub provider directly in Render; entering only a public repository URL does not enable automatic deployment. Do not publish credentials or deployment-hook secrets. Choose an available free instance explicitly; do not accept a paid plan without reviewing it.

## Evidence to collect for HW2

1. A real deployed application screenshot with the service URL visible.
2. The GitHub repository and a successful Actions run.
3. Render's successful deployment, including the associated commit.
4. For a second commit, change the visible application version and confirm that the deployed version/revision updates automatically after CI passes.

Local execution, a YAML file, and a successful CI run alone do not prove that deployment completed. Report only stages that were actually verified.

## Documentation

- FastAPI: https://fastapi.tiangolo.com/deployment/manually/
- GitHub Actions: https://docs.github.com/en/actions/tutorials/build-and-test-code/python
- Render FastAPI deployment: https://render.com/docs/deploy-fastapi
- Render automatic deployments: https://render.com/docs/deploys#automatic-deploys
- Render Blueprint reference: https://render.com/docs/blueprint-spec
