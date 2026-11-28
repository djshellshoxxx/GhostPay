"""Regenerate the dated queue after changing the explicit device/version catalog."""
import csv
import hashlib
from pathlib import Path
from collections import Counter

DIR = Path(__file__).resolve().parent
rows=[]
def put(tier,device,kind,arch,os,browser,version,gate="Confirm installed build",cases="Core",status="Queued"):
    identity=[device,kind,arch,os,browser,version]
    key=hashlib.sha256('|'.join(identity).encode()).hexdigest()[:10].upper()
    rows.append((tier,"GP-"+key,kind,device,arch,os,browser,version,gate,cases,status))

desktop={"Chrome":["158","157","156","155","154"],"Edge":["158","157","156","155","154"],
    "Firefox":["161","160","159","153 ESR"],"Opera":["140","139","138"],"Brave":["1.100","1.99","1.98"]}
mobile=["Safari","Chrome","Firefox","Edge","Brave","Opera"]
def windows():
    for os,arch,tier in [("Windows 11 25H2","x64",0),("Windows 11 24H2","x64",1),("Windows 11 25H2","ARM64",1),
        ("Windows 11 24H2","ARM64",2),("Windows 10 22H2","x64",0),("Windows 10 22H2","x86",1),
        ("Windows Server 2025 Desktop Experience","x64",2),("Windows Server 2022 Desktop Experience","x64",2),
        ("Windows Server 2019 Desktop Experience","x64",2),("Windows Server 2016 Desktop Experience","x64",2)]:
        model="Surface Pro 11" if arch=="ARM64" else "Intel or AMD PC" if "Server" not in os else "Hyper-V guest with GUI"
        kind="Windows tablet" if arch=="ARM64" else "Server VM" if "Server" in os else "Windows PC"
        for b,versions in desktop.items():
            for j,v in enumerate(versions):
                primary=b in ["Edge","Chrome"] and j==0
                priority=tier if primary else max(tier,1 if j<3 else 2)
                gate="Verify x86 OS and browser independently" if arch=="x86" else "Record native/emulated browser architecture" if arch=="ARM64" else "Record OS build and browser bitness"
                if "Server" in os and b not in ["Edge","Chrome"]:gate="Confirm vendor package on Server Desktop Experience"
                put(priority,model,kind,arch,os,b,v,gate)
        put(3,model,kind,arch,os,"Safari","Current","Apple has no current Windows build","—","N/A")
    for os in ["Windows 7 SP1","Windows 8","Windows 8.1","Windows Server 2012","Windows Server 2012 R2"]:
        for arch in (["x64"] if "Server" in os else ["x64","x86"]):
            kind="Server VM" if "Server" in os else "Windows PC"
            for b,v in [("Edge","109"),("Chrome","109"),("Firefox","115 ESR"),("Opera","95"),("Brave","Last installable")]:
                gate="Isolated historical VM; confirm vendor package"
                if b=="Firefox" and "Server" not in os:gate="Legacy OS; record exact maintained 115 ESR patch"
                put(3,"Legacy Windows guest",kind,arch,os,b,v,gate,"Legacy startup")
            for version in ["158","157","156"]:
                put(3,"Legacy Windows guest",kind,arch,os,"Edge",version,"Modern Edge requires a newer Windows version","—","N/A")
            put(3,"Legacy Windows guest",kind,arch,os,"Safari","Current","Apple has no current Windows build","—","N/A")
            if os=="Windows 7 SP1":
                put(3,"Legacy Windows guest",kind,arch,os,"Safari","5.1.7","Historical Windows binary; offline image only","Legacy startup")
