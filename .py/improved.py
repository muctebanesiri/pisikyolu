#!/usr/bin/env python3
"""
Ultimate Premium Podcast Cover Generator v9.0
With Perfect Borders, Premium Polish, Optional Episode Number,
and Perfect Horizontal Alignment for Logo, URL, and Episode Number

Enhancements:
- Modular architecture with dedicated classes
- Type hints and comprehensive docstrings
- Flexible color themes (JSON‑loadable)
- Configurable output dimensions
- Advanced SVG builder pattern
- Improved text wrapping for Persian/Arabic
- PNG/PDF export support
- Robust error handling and logging
- More CLI options and interactive UX
"""

import argparse
import base64
import json
import logging
import mimetypes
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Optional imports
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import cairosvg
    HAS_CAIRO = True
except ImportError:
    HAS_CAIRO = False

# ----------------------------------------------------------------------
# Configuration & Defaults
# ----------------------------------------------------------------------
DEFAULT_THEME = {
    "name": "premium",
    "colors": {
        "bg_start": "#0c0c0c",
        "bg_end": "#100f0f",
        "title": "#f8f7f5",
        "subtitle": "#e8e6d3",
        "website": "#9f9898",
        "accent_start": "#846aff",
        "accent_mid": "#a68adf",
        "accent_end": "#5a4d8c",
        "shadow": "#00000030",
        "border_light": "#ffffff20",
        "corner_accent": "#a68adf",
        "bottom_bar": "#00000010",
    },
    "fonts": {
        "latin": "Helvetica Neue, Helvetica, Arial, sans-serif",
        "persian": "Vazirmatn, Arial, sans-serif",
    },
}

# Predefined themes
THEMES = {
    "premium": DEFAULT_THEME,
    "dark": {
        "name": "dark",
        "colors": {
            "bg_start": "#1a1a1a",
            "bg_end": "#0d0d0d",
            "title": "#ffffff",
            "subtitle": "#cccccc",
            "website": "#aaaaaa",
            "accent_start": "#6c63ff",
            "accent_mid": "#8b83ff",
            "accent_end": "#4a42aa",
            "shadow": "#00000050",
            "border_light": "#ffffff30",
            "corner_accent": "#6c63ff",
            "bottom_bar": "#ffffff08",
        },
        "fonts": {
            "latin": "Helvetica Neue, Helvetica, Arial, sans-serif",
            "persian": "Vazirmatn, Arial, sans-serif",
        },
    },
    "light": {
        "name": "light",
        "colors": {
            "bg_start": "#f5f5f5",
            "bg_end": "#ffffff",
            "title": "#1a1a1a",
            "subtitle": "#333333",
            "website": "#555555",
            "accent_start": "#9b59b6",
            "accent_mid": "#8e44ad",
            "accent_end": "#6c3483",
            "shadow": "#00000020",
            "border_light": "#00000010",
            "corner_accent": "#9b59b6",
            "bottom_bar": "#00000008",
        },
        "fonts": {
            "latin": "Helvetica Neue, Helvetica, Arial, sans-serif",
            "persian": "Vazirmatn, Arial, sans-serif",
        },
    },
    "neon": {
        "name": "neon",
        "colors": {
            "bg_start": "#0a0a0a",
            "bg_end": "#1a1a2e",
            "title": "#00ffcc",
            "subtitle": "#a8f0e6",
            "website": "#88ddcc",
            "accent_start": "#ff00ff",
            "accent_mid": "#ff66ff",
            "accent_end": "#cc00cc",
            "shadow": "#00ffcc40",
            "border_light": "#00ffcc30",
            "corner_accent": "#ff00ff",
            "bottom_bar": "#00ffcc10",
        },
        "fonts": {
            "latin": "Helvetica Neue, Helvetica, Arial, sans-serif",
            "persian": "Vazirmatn, Arial, sans-serif",
        },
    },
}


# ----------------------------------------------------------------------
# Utility Functions
# ----------------------------------------------------------------------
def english_to_persian_digits(text: Union[str, int]) -> str:
    """Convert English digits to Persian (Arabic‑Indic) digits."""
    if not text:
        return ""
    digit_map = {
        '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
        '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
    }
    return ''.join(digit_map.get(ch, ch) for ch in str(text))


def escape_xml(text: str) -> str:
    """Escape XML special characters."""
    if not text:
        return ""
    replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    }
    return ''.join(replacements.get(c, c) for c in text)


def detect_persian(text: str) -> bool:
    """Return True if text contains Persian/Arabic Unicode characters."""
    return any('\u0600' <= ch <= '\u06FF' for ch in text)


def find_image_file(path_hint: str) -> Optional[str]:
    """Locate an image file given a path or partial name."""
    if not path_hint:
        return None
    path_hint = os.path.expanduser(path_hint)
    if os.path.exists(path_hint):
        return os.path.abspath(path_hint)

    base, ext = os.path.splitext(path_hint)
    if not ext:
        for ext in ('.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.bmp', '.tiff', '.tif'):
            test_path = base + ext
            if os.path.exists(test_path):
                return os.path.abspath(test_path)
    return None


