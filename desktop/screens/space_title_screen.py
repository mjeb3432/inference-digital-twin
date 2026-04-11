from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QRectF, QPointF
from PyQt6.QtGui import (
    QPixmap, QColor, QPainter, QPen, QBrush, QRadialGradient,
    QTransform, QKeyEvent,
)
from PyQt6.QtWidgets import (
    QGraphicsView, QGraphicsScene, QGraphicsPixmapItem,
    QGraphicsEllipseItem, QGraphicsRectItem,
)

from desktop.utils.resource import resource_path

# Watt-Bit theme colours
NAVY = QColor("#0a1628")
ORANGE = QColor("#f5a623")
CYAN = QColor("#5bc0de")

# Sprite-sheet layout (480x480, 10 columns, ~96 frames)
SHEET_COLS = 10
FRAME_SIZE = 48  # px per frame

# Calgary is visible when North America faces the camera.
# In a 96-frame rotation that's roughly frames 25-40.
# Within the earth frame, Calgary sits at about (0.28, 0.30) relative coords.
CALGARY_FRAME_RANGE = range(25, 41)
CALGARY_REL_X = 0.28
CALGARY_REL_Y = 0.30

SCENE_W, SCENE_H = 1600, 900
TOTAL_DURATION_MS = 10_000  # total animation length
TICK_MS = 25  # ~40 fps


