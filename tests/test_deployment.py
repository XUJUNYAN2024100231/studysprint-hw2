"""Test deployment failure boundaries with mocked Docker and health probes."""
import json
from unittest.mock import Mock

import pytest

from scripts.deploy_container import BACKUP, CANDIDATE, LIVE, PROJECT, Docker, deploy
from main import app
from fastapi.testclient import TestClient

REVISION = "a" * 40
IMAGE = "docker.io/student123/studysprint@sha256:" + "b" * 64


def engine(previous=True):
    docker = Mock(spec=Docker)
    docker.check_owned.side_effect = lambda name: {"Id": "old"} if name == LIVE and previous else None
    docker.command.return_value = json.dumps([{
        "Config": {"Labels": {"org.opencontainers.image.revision": REVISION}}}])
    return docker


def healthy(port, revision):
    return {"status": "ok", "service": "StudySprint", "version": "1.2.0",
            "revision": revision[:12], "revision_full": revision}


def test_success_checks_candidate_and_live_at_exact_revision():
    docker = engine()
    wait = Mock(side_effect=healthy)
    result = deploy(IMAGE, REVISION, docker, wait)
    assert result["verified"] and result["revision"] == REVISION
    assert wait.call_args_list[0].args == (18081, REVISION)
    assert wait.call_args_list[1].args == (8000, REVISION)
    docker.start_image.assert_any_call(IMAGE, CANDIDATE, 18081)
    docker.start_image.assert_any_call(IMAGE, LIVE, 8000)
    docker.command.assert_any_call("stop", LIVE)
    docker.command.assert_any_call("rename", LIVE, BACKUP)


def test_candidate_failure_does_not_stop_live_service():
    docker = engine()
    with pytest.raises(RuntimeError, match="candidate failed"):
        deploy(IMAGE, REVISION, docker, Mock(side_effect=RuntimeError("candidate failed")))
    assert not any(call.args[:1] in (("stop",), ("rename",)) for call in docker.command.call_args_list)
    docker.remove_owned.assert_called_with(CANDIDATE)


def test_live_failure_restores_previous_container():
    docker = engine()
    wait = Mock(side_effect=[healthy(18081, REVISION), RuntimeError("live failed")])
    with pytest.raises(RuntimeError, match="live failed"):
        deploy(IMAGE, REVISION, docker, wait)
    docker.command.assert_any_call("rename", BACKUP, LIVE)
    docker.command.assert_any_call("start", LIVE)


def test_first_deployment_failure_has_no_fictitious_rollback():
    docker = engine(previous=False)
    with pytest.raises(RuntimeError):
        deploy(IMAGE, REVISION, docker, Mock(side_effect=[healthy(18081, REVISION), RuntimeError()]))
    assert not any(call.args[:1] == ("rename",) for call in docker.command.call_args_list)


def test_wrong_image_revision_never_stops_live_service():
    docker = engine()
    docker.command.return_value = json.dumps([{"Config": {"Labels": {}}}])
    with pytest.raises(RuntimeError, match="provenance"):
        deploy(IMAGE, REVISION, docker, Mock())
    docker.start_image.assert_not_called()
    docker.remove_owned.assert_not_called()


@pytest.mark.parametrize("image,revision", [
    ("student123/studysprint:latest", REVISION),
    (IMAGE, "short"),
    ("docker.io/another/other-app@sha256:" + "b" * 64, REVISION),
])
def test_unpinned_or_invalid_input_is_rejected_before_docker(image, revision):
    docker = engine()
    with pytest.raises(ValueError):
        deploy(image, revision, docker, Mock())
    assert not docker.mock_calls


def test_another_projects_container_is_preserved():
    docker = Docker()
    docker.inspect = Mock(return_value={"Config": {"Labels": {"io.studysprint.project": "other"}}})
    docker.command = Mock()
    with pytest.raises(RuntimeError, match="another project"):
        docker.remove_owned(LIVE)
    docker.command.assert_not_called()


def test_unlabeled_container_is_preserved():
    docker = Docker()
    docker.inspect = Mock(return_value={"Config": {"Labels": None}})
    docker.command = Mock()
    with pytest.raises(RuntimeError):
        docker.remove_owned(LIVE)
    docker.command.assert_not_called()


def test_health_uses_image_revision_when_render_is_absent(monkeypatch):
    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    monkeypatch.setenv("BUILD_REVISION", REVISION)
    health = TestClient(app).get("/api/health").json()
    assert health["revision"] == REVISION[:12]
    assert health["revision_full"] == REVISION


def test_health_preserves_existing_render_revision(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "c" * 40)
    monkeypatch.setenv("BUILD_REVISION", REVISION)
    assert TestClient(app).get("/api/health").json()["revision_full"] == "c" * 40
