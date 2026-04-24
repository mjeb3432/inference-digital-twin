import os

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
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

NAVY  = QColor("#06111f")
DEEP  = QColor("#030b15")
ORANGE = QColor("#f5a623")
CYAN  = QColor("#5bc0de")
ICE   = QColor("#d9ecff")

FAST_INTRO  = os.getenv("IDT_FAST_INTRO", "1") != "0"
DISPLAY_MS  = 4500  if FAST_INTRO else 9000
FADE_IN_MS  = 700   if FAST_INTRO else 1400
FADE_STEPS  = 40
TICK_MS     = 16    # ~60 fps


class WBRTitleScreen(QWidget):
    transition_to_next = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._done         = False
        self._star_field   = self._build_star_field()
        self._scan_y       = -80        # animated scan line Y position
        self._progress     = 0.0        # 0.0 → 1.0, drives bottom progress bar
        self._elapsed_ms   = 0

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

        # Icon panel
        icon_panel = QFrame()
        icon_panel.setFixedSize(250, 250)
        icon_panel.setStyleSheet(
            "QFrame {"
            "background: rgba(10, 22, 40, 0.82);"
            "border: 1px solid rgba(91, 192, 222, 0.38);"
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
                    172, 172,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.FastTransformation,
                )
            )
        icon_layout.addWidget(self._icon)
        hero.addWidget(icon_panel, 0, Qt.AlignmentFlag.AlignCenter)

        # Text block
        text_wrap   = QWidget()
        text_layout = QVBoxLayout(text_wrap)
        text_layout.setContentsMargins(0, 0, 0, 0)
        text_layout.setSpacing(14)

        self._title = QLabel("WATT-BIT INTELLIGENCE")
        self._title.setStyleSheet(
            f"color:{ICE.name()};"
            "font-family:'Bahnschrift SemiBold','Segoe UI',sans-serif;"
            "font-size:68px; font-weight:800; letter-spacing:3px;"
        )

        self._accent = QFrame()
        self._accent.setFixedHeight(3)
        self._accent.setFixedWidth(360)
        self._accent.setStyleSheet(
            f"background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
            f"stop:0 {ORANGE.name()},stop:1 {CYAN.name()});"
            "border-radius:1px;"
        )

        self._subtitle = QLabel("INFERENCE DIGITAL TWIN")
        self._subtitle.setStyleSheet(
            f"color:{CYAN.name()};"
            "font-family:'Consolas','Courier New',monospace;"
            "font-size:26px; font-weight:700; letter-spacing:8px;"
        )

        self._tagline = QLabel("Simulate before you spend.")
        self._tagline.setStyleSheet(
            "color:rgba(217,236,255,0.84);"
            "font-family:'Segoe UI',sans-serif;"
            "font-size:22px;"
        )

        self._support = QLabel(
            "Physics-informed AI infrastructure simulation.\n"
            "Full provenance chain. Real-time benchmarks."
        )
        self._support.setWordWrap(True)
        self._support.setMaximumWidth(760)
        self._support.setStyleSheet(
            "color:rgba(217,236,255,0.62);"
            "font-family:'Segoe UI',sans-serif;"
            "font-size:17px; line-height:1.5;"
        )

        text_layout.addWidget(self._title)
        text_layout.addWidget(self._accent)
        text_layout.addWidget(self._subtitle)
        text_layout.addWidget(self._tagline)
        text_layout.addWidget(self._support)
        hero.addWidget(text_wrap, 1)
        root.addLayout(hero)

        self._footer = QLabel("WATT-BIT  //  SIMPLY SILICON")
        self._footer.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._footer.setStyleSheet(
            "color:rgba(217,236,255,0.42);"
            "font-family:'Consolas','Courier New',monospace;"
            "font-size:13px; letter-spacing:4px;"
        )
        root.addWidget(self._footer)

        self._prompt = QLabel("[ PRESS ENTER OR CLICK TO CONTINUE ]")
        self._prompt.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._prompt.setStyleSheet(
            "color:rgba(245,166,35,0.72);"
            "font-family:'Consolas','Courier New',monospace;"
            "font-size:12px; letter-spacing:5px;"
        )
        root.addWidget(self._prompt)
        root.addStretch(1)

        # Fade-in effect
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self._opacity_effect.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity_effect)

        self._fade_step  = 0
        self._fade_timer = QTimer(self)
        self._fade_timer.setInterval(max(1, FADE_IN_MS // FADE_STEPS))
        self._fade_timer.timeout.connect(self._fade_tick)

        # Scan line + progress bar animation
        self._anim_timer = QTimer(self)
        self._anim_timer.setInterval(TICK_MS)
        self._anim_timer.timeout.connect(self._anim_tick)

    # ------------------------------------------------------------------ #
    # Star field (deterministic, no random)                                #
    # ------------------------------------------------------------------ #

    def _build_star_field(self) -> list[tuple[int, int, int]]:
        stars: list[tuple[int, int, int]] = []
        for i in range(60):
            x    = 90  + (i * 137) % 1320
            y    = 70  + (i * 89)  % 700
            size = 2 if i % 5 else 4
            stars.append((x, y, size))
        return stars

    # ------------------------------------------------------------------ #
    # Animation tick                                                        #
    # ------------------------------------------------------------------ #

    def _anim_tick(self):
        self._elapsed_ms += TICK_MS

        # Scan line: one sweep every 2.8 s, wraps and restarts
        period    = 2800
        phase     = (self._elapsed_ms % period) / period
        self._scan_y  = int(phase * (self.height() + 160)) - 80

        # Progress bar fills over the full display duration
        self._progress = min(1.0, self._elapsed_ms / DISPLAY_MS)

        self.update()

    # ------------------------------------------------------------------ #
    # Paint                                                                 #
    # ------------------------------------------------------------------ #

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        w, h = self.width(), self.height()

        # ---- background ----
        bg = QLinearGradient(0, 0, 0, h)
        bg.setColorAt(0.0,  NAVY)
        bg.setColorAt(0.55, QColor("#08192c"))
        bg.setColorAt(1.0,  DEEP)
        painter.fillRect(self.rect(), bg)

        # ---- amber glow (left, behind icon) ----
        glow = QRadialGradient(w * 0.26, h * 0.48, 340)
        glow.setColorAt(0.0, QColor(245, 166, 35, 60))
        glow.setColorAt(0.4, QColor(91, 192, 222, 28))
        glow.setColorAt(1.0, QColor(0, 0, 0, 0))
        painter.fillRect(self.rect(), glow)

        # ---- grid ----
        painter.setPen(QPen(QColor(91, 192, 222, 13), 1))
        for x in range(0, w, 44):
            painter.drawLine(x, 0, x, h)
        for y in range(0, h, 44):
            painter.drawLine(0, y, w, y)

        # ---- stars ----
        painter.setPen(Qt.PenStyle.NoPen)
        for sx, sy, size in self._star_field:
            alpha = 180 if size == 4 else 110
            painter.setBrush(QColor(217, 236, 255, alpha))
            painter.drawEllipse(sx, sy, size, size)
            if size == 4:
                painter.setBrush(QColor(217, 236, 255, 60))
                painter.drawRect(sx - 4, sy + 1, 12, 1)
                painter.drawRect(sx + 1, sy - 4, 1, 12)

        # ---- HUD corner brackets ----
        pen_corner = QPen(QColor(245, 166, 35, 130), 1)
        painter.setPen(pen_corner)
        csize, cmargin = 22, 14
        # top-left
        painter.drawLine(cmargin, cmargin, cmargin + csize, cmargin)
        painter.drawLine(cmargin, cmargin, cmargin, cmargin + csize)
        # top-right
        painter.drawLine(w - cmargin, cmargin, w - cmargin - csize, cmargin)
        painter.drawLine(w - cmargin, cmargin, w - cmargin, cmargin + csize)
        # bottom-left
        painter.drawLine(cmargin, h - cmargin, cmargin + csize, h - cmargin)
        painter.drawLine(cmargin, h - cmargin, cmargin, h - cmargin - csize)
        # bottom-right
        painter.drawLine(w - cmargin, h - cmargin, w - cmargin - csize, h - cmargin)
        painter.drawLine(w - cmargin, h - cmargin, w - cmargin, h - cmargin - csize)

        # ---- amber scan line (sweeps top → bottom) ----
        sy = self._scan_y
        if -60 < sy < h + 60:
            alphas = [0, 8, 20, 45, 90, 150, 90, 45, 20, 8, 0]
            for offset, alpha in enumerate(alphas):
                row = sy - len(alphas) // 2 + offset
                if 0 <= row < h:
                    painter.setPen(QPen(QColor(245, 166, 35, alpha), 1))
                    painter.drawLine(0, row, w, row)

        # ---- progress bar ----
        bar_h      = 3
        bar_y      = h - 26
        bar_margin = 80
        bar_w      = w - bar_margin * 2
        fill_w     = int(bar_w * self._progress)

        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(91, 192, 222, 18))
        painter.drawRect(bar_margin, bar_y, bar_w, bar_h)

        if fill_w > 0:
            fill_grad = QLinearGradient(bar_margin, 0, bar_margin + bar_w, 0)
            fill_grad.setColorAt(0.0, QColor(245, 166, 35, 230))
            fill_grad.setColorAt(0.5, QColor(91,  192, 222, 200))
            fill_grad.setColorAt(1.0, QColor(245, 166, 35, 180))
            painter.setBrush(QBrush(fill_grad))
            painter.drawRect(bar_margin, bar_y, fill_w, bar_h)

        # ---- vignette ----
        vig = QRadialGradient(w * 0.5, h * 0.45, w * 0.58)
        vig.setColorAt(0.72, QColor(0, 0, 0, 0))
        vig.setColorAt(1.0,  QColor(0, 0, 0, 120))
        painter.setBrush(QBrush(vig))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRect(self.rect())

        painter.end()
        super().paintEvent(event)

    # ------------------------------------------------------------------ #
    # Lifecycle                                                             #
    # ------------------------------------------------------------------ #

    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()
        self._done        = False
        self._fade_step   = 0
        self._elapsed_ms  = 0
        self._scan_y      = -80
        self._progress    = 0.0
        self._opacity_effect.setOpacity(0.0)
        self._fade_timer.start()
        self._anim_timer.start()

    def _center_on_screen(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = (geo.width()  - self.width())  // 2 + geo.x()
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
        self._anim_timer.stop()
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