class SpaceTitleScreen(QGraphicsView):
    transition_to_next = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._done = False
        self._elapsed = 0

        # Window setup
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setFixedSize(SCENE_W, SCENE_H)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        self.setStyleSheet("border: none;")

        # Scene
        self._scene = QGraphicsScene(0, 0, SCENE_W, SCENE_H)
        self.setScene(self._scene)

        # -- Stars background --
        stars_pix = QPixmap(resource_path("desktop/assets/backgroundstars.png"))
        if not stars_pix.isNull():
            # Tile the stars across the scene
            scaled = stars_pix.scaled(
                SCENE_W, SCENE_H,
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation,
            )
            self._stars = self._scene.addPixmap(scaled)
            self._stars.setPos(0, 0)
            self._stars.setZValue(0)
        else:
            self._stars = None
            self._scene.setBackgroundBrush(QBrush(NAVY))

        # -- Earth sprite frames --
        sheet = QPixmap(resource_path("desktop/assets/earthspin-sheet.png"))
        self._earth_frames: list[QPixmap] = []
        if not sheet.isNull():
            rows = sheet.height() // FRAME_SIZE
            for r in range(rows):
                for c in range(SHEET_COLS):
                    x, y = c * FRAME_SIZE, r * FRAME_SIZE
                    if x + FRAME_SIZE <= sheet.width() and y + FRAME_SIZE <= sheet.height():
                        frame = sheet.copy(x, y, FRAME_SIZE, FRAME_SIZE)
                        # Skip fully transparent frames
                        img = frame.toImage()
                        if img.pixelColor(FRAME_SIZE // 2, FRAME_SIZE // 2).alpha() > 10:
                            self._earth_frames.append(frame)

        self._frame_idx = 0
        self._total_frames = len(self._earth_frames) or 1

        # Earth pixmap item — start at 5x scale (240px), centered
        self._earth_scale = 5.0
        self._earth_item = QGraphicsPixmapItem()
        self._earth_item.setTransformationMode(Qt.TransformationMode.SmoothTransformation)
        self._earth_item.setZValue(1)
        self._scene.addItem(self._earth_item)
        self._update_earth_frame()

        # -- Calgary marker (orange pulsing dot) --
        self._marker = QGraphicsEllipseItem(-4, -4, 8, 8)
        self._marker.setBrush(QBrush(ORANGE))
        self._marker.setPen(QPen(Qt.PenStyle.NoPen))
        self._marker.setZValue(2)
        self._marker.setOpacity(0.0)
        self._scene.addItem(self._marker)

        # -- Glow around marker --
        glow_grad = QRadialGradient(0, 0, 16)
        glow_grad.setColorAt(0, QColor(245, 166, 35, 120))
        glow_grad.setColorAt(1, QColor(245, 166, 35, 0))
        self._glow = QGraphicsEllipseItem(-16, -16, 32, 32)
        self._glow.setBrush(QBrush(glow_grad))
        self._glow.setPen(QPen(Qt.PenStyle.NoPen))
        self._glow.setZValue(2)
        self._glow.setOpacity(0.0)
        self._scene.addItem(self._glow)

        # -- Dark overlay for fade-out --
        self._overlay = QGraphicsRectItem(0, 0, SCENE_W, SCENE_H)
        self._overlay.setBrush(QBrush(NAVY))
        self._overlay.setPen(QPen(Qt.PenStyle.NoPen))
        self._overlay.setZValue(10)
        self._overlay.setOpacity(0.0)
        self._scene.addItem(self._overlay)

        # -- Animation timer --
        self._timer = QTimer(self)
        self._timer.setInterval(TICK_MS)
        self._timer.timeout.connect(self._tick)

    # ------------------------------------------------------------------ show
    def showEvent(self, event):
        super().showEvent(event)
        self._center_on_screen()
        self._elapsed = 0
        self._timer.start()

    def _center_on_screen(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = (geo.width() - self.width()) // 2 + geo.x()
            y = (geo.height() - self.height()) // 2 + geo.y()
            self.move(x, y)

    # ----------------------------------------------------------- animation
    def _tick(self):
        self._elapsed += TICK_MS
        t = self._elapsed / TOTAL_DURATION_MS  # 0..1 normalised progress

        # Phase 1 (0-60%): Earth rotates at normal speed
        # Phase 2 (60-90%): Zoom in toward Calgary, rotation slows
        # Phase 3 (90-100%): Fade to dark navy

        # --- Earth rotation ---
        if t < 0.6:
            # Normal rotation: advance every 6 ticks (~150ms per frame, ~6.7fps)
            if self._elapsed % 150 < TICK_MS:
                self._frame_idx = (self._frame_idx + 1) % self._total_frames
        elif t < 0.9:
            # Slow rotation during zoom
            if self._elapsed % 400 < TICK_MS:
                self._frame_idx = (self._frame_idx + 1) % self._total_frames

        self._update_earth_frame()

        # --- Zoom effect ---
        if t < 0.6:
            self._earth_scale = 5.0
        elif t < 0.9:
            # Ease-in-out zoom from 5x to 40x
            zoom_t = (t - 0.6) / 0.3
            ease = zoom_t * zoom_t * (3.0 - 2.0 * zoom_t)  # smoothstep
            self._earth_scale = 5.0 + ease * 35.0
        else:
            self._earth_scale = 40.0

        self._position_earth()

        # --- Calgary marker ---
        calgary_visible = self._frame_idx in CALGARY_FRAME_RANGE
        if t > 0.2 and calgary_visible:
            # Pulse opacity between 0.5 and 1.0
            pulse = 0.75 + 0.25 * ((self._elapsed % 800) / 800.0 * 2.0 - 1.0) ** 2
            self._marker.setOpacity(pulse)
            self._glow.setOpacity(pulse * 0.7)
            self._position_marker()
        else:
            self._marker.setOpacity(0.0)
            self._glow.setOpacity(0.0)

        # --- Stars fade during zoom ---
        if self._stars and t > 0.6:
            star_opacity = max(0.0, 1.0 - (t - 0.6) / 0.2)
            self._stars.setOpacity(star_opacity)

        # --- Fade to navy ---
        if t >= 0.9:
            fade_t = (t - 0.9) / 0.1
            self._overlay.setOpacity(min(1.0, fade_t))

        # --- Done ---
        if self._elapsed >= TOTAL_DURATION_MS:
            self._finish()

    def _update_earth_frame(self):
        if not self._earth_frames:
            return
        pix = self._earth_frames[self._frame_idx % self._total_frames]
        self._earth_item.setPixmap(pix)
        self._position_earth()

    def _position_earth(self):
        """Scale and center the earth in the scene (or offset toward Calgary during zoom)."""
        s = self._earth_scale
        display_size = FRAME_SIZE * s

        if self._earth_scale > 8.0:
            # During zoom: offset so Calgary position ends up near center
            cx = SCENE_W / 2 - CALGARY_REL_X * display_size
            cy = SCENE_H / 2 - CALGARY_REL_Y * display_size
        else:
            # Centered
            cx = (SCENE_W - display_size) / 2
            cy = (SCENE_H - display_size) / 2

        self._earth_item.setPos(cx, cy)
        self._earth_item.setTransform(QTransform.fromScale(s, s))

    def _position_marker(self):
        """Place the Calgary marker relative to the earth's current position/scale."""
        s = self._earth_scale
        display_size = FRAME_SIZE * s
        earth_pos = self._earth_item.pos()

        mx = earth_pos.x() + CALGARY_REL_X * display_size
        my = earth_pos.y() + CALGARY_REL_Y * display_size
        self._marker.setPos(mx, my)
        self._glow.setPos(mx, my)

        # Scale marker with zoom
        marker_scale = max(1.0, s / 5.0)
        self._marker.setTransform(QTransform.fromScale(marker_scale, marker_scale))
        self._glow.setTransform(QTransform.fromScale(marker_scale, marker_scale))

    # ----------------------------------------------------------- finish
    def _finish(self):
        if self._done:
            return
        self._done = True
        self._timer.stop()
        self.hide()
        self.transition_to_next.emit()

    # ----------------------------------------------------------- input
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
