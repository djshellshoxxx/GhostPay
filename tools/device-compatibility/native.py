"""Run the compatibility page via an installed W3C desktop driver (Python 3.9+)."""
import argparse
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from serve import HERE, make_server, build_id

PRODUCTS = {
    "edge": ("msedgedriver","MicrosoftEdge","ms:edgeOptions"),
    "chrome": ("chromedriver","chrome","goog:chromeOptions"),
    "firefox": ("geckodriver","firefox","moz:firefoxOptions"),
    "safari": ("safaridriver","safari",None),
}

def call(url, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read())["value"]
    except urllib.error.HTTPError as exc:
        detail = json.loads(exc.read()).get("value",{})
        raise RuntimeError(str(detail.get("message",detail))[:700]) from exc

def run(args):
    binary, product, options_key = PRODUCTS[args.browser]
    driver = args.driver or shutil.which(binary)
    if not driver and args.browser == "edge" and os.environ.get("EDGEWEBDRIVER"):
        driver = str(Path(os.environ["EDGEWEBDRIVER"]) / "msedgedriver.exe")
    if not driver:
        raise ValueError(f"Install a matching {binary} or pass --driver")
    info = json.loads((args.build / "build-info.json").read_text())
    sha = info["commit"]
    if len(sha)!=40 or any(c not in "0123456789abcdef" for c in sha):
        raise ValueError("Build with GP_COMMIT set to the full source commit")
    if args.build.resolve()==(HERE/"snapshot").resolve():
        original=json.loads((HERE/"snapshot-id.json").read_text())
        if original["source"]!=sha or original["tree_sha256"]!=build_id(args.build):
            raise ValueError("Bundled snapshot identity mismatch")
    report = {"suite":"ghostpay-native/1","utc":datetime.now(timezone.utc).isoformat(),
              "os":platform.platform(),"machine":platform.machine(),"source":sha,
              "os_edition":platform.win32_edition() if sys.platform=="win32" else platform.mac_ver()[0],
              "target_browser":args.browser,"target_major":args.expect_major,"tree_sha256":build_id(args.build)}
    server = make_server(args.build,"127.0.0.1",0,sha)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0)); port=sock.getsockname()[1]
    base=f"http://127.0.0.1:{port}"
    session=None; proc=None
    try:
        cmd = [driver, "-p",str(port)] if args.browser=="safari" else [driver, "--port",str(port)] if args.browser=="firefox" else [driver,f"--port={port}"]
        proc = subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            if proc.poll() is not None: raise RuntimeError("WebDriver exited before it was ready")
            try:
                call(base+"/status");break
            except (OSError,RuntimeError): time.sleep(.2)
        else: raise TimeoutError("Driver startup timed out")
        caps = {"browserName":product}
        if options_key:
            options={"args":["-headless"] if args.browser=="firefox" else ["--headless=new","--lang=en-US"]}
            if args.binary: options["binary"]=str(args.binary.resolve())
            caps[options_key]=options
        negotiated=call(base+"/session","POST",{"capabilities":{"alwaysMatch":caps}})
        session=base+"/session/"+negotiated["sessionId"]
        actual=negotiated["capabilities"]
        report["capabilities"]={key:actual.get(key) for key in ["browserName","browserVersion","platformName"]}
        if actual["browserName"].lower()!=product.lower():raise ValueError("Driver returned a different product")
        if args.expect_major and actual["browserVersion"].split(".")[0]!=str(args.expect_major):
            raise ValueError("Installed browser does not match requested major")
        call(session+"/url","POST",{"url":f"http://127.0.0.1:{server.server_port}/qa/"})
        element=call(session+"/element","POST",{"using":"css selector","value":"#run"})
        element_id=element["element-6066-11e4-a52e-4f735466cecf"]
        call(session+"/element/"+element_id+"/click","POST",{})
        for _ in range(300):
            raw=call(session+"/execute/sync","POST",{"script":"return document.getElementById('result').textContent;","args":[]})
            if raw:break
            time.sleep(.5)
        else: raise TimeoutError("The browser produced no result in 150 seconds")
        report["result"]=json.loads(raw)
        if report["result"]["build"]["tree_sha256"]!=report["tree_sha256"]:raise ValueError("Served build differs")
        report["status"]=report["result"]["status"]
    except Exception as exc:
        report["status"]="blocked"; report["error"]=str(exc)[:800]
    finally:
        if session:
            try: call(session,"DELETE")
            except Exception: pass
        if proc:
            proc.terminate()
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired: proc.kill();proc.wait()
        server.shutdown();server.server_close()
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--browser",choices=PRODUCTS,required=True)
    p.add_argument("--driver",help="Path to the matching vendor driver")
    p.add_argument("--binary",type=Path,help="Optional browser binary for pinned installations")
    p.add_argument("--expect-major",type=int)
    p.add_argument("--build",type=Path,default=HERE/"snapshot")
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    if args.binary and args.browser=="safari": p.error("Safari uses the installed system browser")
    if args.output.exists():p.error("Choose a new output path")
    try: report=run(args)
    except Exception as exc: report={"target_browser":args.browser,"status":"blocked","error":str(exc)[:800]}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open("x",encoding="utf-8") as out:json.dump(report,out,indent=2)
    print(args.browser,report["status"],report.get("capabilities",{}),report.get("error",""))
    sys.exit(0 if report["status"]=="pass" else 1)
