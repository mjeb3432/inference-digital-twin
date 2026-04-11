from PyQt6.QtCore import Qt, QUrl, QTimer, pyqtSignal
from PyQt6.QtGui import QIcon
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import QMainWindow, QLabel, QVBoxLayout, QWidget

from desktop.utils.resource import resource_path

NAVY = "#0a1628"


class MainAppWindow(QMainWindow):
    closed = pyqtSignal()

    def __init__(self, port: int, parent=None):
        super().__init__(parent)
        self._port = port

        self.setWindowTitle("Inference Digital Twin - The Forge")
        self.setWindowIcon(QIcon(resource_path("desktop/assets/wattbit_icon.png")))
        self.resize(1600, 900)
        self.setStyleSheet(f"background-color: {NAVY};")

        # Loading placeholder shown until the web page is ready
        self._loading = QWidget()
        self._loading.setStyleSheet(f"background-color: {NAVY};")
        loading_layout = QVBoxLayout(self._loading)
        loading_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl = QLabel("Loading The Forge...")
        lbl.setStyleSheet(
            "color: #5bc0de; font-size: 24px; "
            "font-family: 'Consolas', 'Courier New', monospace;"
        )
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        loading_layout.addWidget(lbl)
        self.setCentralWidget(self._loading)

        # Browser view (created but not shown yet)
        self._browser = QWebEngineView()
        self._browser.loadFinished.connect(self._on_load_finished)

        self._url = f"http://127.0.0.1:{port}/forge"

        # Retry timer for loading the page
        self._retry_timer = QTimer(self)
        self._retry_timer.setInterval(500)
        self._retry_timer.timeout.connect(self._try_load)
        self._retries = 0
        self._max_retries = 60  # 30 seconds

    def start_loading(self):
        self._try_load()

    def _try_load(self):
        self._retries += 1
        self._browser.setUrl(QUrl(self._url))
        if not self._retry_timer.isActive():
            self._retry_timer.start()

    def _on_load_finished(self, ok: bool):
        if ok:
            self._retry_timer.stop()
            self.setCentralWidget(self._browser)
        elif self._retries >= self._max_retries:
            self._retry_timer.stop()
            lbl = QLabel(
                f"Failed to connect to server at {self._url}\n"
                "Please restart the application."
            )
            lbl.setStyleSheet("color: #B91C1C; font-size: 18px;")
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.setCentralWidget(lbl)

    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()

    def _center_on_screen(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = (geo.width() - self.width()) // 2 + geo.x()
            y = (geo.height() - self.height()) // 2 + geo.y()
            self.move(x, y)

    def closeEvent(self, event):
        self.closed.emit()
        event.accept()
