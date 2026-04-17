import os

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QPixmap, QColor, QFont, QPainter, QKeyEvent
from PyQt6.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QGraphicsOpacityEffect,
)

from desktop.utils.resource import resource_path

NAVY = QColor("#0a1628")
CYAN = QColor("#5bc0de")

FAST_INTRO = os.getenv("IDT_FAST_INTRO", "1") != "0"
DISPLAY_MS = 900 if FAST_INTRO else 4000
FADE_IN_MS = 450 if FAST_INTRO else 1000
FADE_STEPS = 40    # opacity steps during fade


class WBRTitleScreen(QWidget):
    transition_to_next = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._done = False

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setStyleSheet(f"background-color: {NAVY.name()};")

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(20)

        # Logo
        self._logo_label = QLabel()
        self._logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo_pix = QPixmap(resource_path("desktop/assets/WBRtitle.png"))
        if not logo_pix.isNull():
            # Scale to 90% of image size, max 1200px wide
            w = min(logo_pix.width(), 1200)
            scaled = logo_pix.scaledToWidth(
                int(w * 0.9),
                Qt.TransformationMode.SmoothTransformation,
            )
            self._logo_label.setPixmap(scaled)
            self.setFixedSize(
                max(scaled.width() + 80, 800),
                scaled.height() + 160,
            )
        else:
            self._logo_label.setText("WATT-BIT RESEARCH")
            self._logo_label.setStyleSheet("color: #f5a623; font-size: 48px;")
            self.setFixedSize(800, 500)

        layout.addWidget(self._logo_label)

        # Subtitle
        self._subtitle = QLabel("INFERENCE DIGITAL TWIN")
        self._subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._subtitle.setStyleSheet(
            f"color: {CYAN.name()}; font-size: 22px; "
            "font-family: 'Consolas', 'Courier New', monospace; "
            "letter-spacing: 6px; font-weight: bold;"
        )
        layout.addWidget(self._subtitle)

        # Opacity effect for fade-in
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self._opacity_effect.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity_effect)

        self._fade_step = 0
        self._fade_timer = QTimer(self)
        self._fade_timer.setInterval(FADE_IN_MS // FADE_STEPS)
        self._fade_timer.timeout.connect(self._fade_tick)

        self._auto_timer = QTimer(self)
        self._auto_timer.setSingleShot(True)
        self._auto_timer.setInterval(DISPLAY_MS)
        self._auto_timer.timeout.connect(self._finish)

    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()
        self._fade_step = 0
        self._opacity_effect.setOpacity(0.0)
        self._fade_timer.start()
        self._auto_timer.start()

    def _center_on_screen(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = (geo.width() - self.width()) // 2 + geo.x()
            y = (geo.height() - self.height()) // 2 + geo.y()
            self.move(x, y)

    def _fade_tick(self):
        self._fade_step += 1
        opacity = min(1.0, self._fade_step / FADE_STEPS)
        self._opacity_effect.setOpacity(opacity)
        if opacity >= 1.0:
            self._fade_timer.stop()

    def _finish(self):
        if self._done:
            return
        self._done = True
        self._fade_timer.stop()
        self._auto_timer.stop()
        self.hide()
        self.transition_to_next.emit()

    def keyPressEvent(self, event: QKeyEvent):
        if event.key() in (
            Qt.Key.Key_Return, Qt.Key.Key_Enter,
            Qt.Key.Key_Space, Qt.Key.Key_Escape,
        ):
            self._finish()
        else:
            super().keyPressEvent(event)

    def mousePressEvent(self, event):
        self._finish()
