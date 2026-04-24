import os

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QColor,
    QBrush,
    QFont,
    QKeyEvent,
    QPainter,
    QPen,
    QPixmap,
    QRadialGradient,
    QTransform,
)
from PyQt6.QtWidgets import (
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPixmapItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsTextItem,
    QGraphicsView,
)

from desktop.utils.resource import resource_path

NAVY = QColor("#06111f")
ORANGE = QColor("#f5a623")
CYAN = QColor("#5bc0de")
ICE = QColor("#d9ecff")

SHEET_COLS = 10
FRAME_SIZE = 48

FACILITY_FRAME_RANGE = range(25, 41)
FACILITY_REL_X = 0.28
FACILITY_REL_Y = 0.30

SCENE_W, SCENE_H = 1600, 900
FAST_INTRO = os.getenv("IDT_FAST_INTRO", "1") != "0"
TOTAL_DURATION_MS = 3200 if FAST_INTRO else 10000
TICK_MS = 25


class SpaceTitleScreen(QGraphicsView):
    transition_to_next = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._done = False
        self._elapsed = 0

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setFixedSize(SCENE_W, SCENE_H)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        self.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
        self.setStyleSheet("border: none; background: #06111f;")

        self._scene = QGraphicsScene(0, 0, SCENE_W, SCENE_H)
        self.setScene(self._scene)

        stars_pix = QPixmap(resource_path("desktop/assets/backgroundstars.png"))
        if not stars_pix.isNull():
            scaled = stars_pix.scaled(
                SCENE_W,
                SCENE_H,
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation,
            )
            self._stars = self._scene.addPixmap(scaled)
            self._stars.setPos(0, 0)
            self._stars.setZValue(0)
        else:
            self._stars = None
            self._scene.setBackgroundBrush(QBrush(NAVY))

        self._earth_day_frames = self._load_frames("desktop/assets/earthspin-sheet.png")
        self._earth_night_frames = self._load_frames("desktop/assets/earthspin-sheet-citylights.png")
        if not self._earth_night_frames:
            self._earth_night_frames = list(self._earth_day_frames)

        self._frame_idx = 0
        self._total_frames = len(self._earth_day_frames) or 1
        self._earth_scale = 5.0

        self._atmosphere = QGraphicsEllipseItem(-300, -300, 600, 600)
        atmosphere_gradient = QRadialGradient(0, 0, 300)
        atmosphere_gradient.setColorAt(0.0, QColor(55, 135, 255, 80))
        atmosphere_gradient.setColorAt(0.55, QColor(10, 72, 160, 38))
        atmosphere_gradient.setColorAt(1.0, QColor(0, 0, 0, 0))
        self._atmosphere.setBrush(QBrush(atmosphere_gradient))
        self._atmosphere.setPen(QPen(Qt.PenStyle.NoPen))
        self._atmosphere.setOpacity(0.7)
        self._atmosphere.setZValue(1)
        self._scene.addItem(self._atmosphere)

        self._earth_day_item = QGraphicsPixmapItem()
        self._earth_day_item.setTransformationMode(Qt.TransformationMode.FastTransformation)
        self._earth_day_item.setZValue(2)
        self._scene.addItem(self._earth_day_item)

        self._earth_night_item = QGraphicsPixmapItem()
        self._earth_night_item.setTransformationMode(Qt.TransformationMode.FastTransformation)
        self._earth_night_item.setOpacity(0.0)
        self._earth_night_item.setZValue(3)
        self._scene.addItem(self._earth_night_item)

        self._marker = QGraphicsEllipseItem(-4, -4, 8, 8)
        self._marker.setBrush(QBrush(ORANGE))
        self._marker.setPen(QPen(Qt.PenStyle.NoPen))
        self._marker.setOpacity(0.0)
        self._marker.setZValue(5)
        self._scene.addItem(self._marker)

        glow_grad = QRadialGradient(0, 0, 22)
        glow_grad.setColorAt(0, QColor(245, 166, 35, 170))
        glow_grad.setColorAt(1, QColor(245, 166, 35, 0))
        self._glow = QGraphicsEllipseItem(-22, -22, 44, 44)
        self._glow.setBrush(QBrush(glow_grad))
        self._glow.setPen(QPen(Qt.PenStyle.NoPen))
        self._glow.setOpacity(0.0)
        self._glow.setZValue(4)
        self._scene.addItem(self._glow)

        ring_pen = QPen(CYAN, 1.5)
        ring_pen.setCosmetic(True)
        self._target_ring = QGraphicsEllipseItem(-20, -20, 40, 40)
        self._target_ring.setBrush(QBrush(Qt.BrushStyle.NoBrush))
        self._target_ring.setPen(ring_pen)
        self._target_ring.setOpacity(0.0)
        self._target_ring.setZValue(5)
        self._scene.addItem(self._target_ring)

        line_pen = QPen(CYAN, 1.2)
        line_pen.setCosmetic(True)
        self._target_h = QGraphicsLineItem(-28, 0, 28, 0)
        self._target_h.setPen(line_pen)
        self._target_h.setOpacity(0.0)
        self._target_h.setZValue(5)
        self._scene.addItem(self._target_h)

        self._target_v = QGraphicsLineItem(0, -28, 0, 28)
        self._target_v.setPen(line_pen)
        self._target_v.setOpacity(0.0)
        self._target_v.setZValue(5)
        self._scene.addItem(self._target_v)

        self._location_chip = QGraphicsRectItem(0, 0, 252, 38)
        self._location_chip.setBrush(QBrush(QColor(5, 20, 33, 220)))
        chip_pen = QPen(QColor(91, 192, 222, 160), 1.0)
        chip_pen.setCosmetic(True)
        self._location_chip.setPen(chip_pen)
        self._location_chip.setOpacity(0.0)
        self._location_chip.setZValue(6)
        self._scene.addItem(self._location_chip)

        self._location_text = QGraphicsTextItem("FACILITY-01 // INGEST // LIVE")
        self._location_text.setDefaultTextColor(ICE)
        self._location_text.setFont(QFont("Consolas", 12, QFont.Weight.Bold))
        self._location_text.setOpacity(0.0)
        self._location_text.setZValue(7)
        self._scene.addItem(self._location_text)

        self._status_text = QGraphicsTextItem("PIXEL ORBIT ACTIVE  //  TARGET ACQUISITION ONLINE")
        self._status_text.setDefaultTextColor(QColor(217, 236, 255, 180))
        self._status_text.setFont(QFont("Consolas", 11))
        self._status_text.setPos(64, SCENE_H - 76)
        self._status_text.setZValue(8)
        self._scene.addItem(self._status_text)

        self._brand_text = QGraphicsTextItem("INFERENCE DIGITAL TWIN")
        self._brand_text.setDefaultTextColor(QColor(51, 251, 211, 180))
        self._brand_text.setFont(QFont("Comfortaa", 13, QFont.Weight.Bold))
        self._brand_text.setPos(SCENE_W - 330, 58)
        self._brand_text.setZValue(8)
        self._scene.addItem(self._brand_text)

        self._scanlines = QGraphicsRectItem(0, 0, SCENE_W, SCENE_H)
        self._scanlines.setBrush(self._build_scanline_brush())
        self._scanlines.setPen(QPen(Qt.PenStyle.NoPen))
        self._scanlines.setOpacity(0.28)
        self._scanlines.setZValue(9)
        self._scene.addItem(self._scanlines)

        self._overlay = QGraphicsRectItem(0, 0, SCENE_W, SCENE_H)
        self._overlay.setBrush(QBrush(NAVY))
        self._overlay.setPen(QPen(Qt.PenStyle.NoPen))
        self._overlay.setOpacity(0.0)
        self._overlay.setZValue(10)
        self._scene.addItem(self._overlay)

        self._update_earth_frame()

        self._timer = QTimer(self)
        self._timer.setInterval(TICK_MS)
        self._timer.timeout.connect(self._tick)

    def _load_frames(self, relative_path: str) -> list[QPixmap]:
        sheet = QPixmap(resource_path(relative_path))
        frames: list[QPixmap] = []
        if sheet.isNull():
            return frames

        rows = sheet.height() // FRAME_SIZE
        for row in range(rows):
            for col in range(SHEET_COLS):
                x = col * FRAME_SIZE
                y = row * FRAME_SIZE
                if x + FRAME_SIZE > sheet.width() or y + FRAME_SIZE > sheet.height():
                    continue
                frame = sheet.copy(x, y, FRAME_SIZE, FRAME_SIZE)
                image = frame.toImage()
                if image.pixelColor(FRAME_SIZE // 2, FRAME_SIZE // 2).alpha() > 10:
                    frames.append(frame)
        return frames

    def _build_scanline_brush(self) -> QBrush:
        pattern = QPixmap(8, 8)
        pattern.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pattern)
        painter.fillRect(0, 0, 8, 1, QColor(255, 255, 255, 18))
        painter.fillRect(0, 4, 8, 1, QColor(0, 0, 0, 24))
        painter.end()
        return QBrush(pattern)

    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()
        self._done = False
        self._elapsed = 0
        self._frame_idx = 0
        self._earth_scale = 5.0
        self._earth_day_item.setOpacity(1.0)
        self._earth_night_item.setOpacity(0.0)
        self._set_marker_opacity(0.0)
        self._status_text.setOpacity(0.55)
        self._brand_text.setOpacity(0.45)
        self._overlay.setOpacity(0.0)
        self._update_earth_frame()
        self._timer.start()

    def _center_on_screen(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = (geo.width() - self.width()) // 2 + geo.x()
            y = (geo.height() - self.height()) // 2 + geo.y()
            self.move(x, y)

    def _tick(self):
        self._elapsed += TICK_MS
        t = min(1.0, self._elapsed / TOTAL_DURATION_MS)

        if t < 0.52:
            if self._elapsed % 95 < TICK_MS:
                self._frame_idx = (self._frame_idx + 1) % self._total_frames
        elif t < 0.82:
            if self._elapsed % 175 < TICK_MS:
                self._frame_idx = (self._frame_idx + 1) % self._total_frames
        elif self._elapsed % 260 < TICK_MS:
            self._frame_idx = (self._frame_idx + 1) % self._total_frames

        if t < 0.48:
            self._earth_scale = 5.0
        elif t < 0.86:
            zoom_t = (t - 0.48) / 0.38
            ease = zoom_t * zoom_t * (3.0 - 2.0 * zoom_t)
            self._earth_scale = 5.0 + ease * 31.0
        else:
            settle_t = (t - 0.86) / 0.14
            self._earth_scale = 36.0 + min(1.0, settle_t) * 3.0

        night_mix = 0.0
        if t > 0.55:
            night_t = min(1.0, (t - 0.55) / 0.2)
            night_mix = night_t * night_t * (3.0 - 2.0 * night_t)

        if self._stars:
            self._stars.setOpacity(1.0 - night_mix * 0.45)

        self._atmosphere.setOpacity(0.58 + night_mix * 0.22)
        self._earth_day_item.setOpacity(1.0 - night_mix * 0.72)
        self._earth_night_item.setOpacity(0.1 + night_mix * 0.9)

        self._update_earth_frame()

        facility_visible = self._frame_idx in FACILITY_FRAME_RANGE
        marker_strength = 0.0
        if t > 0.32 and facility_visible:
            pulse = 0.64 + 0.36 * ((self._elapsed % 900) / 900.0)
            marker_strength = pulse if t < 0.9 else max(0.0, 1.0 - (t - 0.9) / 0.1)
            self._position_marker(marker_strength)
        else:
            self._set_marker_opacity(0.0)

        self._status_text.setOpacity(0.55 + marker_strength * 0.35)
        self._brand_text.setOpacity(0.45 + marker_strength * 0.35)

        if t >= 0.9:
            fade_t = (t - 0.9) / 0.1
            self._overlay.setOpacity(min(1.0, fade_t))

        if self._elapsed >= TOTAL_DURATION_MS:
            self._finish()

    def _update_earth_frame(self):
        if not self._earth_day_frames:
            return

        frame_index = self._frame_idx % self._total_frames
        self._earth_day_item.setPixmap(self._earth_day_frames[frame_index])
        if self._earth_night_frames:
            self._earth_night_item.setPixmap(self._earth_night_frames[frame_index % len(self._earth_night_frames)])
        self._position_earth()

    def _position_earth(self):
        scale = self._earth_scale
        display_size = FRAME_SIZE * scale

        if scale > 8.0:
            cx = SCENE_W * 0.48 - FACILITY_REL_X * display_size
            cy = SCENE_H * 0.51 - FACILITY_REL_Y * display_size
        else:
            cx = (SCENE_W - display_size) / 2
            cy = (SCENE_H - display_size) / 2

        transform = QTransform.fromScale(scale, scale)
        self._earth_day_item.setPos(cx, cy)
        self._earth_night_item.setPos(cx, cy)
        self._earth_day_item.setTransform(transform)
        self._earth_night_item.setTransform(transform)

        center_x = cx + display_size * 0.5
        center_y = cy + display_size * 0.5
        self._atmosphere.setPos(center_x, center_y)

    def _set_marker_opacity(self, opacity: float):
        self._marker.setOpacity(opacity)
        self._glow.setOpacity(opacity * 0.78)
        self._target_ring.setOpacity(opacity * 0.92)
        self._target_h.setOpacity(opacity * 0.82)
        self._target_v.setOpacity(opacity * 0.82)
        self._location_chip.setOpacity(opacity * 0.9)
        self._location_text.setOpacity(opacity)

    def _position_marker(self, strength: float):
        scale = self._earth_scale
        display_size = FRAME_SIZE * scale
        earth_pos = self._earth_day_item.pos()

        mx = earth_pos.x() + FACILITY_REL_X * display_size
        my = earth_pos.y() + FACILITY_REL_Y * display_size

        self._marker.setPos(mx, my)
        self._glow.setPos(mx, my)
        self._target_ring.setPos(mx, my)
        self._target_h.setPos(mx, my)
        self._target_v.setPos(mx, my)

        marker_scale = max(1.0, scale / 7.5)
        transform = QTransform.fromScale(marker_scale, marker_scale)
        self._marker.setTransform(transform)
        self._glow.setTransform(transform)
        self._target_ring.setTransform(transform)
        self._target_h.setTransform(transform)
        self._target_v.setTransform(transform)

        chip_x = min(SCENE_W - 320, mx + 42)
        chip_y = max(92, my - 26)
        self._location_chip.setRect(0, 0, 252, 38)
        self._location_chip.setPos(chip_x, chip_y)
        self._location_text.setPos(chip_x + 14, chip_y + 6)

        self._set_marker_opacity(strength)

    def _finish(self):
        if self._done:
            return
        self._done = True
        self._timer.stop()
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
