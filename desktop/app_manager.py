from PyQt6.QtCore import QObject, QTimer, Qt

from desktop.server_thread import ServerThread
from desktop.screens.wbr_title_screen import WBRTitleScreen
from desktop.screens.main_app_window import MainAppWindow


class AppManager(QObject):
    """Manages the full application lifecycle: server, title screens, main window."""

    def __init__(self):
        super().__init__()
        self._cleanup_done = False

        # Components (assigned externally by desktop_main)
        self.server_thread: ServerThread | None = None
        self.wbr_screen: WBRTitleScreen | None = None
        self.main_window: MainAppWindow | None = None

    def show_main_app(self):
        """Called when the title screen chain finishes. Shows the main web app."""
        if self.server_thread and self.server_thread.wait_ready(timeout=10):
            self._launch_browser()
        else:
            # Server not ready yet — poll every 200ms
            self._poll_timer = QTimer(self)
            self._poll_timer.setInterval(200)
            self._poll_timer.timeout.connect(self._check_server_ready)
            self._poll_timer.start()

    def _check_server_ready(self):
        if self.server_thread and self.server_thread._ready.is_set():
            self._poll_timer.stop()
            self._launch_browser()

    def _launch_browser(self):
        port = self.server_thread.port
        self.main_window = MainAppWindow(port)
        self.main_window.closed.connect(self.cleanup)
        self.main_window.show()
        self.main_window.start_loading()

    def cleanup(self):
        if self._cleanup_done:
            return
        self._cleanup_done = True

        if self.main_window:
            self.main_window.close()
            self.main_window = None

        if self.wbr_screen:
            self.wbr_screen.close()
            self.wbr_screen = None

        if self.server_thread:
            self.server_thread.shutdown()
            self.server_thread.join(timeout=3)
            self.server_thread = None

        from PyQt6.QtWidgets import QApplication
        app = QApplication.instance()
        if app:
            app.quit()
