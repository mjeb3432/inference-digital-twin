"""
Inference Digital Twin — Desktop Application Entry Point

Launches the FastAPI server in a background thread and displays
a cinematic Watt-Bit opening sequence before showing the web app
in an embedded browser view.
"""
import sys
import os


def _setup_frozen_paths():
    """When running from a PyInstaller bundle, set env vars so the
    FastAPI app can find its contracts, artifacts, and database."""
    if not getattr(sys, "frozen", False):
        return

    bundle_dir = sys._MEIPASS
    exe_dir = os.path.dirname(sys.executable)

    # Database lives next to the .exe (persistent, user-writable)
    os.environ.setdefault(
        "IDT_DATABASE_PATH",
        os.path.join(exe_dir, "inference_digital_twin.db"),
    )
    # Contracts and artifacts are inside the bundle
    os.environ.setdefault(
        "IDT_CONTRACTS_DIR",
        os.path.join(bundle_dir, "contracts", "v1"),
    )
    os.environ.setdefault(
        "IDT_ARTIFACTS_PATH",
        os.path.join(bundle_dir, "artifacts", "coefficients.v1.json"),
    )


def main():
    _setup_frozen_paths()

    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtGui import QIcon
    from PyQt6.QtCore import Qt

    from desktop.utils.resource import resource_path
    from desktop.server_thread import ServerThread
    from desktop.app_manager import AppManager
    from desktop.screens.space_title_screen import SpaceTitleScreen
    from desktop.screens.wbr_title_screen import WBRTitleScreen

    app = QApplication(sys.argv)
    app.setApplicationName("Inference Digital Twin")
    app.setQuitOnLastWindowClosed(False)
    app.setWindowIcon(QIcon(resource_path("desktop/assets/wattbit_icon.ico")))

    manager = AppManager()

    # Start the FastAPI server in the background (runs during title screens)
    manager.server_thread = ServerThread()
    manager.server_thread.start()

    # Create title screens
    manager.space_screen = SpaceTitleScreen()
    manager.wbr_screen = WBRTitleScreen()

    # Chain: space → wbr → main app
    manager.space_screen.transition_to_next.connect(manager.wbr_screen.show)
    manager.wbr_screen.transition_to_next.connect(manager.show_main_app)

    app.aboutToQuit.connect(manager.cleanup, Qt.ConnectionType.DirectConnection)

    # Launch the opening sequence
    manager.space_screen.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
