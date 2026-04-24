import os

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QColor,
    QFont,
    QKeyEvent,
    QLinearGradient,
    QPainter,
    QPen,
    QPixmap,
    QRadialGradient,
)
from PyQt6.QtWidgets import (
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)

from desktop.utils.resource import resource_path

NAVY = QColor("#06111f")
DEEP = QColor("#030b15")
ORANGE = QColor("#f5a623")
CYAN = QColor("#5bc0de")
ICE = QColor("#d9ecff")

FAST_INTRO = os.getenv("IDT_FAST_INTRO", "1") != "0"
DISPLAY_MS = 1200 if FAST_INTRO else 4000
FADE_IN_MS = 550 if FAST_INTRO else 1000
FADE_STEPS = 40


class WBRTitleScreen(QWidget):
    transition_to_next = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._done = False
        self._stars = self._build_star_field()

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setFixedSize(1500, 860)
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("background: transparent;")

        root = QVBoxLayout(self)
        root.setContentsMargins(110, 88, 110, 88)
        root.setSpacing(24)
        root.addStretch(1)

        hero = QHBoxLayout()
        hero.setSpacing(56)
        hero.setAlignment(Qt.AlignmentFlag.AlignCenter)

        icon_panel = QFrame()
        icon_panel.setFixedSize(250, 250)
        icon_panel.setStyleSheet(
            "QFrame {"
            "background: rgba(10, 22, 40, 0.78);"
            "border: 1px solid rgba(91, 192, 222, 0.34);"
            "border-radius: 40px;"
            "}"
        )
        icon_layout = QVBoxLayout(icon_panel)
        icon_layout.setContentsMargins(24, 24, 24, 24)
        icon_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._icon = QLabel()
        self._icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_pix = QPixmap(resource_path("desktop/assets/wattbit_icon.png"))
        if not icon_pix.isNull():
            self._icon.setPixmap(
                icon_pix.scaled(
                    172,
                    172,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.FastTransformation,
                )
            )
        icon_layout.addWidget(self._icon)

        hero.addWidget(icon_panel, 0, Qt.AlignmentFlag.AlignCenter)

        text_wrap = QWidget()
        text_layout = QVBoxLayout(text_wrap)
        text_layout.setContentsMargins(0, 0, 0, 0)
        text_layout.setSpacing(14)

        self._eyebrow = QLabel("CALGARY LOCK // LOCAL WORLD MODEL")
        self._eyebrow.setStyleSheet(
            f"color: rgba({CYAN.red()}, {CYAN.green()}, {CYAN.blue()}, 210);"
            "font-family: 'Consolas', 'Courier New', monospace;"
            "font-size: 18px;"
            "font-weight: 700;"
            "letter-spacing: 5px;"
            "text-transform: uppercase;"
        )

        self._title = QLabel("WATT-BIT INTELLIGENCE")
        self._title.setStyleSheet(
            f"color: {ICE.name()};"
            "font-family: 'Bahnschrift SemiBold', 'Segoe UI', sans-serif;"
            "font-size: 68px;"
            "font-weight: 800;"
            "letter-spacing: 3px;"
        )

        self._accent = QFrame()
        self._accent.setFixedHeight(3)
        self._accent.setFixedWidth(360)
        self._accent.setStyleSheet(
            f"background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {ORANGE.name()}, stop:1 {CYAN.name()});"
            "border-radius: 1px;"
        )

        self._subtitle = QLabel("INFERENCE DIGITAL TWIN")
        self._subtitle.setStyleSheet(
            f"color: {CYAN.name()};"
            "font-family: 'Consolas', 'Courier New', monospace;"
            "font-size: 26px;"
            "font-weight: 700;"
            "letter-spacing: 8px;"
        )

        self._tagline = QLabel("Simulate before you spend.")
        self._tagline.setStyleSheet(
            "color: rgba(217, 236, 255, 0.84);"
            "font-family: 'Segoe UI', sans-serif;"
            "font-size: 22px;"
        )

        self._support = QLabel("Desktop inference infrastructure modeling with a Calgary-centered world intro.")
        self._support.setWordWrap(True)
        self._support.setMaximumWidth(760)
        self._support.setStyleSheet(
            "color: rgba(217, 236, 255, 0.62);"
            "font-family: 'Segoe UI', sans-serif;"
            "font-size: 17px;"
            "line-height: 1.45;"
        )

        text_layout.addWidget(self._eyebrow)
        text_layout.addWidget(self._title)
        text_layout.addWidget(self._accent)
        text_layout.addWidget(self._subtitle)
        text_layout.addWidget(self._tagline)
        text_layout.addWidget(self._support)
        hero.addWidget(text_wrap, 1)

        root.addLayout(hero)

        self._footer = QLabel("Watt-Bit Intelligence")
        self._footer.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._footer.setStyleSheet(
            "color: rgba(217, 236, 255, 0.42);"
            "font-family: 'Consolas', 'Courier New', monospace;"
            "font-size: 13px;"
            "letter-spacing: 4px;"
            "text-transform: uppercase;"
        )
        root.addWidget(self._footer)
        root.addStretch(1)

        self._opacity_effect = QGraphicsOpacityEffect(self)
        self._opacity_effect.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity_effect)

        self._fade_step = 0
        self._fade_timer = QTimer(self)
        self._fade_timer.setInterval(max(1, FADE_IN_MS // FADE_STEPS))
        self._fade_timer.timeout.connect(self._fade_tick)

        self._auto_timer = QTimer(self)
        self._auto_timer.setSingleShot(True)
        self._auto_timer.setInterval(DISPLAY_MS)
        self._auto_timer.timeout.connect(self._finish)

    def _build_star_field(self) -> list[tuple[int, int, int]]:
        stars: list[tuple[int, int, int]] = []
        for index in range(48):
            x = 90 + (index * 137) % 1320
            y = 70 + (index * 89) % 700
            size = 2 if index % 5 else 4
            stars.append((x, y, size))
        return stars

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        background = QLinearGradient(0, 0, 0, self.height())
        background.setColorAt(0.0, NAVY)
        background.setColorAt(0.55, QColor("#08192c"))
        background.setColorAt(1.0, DEEP)
        painter.fillRect(self.rect(), background)

        glow = QRadialGradient(self.width() * 0.26, self.height() * 0.48, 260)
        glow.setColorAt(0.0, QColor(245, 166, 35, 70))
        glow.setColorAt(0.55, QColor(91, 192, 222, 40))
        glow.setColorAt(1.0, QColor(0, 0, 0, 0))
        painter.fillRect(self.rect(), glow)

        painter.setPen(QPen(QColor(91, 192, 222, 16), 1))
        for x in range(0, self.width(), 44):
            painter.drawLine(x, 0, x, self.height())
        for y in range(0, self.height(), 44):
            painter.drawLine(0, y, self.width(), y)

        painter.setPen(Qt.PenStyle.NoPen)
        for x, y, size in self._stars:
            color = QColor(217, 236, 255, 180 if size == 4 else 120)
            painter.setBrush(color)
            painter.drawEllipse(x, y, size, size)
            if size == 4:
                painter.drawRect(x - 3, y + 1, 10, 1)
                painter.drawRect(x + 1, y - 3, 1, 10)

        vignette = QRadialGradient(self.width() * 0.5, self.height() * 0.45, self.width() * 0.58)
        vignette.setColorAt(0.72, QColor(0, 0, 0, 0))
        vignette.setColorAt(1.0, QColor(0, 0, 0, 110))
        painter.fillRect(self.rect(), vignette)

        painter.end()
        super().paintEvent(event)

    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()
        self._done = False
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
            Qt.Key.Key_Return,
            Qt.Key.Key_Enter,
            Qt.Key.Key_Space,
            Qt.Key.Key_Escape,
        ):
            self._finish()
        else:
            super().keyPressEvent(event)

    def mousePressEvent(self, event):
        self._finish()
