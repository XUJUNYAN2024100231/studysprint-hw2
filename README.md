# StudySprint - HW3 Docker CI/CD

A deadline-aware learning planner, continuing the original HW2 service with the
Docker-based delivery pipeline required by HW3.

**Student:** XUJUNYAN, 2024100231.

## Application

- Create, edit, complete, search, and delete assignments.
- Plan 15-minute study blocks by earliest deadline and priority within a daily budget.
- See overdue tasks, insufficient capacity, and work beyond the planning window.
- Switch between English, Chinese, and Korean; keep task text in its original language.
- Save tasks in the current browser profile and back up through JSON export/import.

Tasks are processed in memory by FastAPI. There is no server database, account sync,
or machine-learning model. The topic differs from the tutorial's face-estimation example.

## Local Python development

Requires Python 3.13. In PowerShell, from this folder:

```powershell
python -m pip install -r requirements.txt
python main.py
```

Open http://127.0.0.1:8000. Stop with Ctrl+C. Do not run the development server and
the deployed container on port 8000 at the same time.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The suite tests scheduling, validation, API routes, build revision reporting, and
mocked deployment/rollback boundaries. Mocked Docker tests do not demonstrate that
an actual image was built or deployed; collect real workflow and container evidence.

## Docker build

With Docker Desktop running in Linux container mode:

```powershell
$revision = git rev-parse HEAD
docker build --build-arg "BUILD_REVISION=$revision" -t studysprint:local .
docker run --rm -p 127.0.0.1:8000:8000 studysprint:local
```

The image runs as a non-root user. Its health endpoint exposes the exact build
revision; its Docker health check requests that endpoint.

## Delivery pipeline

Push main -> hosted Python tests -> Docker build and container smoke test ->
Docker Hub publication -> Windows self-hosted runner -> verified local container.

The deploy script uses an immutable image digest, checks its commit label and
candidate health, replaces only project-owned containers, and restores the previous
container if the new live service fails verification. A short interruption can
occur during replacement; this is not a zero-downtime claim.

See [HW3_SETUP.md](HW3_SETUP.md) for account/runner configuration, required repository
secrets, the activation variable, and before/after update verification. The activation
variable remains disabled until the Docker Hub credentials and runner are ready.

## API

- `GET /api/health`: service status, application version, short/full build revision.
- `POST /api/plan`: validate assignments and generate the study plan.
- `GET /docs`: interactive API documentation.
- `GET /`: the web interface, with assets under `/static/`.

The existing `render.yaml` is retained for compatibility with the prior HW2 Render
service. That service is separate from the HW3 local Docker deployment; its older
screenshots are not evidence for HW3.

## References

- Supplied HW3 tutorial: From Development to Deployment 2.
- [Docker GitHub Actions](https://docs.docker.com/build/ci/github-actions/)
- [Docker Desktop Windows installation](https://docs.docker.com/desktop/setup/install/windows-install/)
- [GitHub self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