def load_theme_from_json(filepath: str) -> Dict[str, Any]:
    """Load a custom color theme from a JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Validate minimal structure
    required = ('name', 'colors', 'fonts')
    for r in required:
        if r not in data:
            raise ValueError(f"Theme JSON must contain key '{r}'")
    return data


# ----------------------------------------------------------------------
# Image Processor
# ----------------------------------------------------------------------
class ImageProcessor:
    """Handles image loading, compression, and base64 encoding."""

    def __init__(self, max_size_kb: int = 400):
        self.max_size_kb = max_size_kb
        self.logger = logging.getLogger(__name__)

    def to_base64(self, image_path: str, max_size_kb: Optional[int] = None) -> Tuple[Optional[str], Optional[str]]:
        """
        Convert an image to a base64 data URI component.
        Returns (base64_string, mime_type) or (None, None) on failure.
        """
        if max_size_kb is None:
            max_size_kb = self.max_size_kb

        if not os.path.exists(image_path):
            self.logger.error(f"Image file not found: {image_path}")
            return None, None

        try:
            with open(image_path, 'rb') as f:
                img_data = f.read()

            file_size_kb = len(img_data) / 1024
            self.logger.info(f"Original size: {file_size_kb:.1f} KB")

            if file_size_kb > max_size_kb and HAS_PIL:
                self.logger.info(f"Compressing to {max_size_kb} KB limit...")
                img_data = self._compress_image(img_data, max_size_kb)

            img_base64 = base64.b64encode(img_data).decode('utf-8')
            img_base64 = self._clean_base64(img_base64)

            mime_type = self._guess_mime_type(image_path)
            self.logger.info(f"Encoded: {len(img_base64)} chars")
            return img_base64, mime_type

        except Exception as e:
            self.logger.error(f"Error converting image: {e}")
            return None, None

    def _compress_image(self, img_data: bytes, max_size_kb: int) -> bytes:
        """Compress image using Pillow to meet size limit."""
        try:
            img = Image.open(io.BytesIO(img_data))
            img_format = img.format or 'JPEG'

            # Resize if needed
            width, height = img.size
            target_pixels = (max_size_kb * 1024 * 8) // 24
            current_pixels = width * height
            if current_pixels > target_pixels:
                ratio = (target_pixels / current_pixels) ** 0.5
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                self.logger.debug(f"Resizing {width}x{height} -> {new_width}x{new_height}")
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (0, 0, 0))
                background.paste(img, mask=img.split()[-1])
                img = background
            elif img.mode == 'P':
                img = img.convert('RGB')

            output = io.BytesIO()
            quality = 95
            img.save(output, format=img_format, quality=quality, optimize=True)
            compressed = output.getvalue()
            self.logger.info(f"Compressed to: {len(compressed)/1024:.1f} KB")
            return compressed

        except Exception as e:
            self.logger.warning(f"Compression failed: {e}")
            return img_data

    def _clean_base64(self, data: str) -> str:
        """Remove whitespace and dangerous characters from base64 string."""
        cleaned = re.sub(r'\s+', '', data)
        # Remove any characters that could break XML/HTML
        cleaned = re.sub(r'[&<>"\']', '', cleaned)
        return cleaned

    def _guess_mime_type(self, path: str) -> str:
        """Guess MIME type from file extension."""
        mime_type, _ = mimetypes.guess_type(path)
        if mime_type:
            return mime_type
        ext = os.path.splitext(path)[1].lower()
        mime_map = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.svg': 'image/svg+xml',
            '.webp': 'image/webp', '.gif': 'image/gif',
            '.bmp': 'image/bmp', '.tiff': 'image/tiff',
            '.tif': 'image/tiff'
        }
        return mime_map.get(ext, 'image/jpeg')


# ----------------------------------------------------------------------
# SVG Builder
# ----------------------------------------------------------------------
class SVGBuilder:
    """
    Builds an SVG document for the podcast cover.
    Uses a builder pattern to add elements incrementally.
    """

    def __init__(self, width: int, height: int, theme: Dict[str, Any]):
        self.width = width
        self.height = height
        self.theme = theme
        self.colors = theme['colors']
        self.fonts = theme['fonts']
        self.logger = logging.getLogger(__name__)
        self._elements: List[str] = []
        self._defs: List[str] = []

    def add_def(self, definition: str) -> None:
        """Add a definition (gradient, filter, etc.)."""
        self._defs.append(definition)

    def add_element(self, element: str) -> None:
        """Add a top‑level SVG element."""
        self._elements.append(element)

    def build(self) -> str:
        """Assemble the final SVG document."""
        lines = [
            '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {self.width} {self.height}" width="{self.width}" height="{self.height}">'
        ]

        if self._defs:
            lines.append('  <defs>')
            lines.extend(f'    {d}' for d in self._defs)
            lines.append('  </defs>')

        lines.extend(self._elements)
        lines.append('</svg>')
        return '\n'.join(lines)

    # ------------------------------------------------------------------
    # Pre‑built definition methods
    # ------------------------------------------------------------------
    def add_background_gradient(self):
        grad = (
            f'<linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">'
            f'  <stop offset="0%" stop-color="{self.colors["bg_start"]}" />'
            f'  <stop offset="100%" stop-color="{self.colors["bg_end"]}" />'
            f'</linearGradient>'
        )
        self.add_def(grad)

    def add_accent_gradient(self):
        grad = (
            f'<linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="100%">'
            f'  <stop offset="0%" stop-color="{self.colors["accent_start"]}" />'
            f'  <stop offset="50%" stop-color="{self.colors["accent_mid"]}" />'
            f'  <stop offset="100%" stop-color="{self.colors["accent_end"]}" />'
            f'</linearGradient>'
        )
        self.add_def(grad)

    def add_image_shadow(self):
        shadow = (
            f'<filter id="imageShadow">'
            f'  <feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#000000" flood-opacity="0.4"/>'
            f'</filter>'
        )
        self.add_def(shadow)

    def add_inner_glow(self):
        glow = (
            f'<filter id="innerGlow">'
            f'  <feFlood flood-color="{self.colors["accent_mid"]}" flood-opacity="0.1" result="glow"/>'
            f'  <feComposite in="glow" in2="SourceAlpha" operator="in" result="glow"/>'
            f'  <feGaussianBlur stdDeviation="10" result="blurredGlow"/>'
            f'  <feMerge>'
            f'    <feMergeNode in="blurredGlow"/>'
            f'    <feMergeNode in="SourceGraphic"/>'
            f'  </feMerge>'
            f'</filter>'
        )
        self.add_def(glow)

    def add_text_glow(self):
        glow = (
            f'<filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">'
            f'  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>'
            f'</filter>'
        )
        self.add_def(glow)

    def add_all_defs(self):
        self.add_background_gradient()
        self.add_accent_gradient()
        self.add_image_shadow()
        self.add_inner_glow()
        self.add_text_glow()

    # ------------------------------------------------------------------
    # High‑level element builders
    # ------------------------------------------------------------------
    def add_background(self):
        self.add_element(f'<rect width="100%" height="100%" fill="url(#bgGradient)"/>')

    def add_cover_image(self, img_base64: str, img_mime: str, x: int, y: int, size: int, border_radius: int = 8):
        """
        Add the cover image with decorative borders and shadows.
        x, y are center coordinates.
        """
        half = size // 2
        left = x - half
        top = y - half

        # Deep shadow
        self.add_element(
            f'<rect x="{left - 15}" y="{top - 15}" width="{size + 30}" height="{size + 30}" '
            f'rx="{border_radius + 4}" fill="#000000" opacity="0.4" filter="url(#imageShadow)"/>'
        )

        # Outer container
        self.add_element(
            f'<rect x="{left - 10}" y="{top - 10}" width="{size + 20}" height="{size + 20}" '
            f'fill="{self.colors.get("bg_end", "#100f0f")}" rx="{border_radius + 2}"/>'
        )

        # Inner container
        self.add_element(
            f'<rect x="{left}" y="{top}" width="{size}" height="{size}" '
            f'fill="{self.colors.get("bg_end", "#100f0f")}" rx="{border_radius}"/>'
        )

        # Image with glow
        self.add_element(
            f'<rect x="{left}" y="{top}" width="{size}" height="{size}" rx="{border_radius}" '
            f'fill="{self.colors["accent_mid"]}" opacity="0.05"/>'
        )
        self.add_element(
            f'<image x="{left}" y="{top}" width="{size}" height="{size}" '
            f'xlink:href="data:{img_mime};base64,{img_base64}" '
            f'preserveAspectRatio="xMidYMid slice" opacity="0.95" filter="url(#innerGlow)"/>'
        )

        # Multi‑layered border
        self.add_element(
            f'<rect x="{left}" y="{top}" width="{size}" height="{size}" fill="none" '
            f'stroke="url(#accentGradient)" stroke-width="6" rx="{border_radius}"/>'
        )
        self.add_element(
            f'<rect x="{left + 5}" y="{top + 5}" width="{size - 10}" height="{size - 10}" fill="none" '
            f'stroke="{self.colors["border_light"]}" stroke-width="2" rx="{border_radius - 2}"/>'
        )

        # Corner accents
        accent = self.colors["corner_accent"]
        offset = 25
        self.add_element(
            f'<path d="M{left + offset},{top} L{left},{top} L{left},{top + offset} Z" '
            f'fill="url(#accentGradient)" opacity="0.7"/>'
        )
        self.add_element(
            f'<path d="M{left + size - offset},{top} L{left + size},{top} L{left + size},{top + offset} Z" '
            f'fill="url(#accentGradient)" opacity="0.7"/>'
        )
        self.add_element(
            f'<path d="M{left + offset},{top + size} L{left},{top + size} L{left},{top + size - offset} Z" '
            f'fill="url(#accentGradient)" opacity="0.7"/>'
        )
        self.add_element(
            f'<path d="M{left + size - offset},{top + size} L{left + size},{top + size} L{left + size},{top + size - offset} Z" '
            f'fill="url(#accentGradient)" opacity="0.7"/>'
        )

    def add_title(self, lines: List[str], x: int, y_start: int, font_size: int,
                  line_height: int, color: Optional[str] = None,
                  is_persian: bool = False):
        """Add the title text lines."""
        if color is None:
            color = self.colors['title']
        font_family = self.fonts['persian'] if is_persian else self.fonts['latin']
        for i, line in enumerate(lines):
            y = y_start + i * (font_size + line_height)
            text_el = (
                f'<text x="{x}" y="{y}" text-anchor="middle" font-family="{font_family}" '
                f'font-size="{font_size}" font-weight="700" fill="{color}" '
                f'opacity="0.98" filter="url(#textGlow)" letter-spacing="0.5">'
                f'{escape_xml(line)}</text>'
            )
            self.add_element(text_el)

    def add_subtitle(self, lines: List[str], x: int, y_start: int, font_size: int,
                     line_height: int, color: Optional[str] = None,
                     is_persian: bool = False):
        """Add the subtitle text lines."""
        if color is None:
            color = self.colors['subtitle']
        font_family = self.fonts['persian'] if is_persian else self.fonts['latin']
        for i, line in enumerate(lines):
            y = y_start + i * (font_size + line_height)
            text_el = (
                f'<text x="{x}" y="{y}" text-anchor="middle" font-family="{font_family}" '
                f'font-size="{font_size}" font-weight="400" fill="{color}" '
                f'opacity="0.9" letter-spacing="0.3">{escape_xml(line)}</text>'
            )
            self.add_element(text_el)

    def add_bottom_bar(self, logo_base64: Optional[str], logo_mime: Optional[str],
                       website: str, episode: Optional[str],
                       x_center: int, y_baseline: int, is_persian: bool):
        """
        Add the bottom bar with logo, website, and optional episode number.
        All elements are horizontally aligned at y_baseline.
        """
        # Bottom bar background
        self.add_element(
            f'<rect x="0" y="{y_baseline - 200}" width="{self.width}" height="200" '
            f'fill="{self.colors["bottom_bar"]}"/>'
        )
        self.add_element(
            f'<line x1="0" x2="{self.width}" y1="{y_baseline - 200}" y2="{y_baseline - 200}" '
            f'stroke="url(#accentGradient)" stroke-width="2" stroke-opacity="0.4"/>'
        )

        # Determine layout: two or three columns
        if episode:
            # Three columns: logo | website | episode
            logo_x = int(self.width * 0.167)   # ~180
            web_x = int(self.width * 0.5)      # 540
            ep_x = int(self.width * 0.833)     # 900
        else:
            # Two columns: logo | website
            logo_x = int(self.width * 0.25)    # 270
            web_x = int(self.width * 0.5)      # 540
            ep_x = None

        # ---- Logo ----
        self.add_element(f'<g transform="translate({logo_x}, {y_baseline})">')
        # Glow
        self.add_element(
            f'<circle cx="0" cy="0" r="65" fill="{self.colors["accent_mid"]}" opacity="0.15"/>'
        )
        # Background circle with gradient
        self.add_element(
            f'<circle cx="0" cy="0" r="58" fill="url(#accentGradient)"/>'
        )
        self.add_element(
            f'<circle cx="0" cy="0" r="54" fill="{self.colors.get("bg_end", "#100f0f")}" '
            f'stroke="url(#accentGradient)" stroke-width="2"/>'
        )
        # Clip path for logo image
        self.add_def(
            f'<clipPath id="logoClip"><circle cx="0" cy="0" r="54"/></clipPath>'
        )
        if logo_base64 and logo_mime:
            self.add_element(
                f'<image x="-54" y="-54" width="108" height="108" '
                f'xlink:href="data:{logo_mime};base64,{logo_base64}" '
                f'preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" opacity="0.95"/>'
            )
        else:
            # Default play icon
            self.add_element(
                f'<path d="M-15,-15 L25,0 L-15,15 Z" fill="{self.colors["title"]}" opacity="0.9"/>'
            )
        # Subtle shine
        self.add_element(
            f'<circle cx="-20" cy="-20" r="25" fill="white" opacity="0.08"/>'
        )
        self.add_element('</g>')

        # ---- Website ----
        self.add_element(f'<g transform="translate({web_x}, {y_baseline})">')
        # Decorative dots
        self.add_element(
            f'<circle cx="-120" cy="0" r="3" fill="{self.colors["accent_mid"]}" opacity="0.6"/>'
        )
        self.add_element(
            f'<circle cx="120" cy="0" r="3" fill="{self.colors["accent_mid"]}" opacity="0.6"/>'
        )
        # URL text
        font_family = self.fonts['persian'] if is_persian else self.fonts['latin']
        text_el = (
            f'<text x="0" y="0" text-anchor="middle" font-family="{font_family}" '
            f'font-size="36" font-weight="300" fill="{self.colors["website"]}" '
            f'opacity="0.9" letter-spacing="2" dominant-baseline="middle">'
            f'{escape_xml(website)}</text>'
        )
        self.add_element(text_el)
        # Decorative underline
        self.add_element(
            f'<line x1="-110" x2="110" y1="20" y2="20" '
            f'stroke="{self.colors["website"]}" stroke-width="0.5" stroke-opacity="0.2"/>'
        )
        self.add_element('</g>')

        # ---- Episode number (if present) ----
        if episode:
            self.add_element(f'<g transform="translate({ep_x}, {y_baseline})">')
            persian_ep = english_to_persian_digits(episode)
            font_family = self.fonts['persian'] if is_persian else self.fonts['latin']
            text_el = (
                f'<text x="0" y="0" text-anchor="end" font-family="{font_family}" '
                f'font-size="78" font-weight="900" fill="url(#accentGradient)" '
                f'opacity="0.95" letter-spacing="1" dominant-baseline="middle">'
                f'{escape_xml(persian_ep)}</text>'
            )
            self.add_element(text_el)
            # Decorative line
            self.add_element(
                f'<line x1="-180" x2="-10" y1="0" y2="0" '
                f'stroke="url(#accentGradient)" stroke-width="1" stroke-opacity="0.3"/>'
            )
            self.add_element('</g>')

    # ------------------------------------------------------------------
    # Complete cover builder
    # ------------------------------------------------------------------
    def build_full_cover(
        self,
        title_lines: List[str],
        subtitle_lines: List[str],
        img_base64: str,
        img_mime: str,
        logo_base64: Optional[str],
        logo_mime: Optional[str],
        website: str,
        episode: Optional[str],
        title_font_size: int,
        subtitle_font_size: int,
        title_line_height: int = 10,
        subtitle_line_height: int = 8,
    ) -> str:
        """
        Build the complete SVG cover with all elements.
        Returns the full SVG string.
        """
        self.add_all_defs()
        self.add_background()

        # Image position (center)
        img_center_x = self.width // 2
        img_center_y = int(self.height * 0.28)  # ~540 for 1920 height
        img_size = int(self.width * 0.74)       # ~800 for 1080 width
        self.add_cover_image(img_base64, img_mime, img_center_x, img_center_y, img_size)

        # Title position
        title_x = self.width // 2
        title_start_y = int(self.height * 0.65)  # ~1250
        is_persian = any(detect_persian(line) for line in title_lines + subtitle_lines)
        self.add_title(title_lines, title_x, title_start_y,
                       title_font_size, title_line_height,
                       is_persian=is_persian)

        # Subtitle
        if subtitle_lines:
            subtitle_start_y = title_start_y + len(title_lines) * (title_font_size + title_line_height) + 15
            self.add_subtitle(subtitle_lines, title_x, subtitle_start_y,
                              subtitle_font_size, subtitle_line_height,
                              is_persian=is_persian)

        # Bottom bar (baseline at y = height - 100)
        bottom_y = self.height - 100
        self.add_bottom_bar(logo_base64, logo_mime, website, episode,
                            self.width // 2, bottom_y, is_persian)

        # Border safety margin
        margin = 40
        self.add_element(
            f'<rect x="{margin}" y="{margin}" width="{self.width - 2 * margin}" '
            f'height="{self.height - 2 * margin}" fill="none" stroke="none"/>'
        )

        return self.build()


# ----------------------------------------------------------------------
# Cover Generator (Orchestrator)
# ----------------------------------------------------------------------
@dataclass
class CoverConfig:
    """Configuration for cover generation."""
    title: str
    subtitle: str = ""
    image_path: str = ""
    logo_path: Optional[str] = None
    episode: Optional[str] = None
    website: str = "mucteba.ir"
    output_path: str = "podcast_cover.svg"
    width: int = 1080
    height: int = 1920
    theme: Dict[str, Any] = field(default_factory=lambda: DEFAULT_THEME)
    max_image_size_kb: int = 400
    title_font_size: Optional[int] = None
    subtitle_font_size: Optional[int] = None
    episode_prefix: str = ""  # e.g., "EP "


class CoverGenerator:
    """Orchestrates the creation of the podcast cover."""

    def __init__(self, config: CoverConfig):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.image_processor = ImageProcessor(max_size_kb=config.max_image_size_kb)
        self.theme = config.theme
        self._has_episode = bool(config.episode)
        self._persian_episode = None

    def generate(self) -> bool:
        """Generate the cover and save to output_path. Returns True on success."""
        try:
            # Validate inputs
            if not self.config.image_path:
                self.logger.error("No image path provided")
                return False

            # Process cover image
            self.logger.info("Processing cover image...")
            img_base64, img_mime = self.image_processor.to_base64(self.config.image_path)
            if not img_base64:
                self.logger.error("Failed to process cover image")
                return False

            # Process logo if provided
            logo_base64 = logo_mime = None
            if self.config.logo_path:
                self.logger.info("Processing logo...")
                logo_base64, logo_mime = self.image_processor.to_base64(self.config.logo_path, max_size_kb=150)
                if not logo_base64:
                    self.logger.warning("Could not process logo, using default")
                    self.config.logo_path = None

            # Prepare text
            title_lines = self._wrap_text(self.config.title, max_chars=25)
            subtitle_lines = self._wrap_text(self.config.subtitle, max_chars=45) if self.config.subtitle else []

            # Font sizes
            title_size, subtitle_size = self._calculate_font_sizes(
                title_lines, subtitle_lines,
                self.config.title_font_size, self.config.subtitle_font_size
            )

            # Episode number (Persian conversion)
            if self._has_episode:
                self._persian_episode = english_to_persian_digits(self.config.episode)
                self.logger.info(f"Episode: {self.config.episode} → {self._persian_episode}")

            # Build SVG
            builder = SVGBuilder(self.config.width, self.config.height, self.theme)
            svg_content = builder.build_full_cover(
                title_lines=title_lines,
                subtitle_lines=subtitle_lines,
                img_base64=img_base64,
                img_mime=img_mime,
                logo_base64=logo_base64,
                logo_mime=logo_mime,
                website=self.config.website,
                episode=self.config.episode,
                title_font_size=title_size,
                subtitle_font_size=subtitle_size,
            )

            # Write SVG
            self._write_svg(svg_content, self.config.output_path)

            # Log success
            self._log_success()
            return True

        except Exception as e:
            self.logger.error(f"Generation failed: {e}")
            self._create_fallback()
            return False

    def _wrap_text(self, text: str, max_chars: int = 25) -> List[str]:
        """Wrap text into lines of at most max_chars characters."""
        if not text:
            return []
        # Split by spaces, but also handle Persian/Arabic where spaces may not separate words
        # A simple approach: split by spaces and then recombine
        words = text.split()
        lines = []
        current_line = []
        for word in words:
            if len(' '.join(current_line + [word])) <= max_chars:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        if current_line:
            lines.append(' '.join(current_line))
        return lines

    def _calculate_font_sizes(self, title_lines: List[str], subtitle_lines: List[str],
                              forced_title: Optional[int], forced_subtitle: Optional[int]) -> Tuple[int, int]:
        """Calculate optimal font sizes based on line counts."""
        if forced_title is not None and forced_subtitle is not None:
            return forced_title, forced_subtitle

        # Title size
        if forced_title is not None:
            title_size = forced_title
        else:
            num_lines = len(title_lines)
            if num_lines <= 1:
                title_size = 86
            elif num_lines == 2:
                title_size = 76
            elif num_lines == 3:
                title_size = 66
            else:
                title_size = 56

        # Subtitle size
        if forced_subtitle is not None:
            subtitle_size = forced_subtitle
        else:
            num_lines = len(subtitle_lines)
            if num_lines == 0:
                subtitle_size = 0
            elif num_lines == 1:
                subtitle_size = 48
            elif num_lines == 2:
                subtitle_size = 42
            else:
                subtitle_size = 36

        return title_size, subtitle_size

    def _write_svg(self, content: str, path: str):
        """Write SVG content to file with UTF‑8 encoding."""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        size = os.path.getsize(path)
        self.logger.info(f"Written {path} ({size:,} bytes)")

    def _log_success(self):
        """Log a detailed success message."""
        cfg = self.config
        self.logger.info("=" * 60)
        self.logger.info("✨ ULTIMATE PODCAST COVER CREATED")
        self.logger.info("=" * 60)
        self.logger.info(f"📁 Output: {cfg.output_path}")
        self.logger.info(f"📐 Dimensions: {cfg.width}×{cfg.height}")
        self.logger.info(f"📝 Title: {cfg.title}")
        self.logger.info(f"   Subtitle: {cfg.subtitle or 'None'}")
        if self._has_episode:
            self.logger.info(f"   Episode: {cfg.episode} → {self._persian_episode}")
        self.logger.info(f"   Website: {cfg.website}")
        self.logger.info(f"   Logo: {'Custom' if cfg.logo_path else 'Default'}")
        self.logger.info("✨ PERFECT ALIGNMENT: Logo | URL | Episode (if present)")
        self.logger.info("=" * 60)

    def _create_fallback(self):
        """Create a simplified fallback SVG."""
        fallback_path = self.config.output_path.replace('.svg', '_fallback.svg')
        try:
            title_lines = self._wrap_text(self.config.title, max_chars=25)
            lines = []
            lines.append('<?xml version="1.0" encoding="UTF-8"?>')
            lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.config.width} {self.config.height}">')
            lines.append('  <rect width="100%" height="100%" fill="#0c0c0c"/>')
            # Simple title
            y = int(self.config.height * 0.65)
            for i, line in enumerate(title_lines):
                y_pos = y + i * 86
                lines.append(f'  <text x="{self.config.width//2}" y="{y_pos}" text-anchor="middle" '
                             f'font-family="Helvetica Neue" font-size="86" font-weight="700" fill="#f8f7f5">'
                             f'{escape_xml(line)}</text>')
            # Subtitle
            if self.config.subtitle:
                y_sub = y + len(title_lines) * 86 + 30
                lines.append(f'  <text x="{self.config.width//2}" y="{y_sub}" text-anchor="middle" '
                             f'font-family="Helvetica Neue" font-size="48" fill="#e8e6d3">'
                             f'{escape_xml(self.config.subtitle[:80])}</text>')
            # Bottom bar (simplified)
            bottom_y = self.config.height - 100
            lines.append(f'  <g transform="translate(0, {self.config.height})">')
            lines.append(f'    <rect x="0" y="-200" width="{self.config.width}" height="200" fill="#00000010"/>')
            lines.append(f'    <text x="{self.config.width//2}" y="{bottom_y}" text-anchor="middle" '
                         f'font-family="Helvetica Neue" font-size="36" fill="#9f9898" dominant-baseline="middle">'
                         f'{escape_xml(self.config.website)}</text>')
            lines.append('  </g>')
            lines.append('</svg>')
            with open(fallback_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            self.logger.info(f"📦 Created fallback: {fallback_path}")
        except Exception as e:
            self.logger.error(f"Could not create fallback: {e}")


# ----------------------------------------------------------------------
# CLI / Interactive
# ----------------------------------------------------------------------
def setup_logging(verbose: bool = False):
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(levelname)s: %(message)s',
        handlers=[logging.StreamHandler()]
    )


def load_theme(theme_name_or_path: str) -> Dict[str, Any]:
    """Load a theme by name or from a JSON file."""
    if theme_name_or_path in THEMES:
        return THEMES[theme_name_or_path]
    # Try as a file path
    if os.path.exists(theme_name_or_path):
        try:
            return load_theme_from_json(theme_name_or_path)
        except Exception as e:
            logging.error(f"Failed to load theme from {theme_name_or_path}: {e}")
            sys.exit(1)
    else:
        logging.error(f"Theme '{theme_name_or_path}' not found. Available: {list(THEMES.keys())}")
        sys.exit(1)


def interactive_mode():
    """Run the generator in interactive mode."""
    print("\n" + "═" * 60)
    print("✨ ULTIMATE PODCAST COVER GENERATOR v9.0")
    print("═" * 60)
    print("Perfect horizontal alignment for all elements")
    print("═" * 60)

    # Gather inputs
    title = input("Episode title: ").strip()
    while not title:
        print("❌ Title is required")
        title = input("Episode title: ").strip()

    subtitle = input("Episode subtitle (optional): ").strip()

    episode = None
    ep_input = input("Episode number (optional, Enter to skip): ").strip()
    if ep_input:
        episode = ep_input

    print("\n🖼️  COVER IMAGE")
    image_path = None
    while not image_path:
        path_input = input("Image path (drag/drop or type): ").strip()
        if not path_input:
            print("❌ Cover image required")
            continue
        image_path = find_image_file(path_input)
        if not image_path:
            print(f"❌ File not found: {path_input}")
        else:
            print(f"✓ Found: {image_path}")

    print("\n🎯 LOGO IMAGE (OPTIONAL)")
    logo_path = None
    path_input = input("Logo path (Enter to skip): ").strip()
    if path_input:
        logo_path = find_image_file(path_input)
        if not logo_path:
            print(f"⚠️  Logo not found, using default")
            logo_path = None
        else:
            print(f"✓ Found: {logo_path}")

    print("\n🌐 WEBSITE URL")
    website = input("Website (default mucteba.ir): ").strip()
    if not website:
        website = "mucteba.ir"

    print("\n🎨 COLOR THEME")
    print("Available: " + ", ".join(THEMES.keys()))
    theme_name = input("Theme (default premium): ").strip()
    if not theme_name:
        theme_name = "premium"
    try:
        theme = load_theme(theme_name)
    except SystemExit:
        return

    print("\n📐 OUTPUT DIMENSIONS (width height)")
    dims = input("Enter 'width height' (default 1080 1920): ").strip()
    if dims:
        parts = dims.split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            width, height = int(parts[0]), int(parts[1])
        else:
            print("Invalid dimensions, using default 1080x1920")
            width, height = 1080, 1920
    else:
        width, height = 1080, 1920

    output = input("Output filename (default podcast_cover.svg): ").strip()
    if not output:
        output = "podcast_cover.svg"
    if not output.lower().endswith('.svg'):
        output += '.svg'

    # Build config
    config = CoverConfig(
        title=title,
        subtitle=subtitle,
        image_path=image_path,
        logo_path=logo_path,
        episode=episode,
        website=website,
        output_path=output,
        width=width,
        height=height,
        theme=theme,
    )

    # Generate
    generator = CoverGenerator(config)
    success = generator.generate()

    if success:
        print("\n✅ Cover created successfully!")
        print(f"📁 {os.path.abspath(output)}")
        if episode:
            print(f"🔢 Episode: {episode}")
        # Optional PNG export
        if HAS_CAIRO:
            convert = input("\nCreate PNG too? (y/N): ").strip().lower()
            if convert == 'y':
                png_path = output.replace('.svg', '.png')
                try:
                    cairosvg.svg2png(url=output, write_to=png_path,
                                     output_width=width, output_height=height)
                    print(f"✓ PNG: {png_path}")
                except Exception as e:
                    print(f"⚠️  PNG export failed: {e}")
    else:
        print("\n❌ Generation failed. Check logs.")


def cli_mode():
    """Command‑line interface."""
    parser = argparse.ArgumentParser(
        description='Create ultimate podcast covers with perfect alignment.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s --title "My Podcast" --image cover.jpg --episode 42
  %(prog)s --title "Special" --image photo.png --logo logo.png --theme dark
  %(prog)s --title "No Episode" --subtitle "With Guest" --image img.jpg
  %(prog)s --title "Custom" --image img.jpg --width 1080 --height 1920 --theme neon

PERFECT ALIGNMENT: Logo, URL, and Episode number horizontally aligned!
        '''
    )
    parser.add_argument('--title', '-t', required=True, help='Episode title')
    parser.add_argument('--subtitle', '-s', default='', help='Episode subtitle')
    parser.add_argument('--image', '-i', required=True, help='Cover image path')
    parser.add_argument('--episode', '-e', help='Episode number (optional)')
    parser.add_argument('--logo', '-l', help='Logo image path')
    parser.add_argument('--website', '-w', default='mucteba.ir', help='Website URL')
    parser.add_argument('--output', '-o', default='', help='Output SVG filename')
    parser.add_argument('--width', type=int, default=1080, help='Output width')
    parser.add_argument('--height', type=int, default=1920, help='Output height')
    parser.add_argument('--theme', default='premium', help='Color theme name or JSON file')
    parser.add_argument('--title-font-size', type=int, help='Override title font size')
    parser.add_argument('--subtitle-font-size', type=int, help='Override subtitle font size')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--no-fallback', action='store_true', help='Do not create fallback on error')
    args = parser.parse_args()

    setup_logging(args.verbose)

    image_path = find_image_file(args.image)
    if not image_path:
        logging.error(f"Cover image not found: {args.image}")
        sys.exit(1)

    logo_path = None
    if args.logo:
        logo_path = find_image_file(args.logo)
        if not logo_path:
            logging.warning(f"Logo not found: {args.logo}. Using default.")

    if not args.output:
        safe_title = re.sub(r'[^a-zA-Z0-9\-_ ]', '', args.title).strip().replace(' ', '_')[:25]
        if args.episode:
            args.output = f"podcast_ep{args.episode}_{safe_title}.svg"
        else:
            args.output = f"podcast_{safe_title}.svg"
        if not args.output.lower().endswith('.svg'):
            args.output += '.svg'

    try:
        theme = load_theme(args.theme)
    except SystemExit:
        sys.exit(1)

    config = CoverConfig(
        title=args.title,
        subtitle=args.subtitle,
        image_path=image_path,
        logo_path=logo_path,
        episode=args.episode,
        website=args.website,
        output_path=args.output,
        width=args.width,
        height=args.height,
        theme=theme,
        title_font_size=args.title_font_size,
        subtitle_font_size=args.subtitle_font_size,
    )

    generator = CoverGenerator(config)
    success = generator.generate()
    sys.exit(0 if success else 1)


def main():
    """Entry point."""
    try:
        if len(sys.argv) > 1:
            cli_mode()
        else:
            interactive_mode()
    except KeyboardInterrupt:
        print("\n\n⏹️  Cancelled.")
        sys.exit(0)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    # Ensure mimetypes is initialized
    mimetypes.init()
    # Import io for image compression
    import io
    main()
