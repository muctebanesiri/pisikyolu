#!/usr/bin/env python3
"""
Ultimate Premium Podcast Cover Generator v8.2
With Perfect Borders, Premium Polish, and Optional Episode Number
Perfect horizontal alignment for logo, URL, and episode number
"""

import base64
import os
import sys
from pathlib import Path
import mimetypes
import argparse

# Premium brand colors
BRAND_COLORS = {
    "light": "#100f0f",
    "lightgray": "#1a1918",
    "gray": "#9f9898",
    "darkgray": "#e8e6e3",
    "dark": "#f8f7f5",
    "secondary": "#a68adf",
    "tertiary": "#846aff",
    "accent_purple": "#a68adf",
    "accent_dark": "#5a4d8c",
    "premium_shadow": "#00000030",
    "success": "#10b981",
    "warning": "#f59e0b",
    "error": "#ef4444"
}

class PodcastCoverGenerator:
    """Main class for generating premium podcast covers"""
    
    def __init__(self):
        self.has_episode = False
        self.episode_number = None
        self.persian_episode = None
        
    def english_to_persian_digits(self, text):
        """Convert English digits to Persian digits"""
        if not text:
            return ""
        
        digit_map = {
            '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
            '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
        }
        
        result = []
        for char in str(text):
            result.append(digit_map.get(char, char))
        
        return ''.join(result)
    
    def clean_base64_data(self, base64_string):
        """Clean base64 string by removing line breaks and special characters"""
        if not base64_string:
            return ""
        
        import re
        cleaned = re.sub(r'\s+', '', base64_string)
        cleaned = cleaned.replace('&', '')
        cleaned = cleaned.replace('<', '')
        cleaned = cleaned.replace('>', '')
        cleaned = cleaned.replace('"', '')
        cleaned = cleaned.replace("'", '')
        return cleaned
    
    def image_to_base64(self, image_path, max_size_kb=500):
        """Convert image to base64 with size limit"""
        try:
            if not os.path.exists(image_path):
                print(f"❌ Image file not found: {image_path}")
                return None, None
            
            with open(image_path, "rb") as img_file:
                img_data = img_file.read()
            
            file_size_kb = len(img_data) / 1024
            print(f"   Original size: {file_size_kb:.1f}KB")
            
            if file_size_kb > max_size_kb:
                print(f"   Compressing to {max_size_kb}KB limit...")
                try:
                    from PIL import Image
                    import io
                    
                    img = Image.open(io.BytesIO(img_data))
                    img_format = img.format or 'JPEG'
                    
                    width, height = img.size
                    target_pixels = (max_size_kb * 1024 * 8) // 24
                    current_pixels = width * height
                    
                    if current_pixels > target_pixels:
                        ratio = (target_pixels / current_pixels) ** 0.5
                        new_width = int(width * ratio)
                        new_height = int(height * ratio)
                        print(f"   Resizing from {width}x{height} to {new_width}x{new_height}")
                        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    
                    if img.mode in ('RGBA', 'LA'):
                        background = Image.new('RGB', img.size, (0, 0, 0))
                        background.paste(img, mask=img.split()[-1])
                        img = background
                    elif img.mode == 'P':
                        img = img.convert('RGB')
                    
                    output = io.BytesIO()
                    quality = 95
                    img.save(output, format=img_format, quality=quality, optimize=True)
                    img_data = output.getvalue()
                    print(f"   Compressed to: {len(img_data)/1024:.1f}KB")
                    
                except ImportError:
                    print("   ℹ️ Install Pillow for compression: pip install Pillow")
                except Exception as e:
                    print(f"   ⚠️ Compression failed: {e}")
            
            img_base64 = base64.b64encode(img_data).decode('utf-8')
            img_base64 = self.clean_base64_data(img_base64)
            
            mime_type, _ = mimetypes.guess_type(image_path)
            if not mime_type:
                ext = os.path.splitext(image_path)[1].lower()
                mime_map = {
                    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.png': 'image/png', '.svg': 'image/svg+xml',
                    '.webp': 'image/webp', '.gif': 'image/gif',
                    '.bmp': 'image/bmp', '.tiff': 'image/tiff',
                    '.tif': 'image/tiff'
                }
                mime_type = mime_map.get(ext, 'image/jpeg')
            
            print(f"   ✓ Encoded: {len(img_base64)} chars")
            return img_base64, mime_type
            
        except Exception as e:
            print(f"❌ Error converting image: {e}")
            return None, None
    
    def wrap_text(self, text, max_chars_per_line=20):
        """Wrap text to fit within bounds"""
        if not text:
            return [""]
        
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            if len(' '.join(current_line + [word])) <= max_chars_per_line:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines
    
    def escape_xml(self, text):
        """Escape XML special characters"""
        if not text:
            return ""
        text = str(text)
        text = text.replace('&', '&amp;')
        text = text.replace('<', '&lt;')
        text = text.replace('>', '&gt;')
        text = text.replace('"', '&quot;')
        text = text.replace("'", '&apos;')
        return text
    
    def calculate_font_sizes(self, title_lines, subtitle_lines):
        """Calculate optimal font sizes based on line counts"""
        title_line_count = len(title_lines)
        subtitle_line_count = len(subtitle_lines)
        
        # Adjust font sizes to fit perfectly
        if title_line_count == 1:
            title_size = 86
        elif title_line_count == 2:
            title_size = 76
        elif title_line_count == 3:
            title_size = 66
        else:
            title_size = 56
        
        if subtitle_line_count == 0:
            subtitle_size = 0
        elif subtitle_line_count == 1:
            subtitle_size = 48
        elif subtitle_line_count == 2:
            subtitle_size = 42
        else:
            subtitle_size = 36
        
        return title_size, subtitle_size
    
    def generate_svg_content(self, title, subtitle, img_base64, img_mime, 
                           logo_base64, logo_mime, website="mucteba.ir", 
                           output_path="podcast_cover.svg"):
        """Generate the complete SVG content"""
        
        # Escape XML special characters
        title_escaped = self.escape_xml(title)
        subtitle_escaped = self.escape_xml(subtitle)
        website_escaped = self.escape_xml(website)
        
        # Convert episode number to Persian if exists
        if self.has_episode and self.episode_number:
            self.persian_episode = self.english_to_persian_digits(self.episode_number)
            episode_escaped = self.escape_xml(self.persian_episode)
            print(f"✓ Episode: {self.episode_number} → {self.persian_episode}")
        
        # Wrap text to fit within bounds
        title_lines = self.wrap_text(title, max_chars_per_line=25)
        subtitle_lines = self.wrap_text(subtitle, max_chars_per_line=45) if subtitle else []
        
        # Calculate font sizes
        title_size, subtitle_size = self.calculate_font_sizes(title_lines, subtitle_lines)
        
        # Determine if text contains Persian/Arabic characters
        has_persian = any('\u0600' <= char <= '\u06FF' for char in title + subtitle + website)
        
        # Build SVG content
        svg_lines = []
        
        # SVG Header
        svg_lines.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
        svg_lines.append('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1080 1920" width="1080" height="1920">')
        
        # Define all filters and gradients
        svg_lines.append(f'  <defs>')
        
        # Premium background gradient
        svg_lines.append(f'    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">')
        svg_lines.append(f'      <stop offset="0%" stop-color="#0c0c0c" />')
        svg_lines.append(f'      <stop offset="100%" stop-color="{BRAND_COLORS["light"]}" />')
        svg_lines.append(f'    </linearGradient>')
        
        # Purple gradient
        svg_lines.append(f'    <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">')
        svg_lines.append(f'      <stop offset="0%" stop-color="{BRAND_COLORS["tertiary"]}" />')
        svg_lines.append(f'      <stop offset="50%" stop-color="{BRAND_COLORS["secondary"]}" />')
        svg_lines.append(f'      <stop offset="100%" stop-color="{BRAND_COLORS["accent_dark"]}" />')
        svg_lines.append(f'    </linearGradient>')
        
        # Image shadow filter
        svg_lines.append(f'    <filter id="imageShadow">')
        svg_lines.append(f'      <feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#000000" flood-opacity="0.4"/>')
        svg_lines.append(f'    </filter>')
        
        # Inner glow filter for image
        svg_lines.append(f'    <filter id="innerGlow">')
        svg_lines.append(f'      <feFlood flood-color="{BRAND_COLORS["secondary"]}" flood-opacity="0.1" result="glow"/>')
        svg_lines.append(f'      <feComposite in="glow" in2="SourceAlpha" operator="in" result="glow"/>')
        svg_lines.append(f'      <feGaussianBlur stdDeviation="10" result="blurredGlow"/>')
        svg_lines.append(f'      <feMerge>')
        svg_lines.append(f'        <feMergeNode in="blurredGlow"/>')
        svg_lines.append(f'        <feMergeNode in="SourceGraphic"/>')
        svg_lines.append(f'      </feMerge>')
        svg_lines.append(f'    </filter>')
        
        # Text glow filter
        svg_lines.append(f'    <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">')
        svg_lines.append(f'      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>')
        svg_lines.append(f'    </filter>')
        
        svg_lines.append(f'  </defs>')
        
        # Premium Background
        svg_lines.append(f'  <rect width="100%" height="100%" fill="url(#bgGradient)"/>')
        
        # Premium Cover Image Section
        svg_lines.append('  <g transform="translate(540, 540)">')
        
        # Deep shadow behind image
        svg_lines.append(f'    <rect x="-425" y="-425" width="850" height="850" rx="12" fill="#000000" opacity="0.4" filter="url(#imageShadow)"/>')
        
        # Main image container
        svg_lines.append(f'    <rect x="-410" y="-410" width="820" height="820" fill="{BRAND_COLORS["lightgray"]}" rx="10"/>')
        
        # Inner container
        svg_lines.append(f'    <rect x="-400" y="-400" width="800" height="800" fill="{BRAND_COLORS["lightgray"]}" rx="8"/>')
        
        # Cover image with inner glow
        svg_lines.append(f'    <rect x="-400" y="-400" width="800" height="800" rx="8" fill="{BRAND_COLORS["secondary"]}" opacity="0.05"/>')
        svg_lines.append(f'    <image x="-400" y="-400" width="800" height="800" xlink:href="data:{img_mime};base64,{img_base64}" preserveAspectRatio="xMidYMid slice" opacity="0.95"/>')
        
        # Premium multi-layered border
        svg_lines.append(f'    <rect x="-400" y="-400" width="800" height="800" fill="none" stroke="url(#purpleGradient)" stroke-width="6" rx="8"/>')
        
        # Inner subtle border
        svg_lines.append(f'    <rect x="-395" y="-395" width="790" height="790" fill="none" stroke="#ffffff20" stroke-width="2" rx="6"/>')
        
        # Corner accents
        svg_lines.append(f'    <path d="M-395,-395 L-370,-395 L-395,-370 Z" fill="url(#purpleGradient)" opacity="0.7"/>')
        svg_lines.append(f'    <path d="M395,-395 L370,-395 L395,-370 Z" fill="url(#purpleGradient)" opacity="0.7"/>')
        svg_lines.append(f'    <path d="M-395,395 L-370,395 L-395,370 Z" fill="url(#purpleGradient)" opacity="0.7"/>')
        svg_lines.append(f'    <path d="M395,395 L370,395 L395,370 Z" fill="url(#purpleGradient)" opacity="0.7"/>')
        
        svg_lines.append('  </g>')
        
        # Title Section
        svg_lines.append('  <g transform="translate(540, 1250)">')
        
        # Render title lines
        y_offset = 0
        for i, line in enumerate(title_lines):
            line_y = y_offset + (i * (title_size + 10))
            if has_persian:
                svg_lines.append(f'    <text x="0" y="{line_y}" text-anchor="middle" font-family="Vazirmatn, Arial, sans-serif" font-size="{title_size}" font-weight="700" fill="{BRAND_COLORS["dark"]}" direction="rtl" opacity="0.98" filter="url(#textGlow)" letter-spacing="0.5">{self.escape_xml(line)}</text>')
            else:
                svg_lines.append(f'    <text x="0" y="{line_y}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="{title_size}" font-weight="700" fill="{BRAND_COLORS["dark"]}" opacity="0.98" filter="url(#textGlow)" letter-spacing="0.5">{self.escape_xml(line)}</text>')
        
        # Calculate subtitle starting position
        subtitle_start_y = len(title_lines) * (title_size + 10) + 15
        
        # Render subtitle lines
        for i, line in enumerate(subtitle_lines):
            line_y = subtitle_start_y + (i * (subtitle_size + 8))
            if has_persian:
                svg_lines.append(f'    <text x="0" y="{line_y}" text-anchor="middle" font-family="Vazirmatn, Arial, sans-serif" font-size="{subtitle_size}" font-weight="400" fill="{BRAND_COLORS["darkgray"]}" direction="rtl" opacity="0.9" letter-spacing="0.3">{self.escape_xml(line)}</text>')
            else:
                svg_lines.append(f'    <text x="0" y="{line_y}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="{subtitle_size}" font-weight="400" fill="{BRAND_COLORS["darkgray"]}" opacity="0.9" letter-spacing="0.3">{self.escape_xml(line)}</text>')
        
        svg_lines.append('  </g>')
        
        # Premium Bottom Section - Perfect horizontal alignment
        # All elements are vertically aligned at y = -100 (center of bottom bar)
        svg_lines.append('  <g transform="translate(0, 1920)">')
        svg_lines.append(f'    <rect x="0" y="-200" width="1080" height="200" fill="#00000010"/>')
        svg_lines.append(f'    <line x1="0" x2="1080" y1="-200" y2="-200" stroke="url(#purpleGradient)" stroke-width="2" stroke-opacity="0.4"/>')
        
        if self.has_episode:
            # PERFECT THREE-COLUMN ALIGNMENT: Logo | Website | Episode
            # All centered vertically at y = -100
            
            # Left: Logo (aligned with baseline)
            svg_lines.append('    <g transform="translate(180, -100)">')
            # Logo glow (centered)
            svg_lines.append(f'      <circle cx="0" cy="0" r="65" fill="{BRAND_COLORS["secondary"]}" opacity="0.15"/>')
            # Logo background with gradient (centered)
            svg_lines.append(f'      <circle cx="0" cy="0" r="58" fill="url(#purpleGradient)"/>')
            svg_lines.append(f'      <circle cx="0" cy="0" r="54" fill="{BRAND_COLORS["light"]}" stroke="url(#purpleGradient)" stroke-width="2"/>')
            # Logo clip path
            svg_lines.append(f'      <clipPath id="logoClip">')
            svg_lines.append(f'        <circle cx="0" cy="0" r="54"/>')
            svg_lines.append(f'      </clipPath>')
            
            if logo_base64:
                svg_lines.append(f'      <image x="-54" y="-54" width="108" height="108" xlink:href="data:{logo_mime};base64,{logo_base64}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" opacity="0.95"/>')
            else:
                # Premium default play icon (centered)
                svg_lines.append(f'      <path d="M-15,-15 L25,0 L-15,15 Z" fill="{BRAND_COLORS["dark"]}" opacity="0.9"/>')
            
            # Subtle shine (positioned relative to center)
            svg_lines.append(f'      <circle cx="-20" cy="-20" r="25" fill="white" opacity="0.08"/>')
            
            svg_lines.append('    </g>')
            
            # Center: Website URL (PERFECTLY CENTERED, aligned with logo baseline)
            svg_lines.append('    <g transform="translate(540, -100)">')
            
            # Decorative dots (aligned with text baseline)
            svg_lines.append(f'      <circle cx="-120" cy="0" r="3" fill="{BRAND_COLORS["secondary"]}" opacity="0.6"/>')
            svg_lines.append(f'      <circle cx="120" cy="0" r="3" fill="{BRAND_COLORS["secondary"]}" opacity="0.6"/>')
            
            if has_persian:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="middle" font-family="Vazirmatn, Arial, sans-serif" font-size="36" font-weight="300" fill="{BRAND_COLORS["darkgray"]}" direction="rtl" opacity="0.9" letter-spacing="2" dominant-baseline="middle">{website_escaped}</text>')
            else:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="36" font-weight="300" fill="{BRAND_COLORS["darkgray"]}" opacity="0.9" letter-spacing="2" dominant-baseline="middle">{website_escaped}</text>')
            
            # Subtle underline (aligned with text)
            svg_lines.append(f'      <line x1="-110" x2="110" y1="20" y2="20" stroke="{BRAND_COLORS["gray"]}" stroke-width="0.5" stroke-opacity="0.2"/>')
            
            svg_lines.append('    </g>')
            
            # Right: Episode Number (aligned with logo and website baseline)
            svg_lines.append('    <g transform="translate(900, -100)">')
            
            if has_persian:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="end" font-family="Vazirmatn, Arial, sans-serif" font-size="78" font-weight="900" fill="url(#purpleGradient)" direction="rtl" opacity="0.95" letter-spacing="1" dominant-baseline="middle">{episode_escaped}</text>')
            else:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="end" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="78" font-weight="900" fill="url(#purpleGradient)" opacity="0.95" letter-spacing="1" dominant-baseline="middle">{episode_escaped}</text>')
            
            # Decorative element (aligned with text baseline)
            svg_lines.append(f'      <line x1="-180" x2="-10" y1="0" y2="0" stroke="url(#purpleGradient)" stroke-width="1" stroke-opacity="0.3"/>')
            
            svg_lines.append('    </g>')
            
        else:
            # PERFECT TWO-COLUMN ALIGNMENT: Logo | Website
            # All centered vertically at y = -100
            
            # Left: Logo (centered vertically)
            svg_lines.append('    <g transform="translate(270, -100)">')
            # Logo glow
            svg_lines.append(f'      <circle cx="0" cy="0" r="65" fill="{BRAND_COLORS["secondary"]}" opacity="0.15"/>')
            # Logo background with gradient
            svg_lines.append(f'      <circle cx="0" cy="0" r="58" fill="url(#purpleGradient)"/>')
            svg_lines.append(f'      <circle cx="0" cy="0" r="54" fill="{BRAND_COLORS["light"]}" stroke="url(#purpleGradient)" stroke-width="2"/>')
            # Logo clip path
            svg_lines.append(f'      <clipPath id="logoClip">')
            svg_lines.append(f'        <circle cx="0" cy="0" r="54"/>')
            svg_lines.append(f'      </clipPath>')
            
            if logo_base64:
                svg_lines.append(f'      <image x="-54" y="-54" width="108" height="108" xlink:href="data:{logo_mime};base64,{logo_base64}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" opacity="0.95"/>')
            else:
                # Premium default play icon (centered)
                svg_lines.append(f'      <path d="M-15,-15 L25,0 L-15,15 Z" fill="{BRAND_COLORS["dark"]}" opacity="0.9"/>')
            
            # Subtle shine
            svg_lines.append(f'      <circle cx="-20" cy="-20" r="25" fill="white" opacity="0.08"/>')
            
            svg_lines.append('    </g>')
            
            # Center: Website URL (PERFECTLY CENTERED, aligned with logo baseline)
            svg_lines.append('    <g transform="translate(540, -100)">')
            
            if has_persian:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="middle" font-family="Vazirmatn, Arial, sans-serif" font-size="36" font-weight="300" fill="{BRAND_COLORS["darkgray"]}" direction="rtl" opacity="0.9" letter-spacing="2" dominant-baseline="middle">{website_escaped}</text>')
            else:
                svg_lines.append(f'      <text x="0" y="0" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="36" font-weight="300" fill="{BRAND_COLORS["darkgray"]}" opacity="0.9" letter-spacing="2" dominant-baseline="middle">{website_escaped}</text>')
            
            # Decorative line under website (aligned with text)
            svg_lines.append(f'      <line x1="-120" x2="120" y1="20" y2="20" stroke="url(#purpleGradient)" stroke-width="1" stroke-opacity="0.3"/>')
            
            svg_lines.append('    </g>')
        
        svg_lines.append('  </g>')
        
        # Border safety margins
        svg_lines.append(f'  <rect x="40" y="40" width="1000" height="1840" fill="none" stroke="none"/>')
        
        # Close SVG
        svg_lines.append('</svg>')
        
        return svg_lines
    
    def create_podcast_cover(self, title, subtitle, image_path, 
                           episode_number=None, logo_path=None, 
                           output_path="podcast_cover.svg", website="mucteba.ir"):
        """
        Create an ultimate premium podcast cover with optional episode number
        Perfect horizontal alignment for logo, URL, and episode number
        """
        
        # Set episode flag
        self.has_episode = episode_number is not None
        self.episode_number = episode_number
        
        if not os.path.exists(image_path):
            print(f"❌ ERROR: Image not found at {image_path}")
            return False
        
        # Process cover image
        print(f"📷 Processing cover image...")
        img_base64, img_mime = self.image_to_base64(image_path, max_size_kb=400)
        if not img_base64:
            print("❌ Failed to process cover image")
            return False
        
        # Process logo image if provided
        logo_base64 = None
        logo_mime = None
        if logo_path and os.path.exists(logo_path):
            print(f"🎯 Processing logo...")
            logo_base64, logo_mime = self.image_to_base64(logo_path, max_size_kb=150)
            if not logo_base64:
                print("⚠️ Could not process logo, using premium default")
                logo_path = None
        else:
            print("ℹ️ No logo provided, using premium default")
        
        # Generate SVG content
        svg_lines = self.generate_svg_content(
            title, subtitle, img_base64, img_mime,
            logo_base64, logo_mime, website, output_path
        )
        
        # Write to file
        try:
            svg_content = '\n'.join(svg_lines)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(svg_content)
            
            file_size = os.path.getsize(output_path)
            if file_size == 0:
                raise Exception("File is empty")
            
            # Success message
            self.print_success_message(title, subtitle, output_path, file_size, logo_path, website)
            
            if self.validate_svg_file(output_path):
                print("✅ SVG validation passed")
            else:
                print("⚠️  SVG may have issues - creating fallback...")
                self.create_fallback(title, subtitle, output_path, website)
            
            return True
            
        except Exception as e:
            print(f"❌ ERROR writing file: {e}")
            self.create_fallback(title, subtitle, output_path, website)
            return False
    
    def print_success_message(self, title, subtitle, output_path, file_size, logo_path, website):
        """Print a detailed success message"""
        print("\n" + "═" * 60)
        print("✨ ULTIMATE PODCAST COVER CREATED")
        print("═" * 60)
        print(f"📁 Output File: {output_path}")
        print(f"📏 File Size: {file_size:,} bytes")
        print(f"📐 Dimensions: 1080×1920 (Perfect Instagram Story)")
        print()
        print("📝 EPISODE DETAILS:")
        print(f"   • Title: {title}")
        print(f"   • Subtitle: {subtitle if subtitle else 'None'}")
        if self.has_episode:
            print(f"   • Episode: {self.episode_number} → {self.persian_episode}")
        else:
            print(f"   • Episode: Not specified")
        print(f"   • Website: {website} (PERFECTLY CENTERED)")
        print(f"   • Logo: {'Custom' if logo_path else 'Premium Default'}")
        print()
        print("✨ PERFECTION ACHIEVED:")
        print(f"   ✓ Title perfectly within borders (auto-wrapped)")
        print(f"   ✓ Premium multi-layered image border")
        print(f"   ✓ Corner accents on main image")
        print(f"   ✓ Deep shadow effects")
        print(f"   ✓ Inner glow on cover image")
        print(f"   ✓ Elegant bottom bar with gradient line")
        print(f"   ✓ PERFECT horizontal alignment: Logo | URL | Episode")
        print(f"   ✓ All elements aligned to same baseline (y = -100)")
        print(f"   ✓ Website URL ALWAYS perfectly centered")
        if self.has_episode:
            print(f"   ✓ Three-column layout: Logo (Left) | Website (Center) | Episode (Right)")
        else:
            print(f"   ✓ Two-column layout: Logo (Left) | Website (Center)")
        print(f"   ✓ Perfect spacing and visual balance")
        print("═" * 60)
    
    def validate_svg_file(self, filepath):
        """Validate SVG file structure"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            checks = [
                ('XML declaration', '<?xml' in content[:100]),
                ('SVG opening tag', '<svg' in content),
                ('SVG closing tag', '</svg>' in content),
                ('Gradient definitions', 'linearGradient' in content),
                ('Filters', 'filter' in content),
            ]
            
            all_passed = True
            for check_name, check_result in checks:
                if check_result:
                    print(f"   ✓ {check_name}")
                else:
                    print(f"   ✗ {check_name}")
                    all_passed = False
            
            return all_passed
            
        except Exception as e:
            print(f"   ✗ Validation error: {e}")
            return False
    
    def create_fallback(self, title, subtitle, output_path, website):
        """Create a simplified backup SVG with perfect alignment"""
        backup_path = output_path.replace('.svg', '_fallback.svg')
        
        try:
            title_lines = self.wrap_text(title, max_chars_per_line=25)
            title_svg_lines = ""
            for i, line in enumerate(title_lines):
                y_pos = 1280 + (i * 86)
                title_svg_lines += f'  <text x="540" y="{y_pos}" text-anchor="middle" font-family="Helvetica Neue" font-size="86" font-weight="700" fill="{BRAND_COLORS["dark"]}">{self.escape_xml(line)}</text>\n'
            
            simple_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0c0c0c" />
      <stop offset="100%" stop-color="{BRAND_COLORS['light']}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGradient)"/>
  <rect x="140" y="140" width="800" height="800" fill="{BRAND_COLORS['lightgray']}" rx="8"/>
{title_svg_lines}{f'  <text x="540" y="1400" text-anchor="middle" font-family="Helvetica Neue" font-size="48" font-weight="400" fill="{BRAND_COLORS["darkgray"]}">{self.escape_xml(subtitle[:80])}</text>' if subtitle else ''}
  <g transform="translate(0, 1920)">
    <rect x="0" y="-200" width="1080" height="200" fill="#00000010"/>
    <g transform="translate(270, -100)">
      <circle cx="0" cy="0" r="58" fill="{BRAND_COLORS['secondary']}"/>
      <circle cx="0" cy="0" r="54" fill="{BRAND_COLORS['light']}"/>
      <path d="M-15,-15 L25,0 L-15,15 Z" fill="{BRAND_COLORS['dark']}" opacity="0.9"/>
    </g>
    <text x="540" y="-100" text-anchor="middle" font-family="Helvetica Neue" font-size="36" font-weight="300" fill="{BRAND_COLORS['darkgray']}" dominant-baseline="middle">{website}</text>
  </g>
</svg>'''
            
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(simple_svg)
            print(f"📦 Created aligned fallback: {backup_path}")
            return True
        except Exception as e:
            print(f"❌ Could not create backup: {e}")
            return False

def find_image_file(path_hint):
    """Find image file with hints and validation"""
    if not path_hint:
        return None
    
    if path_hint.startswith('~'):
        path_hint = os.path.expanduser(path_hint)
    
    if os.path.exists(path_hint):
        return os.path.abspath(path_hint)
    
    base, ext = os.path.splitext(path_hint)
    if not ext:
        for ext in ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.bmp', '.tiff', '.tif']:
            test_path = base + ext
            if os.path.exists(test_path):
                return os.path.abspath(test_path)
    
    filename = os.path.basename(path_hint)
    if os.path.exists(filename):
        return os.path.abspath(filename)
    
    return None

def print_brand_colors():
    """Display the perfect brand color palette"""
    print("\n" + "🎨" * 30)
    print("PERFECT BRAND COLOR PALETTE")
    print("🎨" * 30)
    for name, color in BRAND_COLORS.items():
        print(f"  {name:20} {color}")
    print("🎨" * 30)

def interactive_mode():
    """Interactive mode with perfect UX"""
    print("\n" + "═" * 60)
    print("✨ ULTIMATE PODCAST COVER GENERATOR v8.2")
    print("═" * 60)
    print("Perfect horizontal alignment for all elements")
    print("═" * 60)
    
    print_brand_colors()
    
    print("\n📝 EPISODE DETAILS")
    print("-" * 40)
    
    title = input("Episode title: ").strip()
    while not title:
        print("❌ Title is required")
        title = input("Episode title: ").strip()
    
    subtitle = input("Episode subtitle (optional): ").strip()
    
    # Optional episode number
    episode = None
    episode_input = input("Episode number (optional, press Enter to skip): ").strip()
    if episode_input:
        while not episode_input.replace('.', '').isdigit():
            print("❌ Please enter a valid episode number or press Enter to skip")
            episode_input = input("Episode number: ").strip()
            if not episode_input:
                break
        if episode_input:
            episode = episode_input
            persian_episode = english_to_persian_digits(episode)
            print(f"   → Persian: {persian_episode}")
    else:
        print("   → No episode number specified")
    
    print("\n🖼️  COVER IMAGE")
    print("-" * 40)
    print("Drag & drop image file or enter path:")
    
    image_path = None
    while not image_path:
        path_input = input("→ ").strip()
        if not path_input:
            print("❌ Cover image is required")
            continue
            
        image_path = find_image_file(path_input)
        
        if image_path:
            print(f"✓ Found: {image_path}")
            try:
                from PIL import Image
                with Image.open(image_path) as img:
                    width, height = img.size
                    print(f"   Size: {width}×{height} pixels")
                    
                    if width < 800 or height < 800:
                        print(f"⚠️  Minimum 800×800 recommended for premium quality")
                    
                    aspect = width / height
                    if abs(aspect - 1) > 0.2:
                        print(f"⚠️  Not square ({aspect:.2f}:1), will be cropped to center")
                        
            except ImportError:
                print("   ℹ️  Install Pillow for image info: pip install Pillow")
            except:
                pass
        else:
            print(f"❌ File not found: {path_input}")
    
    print("\n🎯 LOGO IMAGE (OPTIONAL)")
    print("-" * 40)
    print("Enter path to your logo (square recommended):")
    print("Press Enter to use premium default logo")
    
    logo_path = None
    path_input = input("→ ").strip()
    if path_input:
        logo_path = find_image_file(path_input)
        if logo_path:
            print(f"✓ Found: {logo_path}")
        else:
            print(f"⚠️  Logo not found, using premium default")
            logo_path = None
    else:
        print("Using premium default logo")
    
    print("\n🌐 WEBSITE URL")
    print("-" * 40)
    print("Enter website URL (press Enter for default: mucteba.ir):")
    website = input("→ ").strip()
    if not website:
        website = "mucteba.ir"
    print(f"✓ Website: {website} (WILL BE PERFECTLY ALIGNED)")
    
    print("\n💾 OUTPUT SETTINGS")
    print("-" * 40)
    
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_title = safe_title.replace(' ', '_')[:25]
    
    if episode:
        default_name = f"perfect_podcast_ep{episode}_{safe_title}.svg"
    else:
        default_name = f"perfect_podcast_{safe_title}.svg"
    
    output = input(f"Output filename [{default_name}]: ").strip()
    if not output:
        output = default_name
    if not output.lower().endswith('.svg'):
        output += '.svg'
    
    print("\n" + "═" * 60)
    print("CREATING ULTIMATE PODCAST COVER...")
    print("═" * 60)
    
    generator = PodcastCoverGenerator()
    success = generator.create_podcast_cover(
        title=title,
        subtitle=subtitle,
        image_path=image_path,
        episode_number=episode,
        logo_path=logo_path,
        output_path=output,
        website=website
    )
    
    if success:
        print("\n" + "✨" * 30)
        print("SUCCESS! Ultimate cover created.")
        print("✨" * 30)
        print(f"\n📁 File: {os.path.abspath(output)}")
        print(f"📏 Dimensions: 1080×1920 (Instagram Story)")
        print(f"🎨 Premium Colors Applied")
        if episode:
            print(f"🔢 Episode: {episode}")
        else:
            print(f"🔢 Episode: Not included")
        print(f"🌐 Website: {website} (PERFECTLY ALIGNED)")
        print(f"⭕ Logo: Perfect purple gradient glow")
        print(f"✨ PERFECT ALIGNMENT:")
        print(f"   • Logo, URL, and Episode number on same baseline")
        print(f"   • All elements centered at y = -100")
        print(f"   • Perfect horizontal alignment achieved")
        if episode:
            print(f"   • Three-column: Logo (180) | Website (540) | Episode (900)")
        else:
            print(f"   • Two-column: Logo (270) | Website (540)")
        print(f"✨ PERFECT FEATURES:")
        print(f"   • Title auto-wrapped to fit perfectly")
        print(f"   • Premium multi-layered image border")
        print(f"   • Corner accents and inner glow")
        print(f"   • Deep shadows and perfect spacing")
        print(f"   • Elegant bottom bar with gradient line")
        print("\n🎨 ULTIMATE COLOR SCHEME:")
        print(f"  Background: Gradient #0c0c0c → {BRAND_COLORS['light']}")
        print(f"  Title Text: {BRAND_COLORS['dark']} with glow")
        print(f"  Purple Gradient: {BRAND_COLORS['tertiary']} → {BRAND_COLORS['secondary']} → {BRAND_COLORS['accent_dark']}")
        print("\n💡 HOW TO USE:")
        print("  1. Perfect for premium podcast platforms")
        print("  2. Instagram Stories with perfect borders")
        print("  3. Professional presentations and marketing")
        print("✨" * 30)
        
        try:
            import cairosvg
            convert = input("\nCreate high-quality PNG too? (Y/n): ").strip().lower()
            if convert != 'n':
                png_path = output.replace('.svg', '.png')
                cairosvg.svg2png(
                    url=output,
                    write_to=png_path,
                    output_width=1080,
                    output_height=1920,
                    scale=2
                )
                print(f"✓ High-quality PNG: {png_path}")
        except ImportError:
            print("ℹ️  Install cairosvg for PNG export: pip install cairosvg")
        except Exception as e:
            print(f"⚠️  PNG creation failed: {e}")
    
    else:
        print("\n❌ Failed to create cover")
        print("\n🔧 TROUBLESHOOTING:")
        print("  1. Check image file permissions")
        print("  2. Try with PNG format for better quality")
        print("  3. Ensure adequate disk space")
        print("  4. Try reducing image size if >10MB")
    
    return success

def command_line_mode():
    """Command line mode"""
    parser = argparse.ArgumentParser(
        description='Create ultimate podcast covers with perfect borders and optional episode number',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s --title "عنوان اپیزود" --image cover.jpg --episode 144
  %(prog)s --title "Perfect Podcast" --image photo.png --episode 042 --logo logo.png
  %(prog)s --title "Special Episode" --subtitle "With Guest" --image image.jpg (no episode)
  %(prog)s --title "Logo Only" --image photo.jpg --website "mypodcast.com"

PERFECT ALIGNMENT: Logo, URL, and Episode number are horizontally aligned!
        '''
    )
    
    parser.add_argument('--title', '-t', required=True, help='Episode title')
    parser.add_argument('--subtitle', '-s', default='', help='Episode subtitle')
    parser.add_argument('--image', '-i', required=True, help='Path to cover image')
    parser.add_argument('--episode', '-e', help='Episode number (optional)')
    parser.add_argument('--logo', '-l', help='Path to logo image')
    parser.add_argument('--website', '-w', default='mucteba.ir', help='Website URL (perfectly aligned)')
    parser.add_argument('--output', '-o', default='', help='Output file')
    
    args = parser.parse_args()
    
    image_path = find_image_file(args.image)
    if not image_path:
        print(f"❌ Cover image not found: {args.image}")
        sys.exit(1)
    
    logo_path = None
    if args.logo:
        logo_path = find_image_file(args.logo)
        if not logo_path:
            print(f"⚠️  Logo not found: {args.logo}. Using premium default.")
    
    # Generate output filename
    if not args.output:
        safe_title = "".join(c for c in args.title if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_title = safe_title.replace(' ', '_')[:25]
        if args.episode:
            args.output = f"perfect_podcast_ep{args.episode}_{safe_title}.svg"
        else:
            args.output = f"perfect_podcast_{safe_title}.svg"
    
    print("🎨 Using perfect brand colors:")
    for name, color in BRAND_COLORS.items():
        print(f"  {name:15} {color}")
    print(f"✨ Perfect horizontal alignment for logo, URL, and episode")
    
    generator = PodcastCoverGenerator()
    success = generator.create_podcast_cover(
        args.title, args.subtitle, image_path, args.episode, 
        logo_path, args.output, args.website
    )
    
    if not success:
        sys.exit(1)

def english_to_persian_digits(text):
    """Standalone function for backward compatibility"""
    if not text:
        return ""
    
    digit_map = {
        '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
        '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
    }
    
    result = []
    for char in str(text):
        result.append(digit_map.get(char, char))
    
    return ''.join(result)

def main():
    """Main entry point"""
    print("=" * 60)
    print("✨ ULTIMATE PODCAST COVER GENERATOR v8.2")
    print("=" * 60)
    print("Perfect horizontal alignment for all elements")
    print("=" * 60)
    print(f"🎨 Background: Gradient #0c0c0c → {BRAND_COLORS['light']}")
    print(f"🎨 Title: {BRAND_COLORS['dark']} (auto-wrapped to fit)")
    print(f"🎨 Purple Gradient: {BRAND_COLORS['tertiary']} → {BRAND_COLORS['secondary']}")
    print(f"🌐 Website: Perfectly centered and aligned")
    print(f"🔢 Episode: Optional - creates different layouts")
    print(f"✨ FEATURE: Logo, URL, and Episode perfectly horizontally aligned")
    print("=" * 60)
    
    try:
        if len(sys.argv) > 1:
            command_line_mode()
        else:
            interactive_mode()
    except KeyboardInterrupt:
        print("\n\n⏹️  Process cancelled")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        print("\n💡 Try interactive mode:")
        print("  python podcast_cover.py")
        sys.exit(1)

if __name__ == "__main__":
    mimetypes.init()
    main()
