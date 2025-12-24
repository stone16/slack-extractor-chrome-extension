#!/usr/bin/env python3
"""
Generate PNG icons for the Chrome extension.
Requires Pillow: pip install Pillow
"""

import os

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow is required. Install with: pip install Pillow")
    print("\nAlternatively, you can create icons manually:")
    print("- icon16.png (16x16 pixels)")
    print("- icon48.png (48x48 pixels)")
    print("- icon128.png (128x128 pixels)")
    exit(1)

def create_icon(size):
    """Create a simple icon with the given size."""
    # Create image with Slack-like green background
    img = Image.new('RGBA', (size, size), (46, 182, 125, 255))  # Slack green
    draw = ImageDraw.Draw(img)

    # Draw a simple search/extract icon
    padding = size // 6
    circle_radius = size // 3

    # Draw magnifying glass circle
    circle_x = size // 2 - padding // 2
    circle_y = size // 2 - padding // 2
    draw.ellipse(
        [circle_x - circle_radius, circle_y - circle_radius,
         circle_x + circle_radius, circle_y + circle_radius],
        outline=(255, 255, 255, 255),
        width=max(2, size // 16)
    )

    # Draw magnifying glass handle
    handle_length = size // 4
    handle_start_x = circle_x + int(circle_radius * 0.7)
    handle_start_y = circle_y + int(circle_radius * 0.7)
    draw.line(
        [handle_start_x, handle_start_y,
         handle_start_x + handle_length, handle_start_y + handle_length],
        fill=(255, 255, 255, 255),
        width=max(2, size // 16)
    )

    # Draw download arrow inside circle
    arrow_size = size // 6
    arrow_x = circle_x
    arrow_y = circle_y

    # Arrow body (vertical line)
    draw.line(
        [arrow_x, arrow_y - arrow_size // 2,
         arrow_x, arrow_y + arrow_size // 2],
        fill=(255, 255, 255, 255),
        width=max(1, size // 24)
    )

    # Arrow head
    draw.polygon([
        (arrow_x, arrow_y + arrow_size // 2 + size // 16),
        (arrow_x - arrow_size // 3, arrow_y + arrow_size // 4),
        (arrow_x + arrow_size // 3, arrow_y + arrow_size // 4),
    ], fill=(255, 255, 255, 255))

    return img

def main():
    os.makedirs("icons", exist_ok=True)
    sizes = [16, 48, 128]

    for size in sizes:
        img = create_icon(size)
        filename = f"icons/icon{size}.png"
        img.save(filename, 'PNG')
        print(f"Created {filename}")

    print("\nIcons generated successfully!")
    print("You can now load the extension in Chrome.")

if __name__ == "__main__":
    main()
