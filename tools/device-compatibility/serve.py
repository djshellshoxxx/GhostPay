"""Serve a built GhostPay snapshot and its same-origin QA page (Python 3.9+)."""
import argparse
import hashlib
import json
import ssl
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from mimetypes import guess_type
from pathlib import Path
from urllib.parse import urlsplit, unquote

HERE = Path(__file__).resolve().parent

def build_id(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Use a build directory without symbolic links")
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            digest.update(relative.encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()

class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, build, identity, **kwargs):
        self.build, self.identity = build, identity
        super().__init__(*args, **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        if route == "/qa/build.json":
            data, mime = json.dumps(self.identity).encode(), "application/json"
        else:
            is_qa = route.startswith("/qa/")
            root = HERE / "web" if is_qa else self.build
            relative = route[4:] if is_qa else route.lstrip("/")
            if any(part.startswith(".") for part in Path(relative).parts) or "\\" in relative:
                return self.send_error(404)
            path = (root / (relative or "index.html")).resolve()
            if root not in path.parents or not path.is_file():
                return self.send_error(404)
            data = path.read_bytes()
            mime = guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "connect-src 'self'; frame-ancestors 'self'; form-action 'none'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

def make_server(root, host, port, revision):
    root = root.resolve()
    if not (root / "index.html").is_file() or not (root / "assets").is_dir():
        raise ValueError("Select the built apps/web/dist directory")
    metadata = json.loads((root / "build-info.json").read_text())
    if metadata.get("commit") != revision:
        raise ValueError("The supplied source revision differs from build-info.json")
    identity = {"source": revision, "tree_sha256": build_id(root)}
    return ThreadingHTTPServer((host, port), partial(Handler, build=root, identity=identity))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, default=HERE / "snapshot")
    parser.add_argument("--revision", default=None, help="Source commit of a replacement build")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--cert", type=Path)
    parser.add_argument("--key", type=Path)
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("Provide the certificate and key together")
    if args.bind not in ("127.0.0.1", "localhost") and not args.cert:
        parser.error("LAN devices need HTTPS with a certificate trusted by the device")
    bundled = args.build.resolve() == (HERE / "snapshot").resolve()
    if not args.revision and not bundled:
        parser.error("Supply --revision for an alternate build")
    info = json.loads((HERE / "snapshot-id.json").read_text()) if bundled else {}
    if bundled and build_id(args.build) != info["tree_sha256"]:
        parser.error("The bundled snapshot digest changed")
    server = make_server(args.build, args.bind, args.port, args.revision or info["source"])
    if args.cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.cert, args.key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f'Open {"https" if args.cert else "http"}://{args.bind}:{server.server_port}/qa/', flush=True)
    server.serve_forever()
