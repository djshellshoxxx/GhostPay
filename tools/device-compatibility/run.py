"""Drive the same QA page in a fresh desktop browser or at selected viewport sizes."""
import argparse
import json
import os
import platform
import re
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve import HERE, build_id, make_server

SIZES = {"desktop":(1366,768), "desktop-hd":(1920,1080), "phone-small":(320,568),
         "phone":(390,844),"phone-landscape":(844,390),"fold-cover":(360,800),
         "fold-open":(720,840),"tablet":(768,1024),"tablet-landscape":(1024,768),
         "tv-720p":(1280,720),"tv-1080p":(1920,1080)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["chromium","firefox","webkit"], required=True)
    parser.add_argument("--channel", choices=["msedge","chrome"], help="Installed branded desktop browser")
    parser.add_argument("--executable", type=Path, help="Optional path to a compatible browser binary")
    parser.add_argument("--expect-major", type=int, help="Reject a browser with a different automation-reported major")
    parser.add_argument("--sizes", default="desktop", help="Comma-separated names or all: " + ", ".join(SIZES))
    parser.add_argument("--output", type=Path, required=True, help="New JSON file for this attempt")
    parser.add_argument("--build", type=Path, default=HERE/"snapshot")
    parser.add_argument("--revision", help="Required source commit for a replacement build")
    args = parser.parse_args()
    if args.channel and (args.executable or args.engine != "chromium"):
        parser.error("--channel requires Chromium and cannot accompany --executable")
    if args.output.exists():
        parser.error("Choose a new output path to preserve earlier runs")
    sizes = list(SIZES) if args.sizes == "all" else args.sizes.split(",")
    if not sizes or len(sizes)!=len(set(sizes)) or set(sizes)-set(SIZES):
        parser.error("Use unique named sizes from --help")
    bundled = args.build.resolve() == (HERE/"snapshot").resolve()
    original = json.loads((HERE/"snapshot-id.json").read_text()) if bundled else {}
    if bundled and build_id(args.build)!=original["tree_sha256"]:
        parser.error("Bundled snapshot identity mismatch")
    revision = args.revision or original.get("source")
    if not revision or not re.fullmatch(r'[a-fA-F0-9]{40}',revision):
        parser.error("Supply the complete Git source SHA")
    if bundled and revision != original["source"]:
        parser.error("The supplied commit conflicts with the bundled snapshot")
    server = make_server(args.build,"127.0.0.1",0,revision)
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    report = {"utc":datetime.now(timezone.utc).isoformat(),"host":platform.platform(),
              "architecture":platform.machine(),"engine":args.engine,"channel":args.channel,
              "automation":"Playwright desktop process; viewport only","source":revision,
              "tree_sha256":build_id(args.build),"sessions":[]}
    try:
        with sync_playwright() as pw:
            launch = {}
            if args.executable: launch["executable_path"]=str(args.executable.resolve())
            if args.channel: launch["channel"]=args.channel
            for name in sizes:
                w,h = SIZES[name]
                browser = None
                try:
                    browser = getattr(pw,args.engine).launch(**launch)
                    observed = browser.version
                    if args.expect_major is not None and int(observed.split(".")[0]) != args.expect_major:
                        raise ValueError(f"Expected major {args.expect_major}; observed {observed}")
                    if report.get("browser_version",observed) != observed:
                        raise ValueError("Browser version changed between sizes")
                    report["browser_version"] = observed
                    context = browser.new_context(viewport={"width":w,"height":h},locale="en-US",service_workers="block")
                    page=context.new_page()
                    page.goto(f"http://127.0.0.1:{server.server_port}/qa/")
                    page.locator("#run").click()
                    page.locator("#save").wait_for(state="visible",timeout=140000)
                    result=json.loads(page.locator("#result").text_content())
                    if result["build"]["tree_sha256"]!=report["tree_sha256"]:
                        raise ValueError("Served snapshot digest differs")
                    report["sessions"].append({"viewport":name,"requested":[w,h],"result":result})
                except Exception as exc:
                    report["sessions"].append({"viewport":name,"requested":[w,h],"error":str(exc)[:900]})
                finally:
                    if browser:
                        try: browser.close()
                        except Exception: pass
    except Exception as exc:
        report["setup_error"]=str(exc)[:1200]
    finally:
        server.shutdown(); server.server_close()
        report["status"]="pass" if len(report["sessions"])==len(sizes) and all(
            s.get("result",{}).get("status")=="pass" for s in report["sessions"]) and "setup_error" not in report else "failed-or-blocked"
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open("x",encoding="utf-8") as out:
            json.dump(report,out,indent=2,ensure_ascii=False)
    print(f'{report["status"]} | {report.get("browser_version","launch unavailable")} | {args.output}')
    return 0 if report["status"]=="pass" else 1

if __name__=="__main__":
    sys.exit(main())