def apples():
    for model,arch,oses in [("MacBook Air M1","ARM64",["27","26","15"]),("MacBook Air M3","ARM64",["27","26","15"]),
        ("Mac mini M4","ARM64",["27","26","15"]),("MacBook Pro M4 Pro","ARM64",["27","26","15"]),
        ("MacBook Neo (2026)","ARM64",["27","26"]),("MacBook Pro 16-inch 2019","Intel x64",["26","15"]),
        ("MacBook Air Retina 2020","Intel x64",["15"])]:
        for os in oses:
            for b,versions in {**desktop,"Safari":(["27.x supplied by OS"] if os=="27" else ["27.2","26.x retained image"])}.items():
                for j,v in enumerate(versions):
                    primary=model=="MacBook Air M1" and os=="27" and j==0 and b in ("Safari","Chrome")
                    put(0 if primary else 1 if j==0 else 2,model,"Mac",arch,"macOS "+os,b,v,"Confirm model, OS point release and installed app")
    # New hardware cannot boot releases preceding its launch. Older signed images may be unavailable.
    iphones=["iPhone Duo","iPhone 18 Pro Max","iPhone 18 Pro","iPhone 17e","iPhone 17 Pro Max","iPhone 17 Pro","iPhone 17","iPhone Air","iPhone 16e"]
    for gen, editions in [(16,['',' Plus',' Pro',' Pro Max']),(15,['',' Plus',' Pro',' Pro Max']),(14,['',' Plus',' Pro',' Pro Max']),(13,['',' mini',' Pro',' Pro Max']),(12,['',' mini',' Pro',' Pro Max']),(11,['',' Pro',' Pro Max'])]:
        iphones.extend(f'iPhone {gen}{suffix}' for suffix in editions)
    iphones += ["iPhone SE (2nd generation)","iPhone SE (3rd generation)","iPhone XS","iPhone XS Max","iPhone XR"]
    ipads=[]
    for chip in ["M4","M5"]:
        ipads += [f"iPad Pro {size}-inch ({chip})" for size in (11,13)]
    for size,gens in [("12.9",range(3,7)),("11",range(1,5))]:
        ipads += [f"iPad Pro {size}-inch (gen {gen})" for gen in gens]
    ipads += [f"iPad Air {size}-inch ({chip})" for chip in ("M2","M3","M4") for size in (11,13)]
    ipads += [f"iPad Air (gen {gen})" for gen in (3,4,5)] + [f"iPad (gen {gen})" for gen in (7,8,9,10)]
    ipads += ["iPad (A16)","iPad mini (gen 5)","iPad mini (gen 6)","iPad mini (A17 Pro)","iPad mini (A20 Pro)"]
    for model in iphones+ipads:
        pad=model.startswith("iPad")
        osname="iPadOS" if pad else "iOS"
        if model in ["iPhone XS","iPhone XS Max","iPhone XR","iPad (gen 7)"]: majors=[18]
        elif model in ["iPad (gen 8)","iPad Air (gen 3)","iPad mini (gen 5)","iPad Pro 12.9-inch (gen 3)","iPad Pro 11-inch (gen 1)"]: majors=[26]
        elif model in ["iPhone Duo","iPhone 18 Pro","iPhone 18 Pro Max","iPad mini (A20 Pro)"]: majors=[27]
        else: majors=[27,26]
        for os in majors:
            for b in mobile:
                versions=["OS-matched Safari"] if b=="Safari" else ["Store current","Previous app release","Two app releases back"]
                for j,v in enumerate(versions):
                    primary=model in ["iPhone 15","iPhone 16","iPhone 17","iPad (A16)"] and b=="Safari" and os==27
                    tier=0 if primary else (1 if j==0 and os>=26 else 2)
                    put(tier,model,"Apple tablet" if pad else "Apple phone","ARM64",f"{osname} {os}",b,v,
                        "Verify storefront, minimum OS and retained build; log app and OS separately","Mobile")
def android():
    fleet=[
      ("Samsung Galaxy A15 5G","14 15 16","phone"),("Samsung Galaxy A16 5G","14 15 16","phone"),
      ("Samsung Galaxy A56 5G","15 16 17","phone"),("Samsung Galaxy S23","13 14 15 16","phone"),
      ("Samsung Galaxy S24","14 15 16 17","phone"),("Samsung Galaxy S25","15 16 17","phone"),("Samsung Galaxy S26","16 17","phone"),
      ("Samsung Galaxy Z Fold6","14 15 16","foldable"),("Google Pixel 6a","12 13 14 15 16","phone"),
      ("Google Pixel 7","13 14 15 16 17","phone"),("Google Pixel 8a","14 15 16 17","phone"),
      ("Google Pixel 9","14 15 16 17","phone"),("Google Pixel 10","16 17","phone"),("Google Pixel 9 Pro Fold","14 15 16 17","foldable"),
      ("Xiaomi Redmi Note 13 5G","13 14 15","phone"),("Xiaomi 14","14 15 16","phone"),("Xiaomi 15","15 16 17","phone"),
      ("OPPO Reno12 5G","14 15 16","phone"),("vivo V40","14 15 16","phone"),("OnePlus 12","14 15 16","phone"),
      ("Motorola Moto G Power 5G (2024)","14 15","phone"),("Samsung Galaxy A03 Core","11","Go phone"),
      ("Samsung Galaxy Tab A9+","13 14 15 16","tablet"),("Samsung Galaxy Tab S9","13 14 15 16","tablet"),
      ("Samsung Galaxy Tab S10+","14 15 16 17","tablet"),("Google Pixel Tablet","13 14 15 16 17","tablet"),
      ("Lenovo Tab M10 Plus (3rd gen)","12 13","tablet"),("Xiaomi Pad 6","13 14","tablet")]
    for os in range(10,18):
        fleet += [(f"Android reference AVD ({form})",str(os),form+" emulator") for form in ("phone","tablet")]
    for model,majors,kind in fleet:
        for os in majors.split():
            for b in ["Chrome","Edge","Firefox","Brave","Opera","Samsung Internet"]:
                versions=["158","157","156"] if b in ["Chrome","Edge"] else ["Store current","Previous app release","Two app releases back"]
                for j,v in enumerate(versions):
                    primary=(model,os) in {("Samsung Galaxy A16 5G","15"),("Samsung Galaxy S24","16"),("Xiaomi Redmi Note 13 5G","14"),
                        ("Google Pixel 9","17"),("Samsung Galaxy Tab A9+","15")}
                    priority=0 if primary and j==0 and (b=="Chrome" or ("Samsung" in model and b=="Samsung Internet")) else 1 if j==0 and int(os)>=14 and 'emulator' not in kind else 2
                    put(priority,model,"Android "+kind,"Image ABI" if 'emulator' in kind else "Check device ABI",
                        "Android "+os,b,v,"Verify OEM/region image, device patch date and store eligibility","Mobile")
    for os in range(10,18):
        put(3,"Android phone or tablet","Android hardware","Any","Android "+str(os),"Safari","Current","No official Safari for Android","—","N/A")
