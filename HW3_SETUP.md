# HW3: Docker CI/CD for StudySprint

This extends the existing StudySprint service with the pipeline demonstrated in
the supplied HW3 tutorial: Git push -> GitHub Actions -> Docker Hub -> a local
self-hosted runner -> a running Docker container. The Docker requirements come
from the video; the supplied Test and Enhancement lecture discusses complementary
testing techniques.

## Implemented components

- `Dockerfile`: Python 3.13 Linux image, non-root user, health check, and build revision.
- `.dockerignore`: allowlist of application files; credentials and Git metadata stay out.
- `.github/workflows/ci.yml`: tests, a real container smoke test, image publication,
  and deployment of the exact image digest on a Windows runner.
- `scripts/deploy_container.py`: pull the image, verify provenance, health-check a
  candidate, replace the live service, verify its exact commit, and restore the
  previous container if the live verification fails.
- `scripts/smoke_container.py`: real HTTP checks of health, scheduling, static files,
  and API documentation.
- `scripts/verify_update.py`: observe an old-to-new revision transition while the
  second Git push drives the pipeline. It does not claim zero downtime from sampling.
- `tests/test_deployment.py`: mock-based unit tests for deployment and rollback.
  Mock tests are not evidence of a real running Docker container.

## One-time setup

1. Install Docker Desktop with a working WSL 2 backend. On this computer, place the
   program on `D:\Docker\app` and WSL image data on `D:\Docker\data`. Complete
   Windows feature setup, restart if requested, and review Docker's license yourself.
2. Create a Docker Hub account and a public repository named `studysprint`.
3. Create a Docker personal access token with Read & Write access. In the existing
   GitHub repository, add Actions repository secrets named `DOCKERHUB_USERNAME` and
   `DOCKERHUB_TOKEN`. Enter the token directly in GitHub, never in source code or chat.
4. Register a Windows x64 repository runner with the additional label
   `studysprint-hw3`. Python 3.13 and the Docker CLI must be available on its PATH.
   Keep `run.cmd` active while exercising the pipeline; no Windows service is required.
5. Confirm Docker Desktop is running with Linux containers and that
   `docker info --format '{{.OSType}}'` returns `linux`.
6. Set the GitHub Actions repository variable `HW3_DOCKER_ENABLED` to `true` only
   after the registry secrets and runner are ready. Tests and container build/smoke
   checks run before activation; publication and local deployment remain disabled.

The workflow's self-hosted job only runs for this repository's `main` branch and
never for pull requests. Only keep the runner connected while you need it for the
course demonstration. GitHub recommends private repositories for self-hosted runners;
the existing course repository is public, so review workflow changes before pushing.

## Verify initial deployment

Push a commit, then check that all three jobs are successful: tests, image, deploy.
The image job builds and runs the service before publishing. The deploy job pulls
the immutable digest rather than trusting a mutable `latest` tag. The live container
binds to `http://127.0.0.1:8000`; a candidate is tested at port 18081. It uses the same
English/Chinese/Korean interface and browser task storage as HW2.

```powershell
docker ps --filter name=studysprint-hw3
Invoke-RestMethod http://127.0.0.1:8000/api/health
python scripts/smoke_container.py --revision FULL_COMMIT_SHA
```

Do not run the Python development server on port 8000 at the same time.

## Verify a pushed update

1. Record the first commit, image digest, workflow URL, and live health response.
2. Make a visible version change in `main.py` and the HTML version fallback, then
   commit locally so the new full SHA is known.
3. Before pushing, start the observer in another terminal:

```powershell
python scripts/verify_update.py --revision NEW_FULL_COMMIT_SHA --seconds 900
```

4. Push to `main`. Let GitHub Actions build/publish and the local runner deploy.
5. Require a successful workflow, the expected Docker Hub image, and a live health
   response matching the new full SHA. Keep the JSON record and take screenshots.

The replacement can cause a short interruption on the live port. Candidate health
checks and rollback reduce deployment risk; this is not a zero-downtime design.

## Submission evidence

The final ZIP must include actual screenshots and a one-page English report. Useful
screenshots show successful Actions jobs, Docker Hub tags/digest, running local
container, and before/after revision values. Include the source for reproduction.
Do not present an old Render deployment or mocked test result as Docker evidence.

At preparation time, container build/push, local Docker deployment, and a pushed
update are not yet verified. The final report and archive should be generated only
after those steps actually succeed.

## References

- Supplied HW3 tutorial video, especially objective/requirements and deployment steps.
- [Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Docker GitHub Actions](https://docs.docker.com/build/ci/github-actions/)
- [GitHub self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
