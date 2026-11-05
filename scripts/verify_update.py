"""Record actual health changes while a commit triggers the Docker CI/CD workflow.

Start before pushing the next commit. Stops only after observing the requested
new revision, or records an explicit timeout without claiming an update.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.request


def observe(url, revision, seconds, output):
    samples=[]
    old_revisions=set()
    deadline=time.monotonic()+seconds
    complete=False
    while time.monotonic()<deadline:
        sample={"at":datetime.now(timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen(url.rstrip('/')+'/api/health',timeout=3) as response:
                health=json.load(response)
            sample['health']=health
            actual=health.get('revision_full')
            if health.get('status')=='ok' and actual==revision:
                complete=bool(old_revisions)
                samples.append(sample)
                break
            if actual and actual!='local' and health.get('status')=='ok':
                old_revisions.add(actual)
        except (urllib.error.URLError,TimeoutError,OSError,ValueError) as error:
            sample['error']=type(error).__name__
        samples.append(sample)
        time.sleep(1)
    result={"automatic_update_observed":complete,"expected_revision":revision,
            "previous_revisions":sorted(old_revisions),"samples":samples,
            "note":"One-second sampling cannot prove zero downtime between requests."}
    Path(output).write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({key:value for key,value in result.items() if key!='samples'},indent=2))
    return 0 if complete else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--revision',required=True)
    parser.add_argument('--seconds',type=int,default=900)
    parser.add_argument('--output',default='update-evidence.json')
    args=parser.parse_args()
    raise SystemExit(observe(args.url,args.revision,args.seconds,args.output))