def other():
    for model,arch in [("Acer Chromebook Plus 515","x64"),("Lenovo Chromebook Duet 3","ARM64")]:
        for version in ["158","157","156"]:
            put(1,model,"Chromebook",arch,"ChromeOS "+version,"Chrome",version,"Match OS milestone to built-in Chrome","Core")
        for b in ["Edge","Firefox","Brave","Opera"]:
            for v in ["Store current","Previous app release","Two app releases back"]:
                put(2,model,"Chromebook",arch,"ChromeOS, Android app environment",b,v,"Confirm Play Store listing and admin policy for this device","Mobile")
        if arch=="x64":
            for v in ["158","157","156"]:
                put(2,model,"Chromebook",arch,"ChromeOS, Linux container","Edge",v,"Log ChromeOS build and Debian guest version","Core")
    for model,os,b in [("Google TV Streamer 4K","Android TV 14","TV Bro"),("Chromecast with Google TV 4K","Android TV 12","TV Bro"),
      ("NVIDIA Shield TV Pro (2019)","Android TV 11","TV Bro"),("Xiaomi TV Box S (2nd gen)","Google TV; record Android TV build","TV Bro"),
      ("onn. 4K Pro","Google TV; record Android TV build","TV Bro"),("Fire TV Stick 4K Max (2nd gen)","Fire OS 8","Silk"),
      ("Fire TV Stick 4K (1st gen)","Fire OS 6","Silk"),("Fire TV Stick 4K (3rd gen)","Vega OS 2","Store browser"),
      ("Fire HD 10 (13th gen)","Fire OS 8","Silk"),("Apple TV 4K","tvOS 27","Safari"),("Roku Ultra","Roku OS","General-purpose browser")]:
        tv="TV" not in model and model.startswith("Fire HD")
        unavailable=model in ["Apple TV 4K","Roku Ultra"]
        for v in (["Current"] if unavailable else ["Store current","Retained prior build"]):
            put(3 if unavailable else 2,model,"Fire tablet" if tv else "TV box","Verify model ABI",os,b,v,
                "No standard standalone browser lane" if unavailable else "Verify exact OS and officially available TV/tablet app",
                "—" if unavailable else "Mobile" if tv else "TV remote","N/A" if unavailable else "Queued")
    for os in ["Debian 13","Ubuntu 24.04 LTS"]:
        for b,vs in desktop.items():
            for v in vs[:3]:
                put(2,"Linux desktop","Linux PC","x64",os,b,v,"Confirm branded package and installed version")
        put(2,"Linux desktop","Linux PC","x64",os,"Tor Browser","Current stable","Keep default Tor Browser settings; loopback or private lab fixture","Core")
if __name__=="__main__":
    windows();apples();android();other()
    rows.sort(key=lambda r:(r[0],r[2],r[3],r[5],r[6],r[7]))
    assert len(rows)==len(set(row[1] for row in rows)), "Duplicate targets"
    with (DIR/"targets.csv").open("w",encoding="utf-8",newline="") as out:
        w=csv.writer(out);w.writerow(["Priority","Target ID","Form factor","Model or lab image","CPU / ABI","OS target","Browser product","Version target","Availability check","Test cases","Initial state"]);w.writerows([("P"+str(t),*r) for t,*r in rows])
    print(len(rows),Counter(r[0] for r in rows),Counter(r[-1] for r in rows))
