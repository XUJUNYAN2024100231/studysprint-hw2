"""Deploy one immutable StudySprint image, verify its revision, and roll back on failure.

Only containers carrying this project's ownership label may be stopped or removed.
Candidate and live endpoints bind to loopback. No credentials are accepted here.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

PROJECT = "studysprint-hw3"
OWNER_LABEL = "io.studysprint.project"
LIVE = "studysprint-hw3"
CANDIDATE = "studysprint-hw3-candidate"
BACKUP = "studysprint-hw3-previous"


class Docker:
    def command(self, *args):
        result = subprocess.run(["docker", *args], capture_output=True, text=True,
                                timeout=300, check=False)
        if result.returncode:
            raise RuntimeError(f"Docker {args[0]} failed: {result.stderr.strip()[-1200:]}")
        return result.stdout.strip()

    def inspect(self, name):
        # Listing first distinguishes absence from a broken/inaccessible Docker daemon.
        names = self.command("container", "ls", "-a", "--format", "{{.Names}}").splitlines()
        if name not in names:
            return None
        return json.loads(self.command("container", "inspect", name))[0]

    def check_owned(self, name):
        info = self.inspect(name)
        if info and (info["Config"].get("Labels") or {}).get(OWNER_LABEL) != PROJECT:
            raise RuntimeError(f"Container name {name} is used by another project; leaving it intact.")
        return info

    def remove_owned(self, name):
        if self.check_owned(name):
            self.command("container", "rm", "--force", name)

    def start_image(self, image, name, port):
        self.command("run", "--detach", "--name", name,
                     "--label", f"{OWNER_LABEL}={PROJECT}",
                     "--publish", f"127.0.0.1:{port}:8000",
                     "--restart", "unless-stopped", "--read-only",
                     "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
                     "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", image)


def wait_healthy(port, revision, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=3) as response:
                health = json.load(response)
            if (health.get("status") == "ok" and health.get("service") == "StudySprint"
                    and health.get("revision_full") == revision):
                return health
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Port {port} did not serve the expected healthy revision.")


def deploy(image, revision, docker=None, wait=wait_healthy):
    if not re.fullmatch(r"docker\.io/[a-z0-9][a-z0-9_-]{2,29}/studysprint@sha256:[0-9a-f]{64}", image):
        raise ValueError("Use a Docker Hub studysprint image with an immutable sha256 digest.")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected revision must be a full Git commit SHA.")
    engine = docker or Docker()
    for name in (LIVE, CANDIDATE, BACKUP):
        engine.check_owned(name)
    # Pulling or failing the candidate never interrupts the existing live container.
    engine.command("pull", image)
    details = json.loads(engine.command("image", "inspect", image))[0]
    labels = details["Config"].get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != revision:
        raise RuntimeError("Image provenance does not match the tested commit.")
    engine.remove_owned(CANDIDATE)
    try:
        engine.start_image(image, CANDIDATE, 18081)
        wait(18081, revision)
    finally:
        engine.remove_owned(CANDIDATE)

    previous = engine.check_owned(LIVE)
    engine.remove_owned(BACKUP)
    if previous:
        engine.command("stop", LIVE)
        engine.command("rename", LIVE, BACKUP)
    try:
        engine.start_image(image, LIVE, 8000)
        health = wait(8000, revision)
    except Exception:
        engine.remove_owned(LIVE)
        if previous:
            engine.command("rename", BACKUP, LIVE)
            engine.command("start", LIVE)
        raise
    engine.remove_owned(BACKUP)
    return {"verified": True, "image": image, "revision": revision,
            "version": health["version"], "health": health,
            "url": "http://127.0.0.1:8000", "container": LIVE,
            "verified_at": datetime.now(timezone.utc).isoformat()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", default="deployment-evidence.json")
    options = parser.parse_args()
    result = deploy(options.image, options.revision)
    Path(options.output).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
