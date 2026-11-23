#!/usr/bin/env python3
"""App Store signing for the GitHub Actions build, with the App Store Connect API key only.

The team has no registered device, so Xcode's automatic signing cannot make the development
profile it wants for an archive. Instead, each run makes its own short-lived signing set:

  setup    new distribution certificate (private key made here) and one App Store profile
           per app (iPhone and Apple Watch), installed for xcodebuild;
  cleanup  revokes that certificate and deletes those profiles.

Builds already sent to TestFlight or the App Store are re-signed by Apple, so revoking the
certificate afterwards does not affect them.

Environment: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, plus WORK (folder for the files).
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

import jwt  # PyJWT with cryptography

API = "https://api.appstoreconnect.apple.com/v1"
APPS = {"be.kadeon.sport": "app", "be.kadeon.sport.watchkitapp": "watch"}
WORK = os.environ.get("WORK", ".")
STATE = os.path.join(WORK, "signing.json")


def token():
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
        os.environ["ASC_KEY_P8"],
        algorithm="ES256",
        headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
    )


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise SystemExit(f"App Store Connect API {method} {path}: HTTP {e.code}\n{detail}")


def sh(*args):
    subprocess.run(args, check=True)


def setup():
    os.makedirs(WORK, exist_ok=True)
    key = os.path.join(WORK, "dist.key")
    csr = os.path.join(WORK, "dist.csr")
    sh("openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", csr,
       "-subj", "/CN=Kadeon Sport CI/O=Kadeon Sport/C=BE")
    with open(csr) as f:
        csr_text = f.read()

    cert = call("POST", "/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": "DISTRIBUTION", "csrContent": csr_text}}})["data"]
    state = {"certificate": cert["id"], "profiles": {}}
    with open(STATE, "w") as f:
        json.dump(state, f)
    with open(os.path.join(WORK, "dist.cer"), "wb") as f:
        f.write(base64.b64decode(cert["attributes"]["certificateContent"]))

    dirs = [os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles"),
            os.path.expanduser("~/Library/Developer/Xcode/UserData/Provisioning Profiles")]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    run = os.environ.get("GITHUB_RUN_ID", str(int(time.time())))
    for identifier, short in APPS.items():
        found = call("GET", f"/bundleIds?filter[identifier]={identifier}&limit=50")["data"]
        match = [b for b in found if b["attributes"]["identifier"] == identifier]
        if not match:
            raise SystemExit(f"Identifiant {identifier} introuvable dans Certificates, Identifiers & Profiles.")
        name = f"Kadeon CI {short} {run}"
        prof = call("POST", "/profiles", {"data": {
            "type": "profiles",
            "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": match[0]["id"]}},
                "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]},
            },
        }})["data"]
        state["profiles"][identifier] = {"id": prof["id"], "name": name}
        with open(STATE, "w") as f:
            json.dump(state, f)
        content = base64.b64decode(prof["attributes"]["profileContent"])
        for d in dirs:
            with open(os.path.join(d, prof["attributes"]["uuid"] + ".mobileprovision"), "wb") as f:
                f.write(content)
    print(json.dumps({k: v["name"] for k, v in state["profiles"].items()}))


def cleanup():
    if not os.path.exists(STATE):
        return
    with open(STATE) as f:
        state = json.load(f)
    for p in state.get("profiles", {}).values():
        try:
            call("DELETE", f"/profiles/{p['id']}")
        except SystemExit as e:
            print(e)
    if state.get("certificate"):
        try:
            call("DELETE", f"/certificates/{state['certificate']}")
        except SystemExit as e:
            print(e)
    print("Certificat et profils temporaires supprimés.")


if __name__ == "__main__":
    {"setup": setup, "cleanup": cleanup}[sys.argv[1]]()
