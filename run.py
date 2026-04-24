from app.main import app


HOST = "127.0.0.1"
PORT = 8000
FORGE_URL = f"http://{HOST}:{PORT}/forge"


def _open_browser_after_startup() -> None:
    import time
    import webbrowser

    time.sleep(1.2)
    webbrowser.open(FORGE_URL)


if __name__ == "__main__":
    import threading
    import uvicorn

    print(f"  The Forge → {FORGE_URL}")

    threading.Thread(target=_open_browser_after_startup, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT)
