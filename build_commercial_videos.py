#!/usr/bin/env python3
"""
UPSTAGE POS - Professional Apple-Style Video Production Pipeline
Renders:
1. UPSTAGE_POS_Premium_Explainer_4K.mp4 (~73s, 16:9 Master)
2. UPSTAGE_POS_Short_Advertisement_30s.mp4 (~32s, 16:9 Commercial Cut)
3. UPSTAGE_POS_Vertical_Advertisement.mp4 (~30s, 9:16 Social Cut)
"""

import os
import sys
import subprocess
import time
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FFMPEG = "/Users/upstage_1/Desktop/Upstagekadai/bin/ffmpeg"
BASE_DIR = os.path.expanduser("~/Desktop/Ramesh")
PROJ_DIR = os.path.join(BASE_DIR, "Upstage_POS_Explainer_Project")
SOURCE_DIR = os.path.join(PROJ_DIR, "Source_Clips")
GRAPHICS_DIR = os.path.join(PROJ_DIR, "Graphics")
ANIM_DIR = os.path.join(PROJ_DIR, "Animations")
MUSIC_DIR = os.path.join(PROJ_DIR, "Music")
FINAL_DIR = os.path.join(BASE_DIR, "Final_Videos")

os.makedirs(GRAPHICS_DIR, exist_ok=True)
os.makedirs(ANIM_DIR, exist_ok=True)
os.makedirs(FINAL_DIR, exist_ok=True)

FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"
BOLD_FONT_INDEX = 1
REG_FONT_INDEX = 0

def get_font(size, bold=False):
    index = BOLD_FONT_INDEX if bold else REG_FONT_INDEX
    try:
        return ImageFont.truetype(FONT_PATH, size, index=index)
    except Exception:
        return ImageFont.truetype(FONT_PATH, size)

# ==============================================================
# 🎨 1. GRAPHIC ASSETS GENERATION
# ==============================================================

def create_studio_bg(width=1920, height=1080, filename="studio_bg_16_9.png", spotlight_x=1550):
    img = Image.new("RGBA", (width, height), (11, 15, 25, 255))
    draw = ImageDraw.Draw(img)
    
    for y in range(height):
        factor = y / height
        r = int(9 + factor * 8)
        g = int(13 + factor * 10)
        b = int(22 + factor * 14)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
        
    spotlight = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sp_draw = ImageDraw.Draw(spotlight)
    max_radius = 580
    for rad in range(max_radius, 0, -15):
        alpha = int(48 * (1.0 - rad / max_radius))
        bbox = [spotlight_x - rad, height // 2 - rad, spotlight_x + rad, height // 2 + rad]
        sp_draw.ellipse(bbox, fill=(37, 99, 235, alpha))
        
    spotlight = spotlight.filter(ImageFilter.GaussianBlur(45))
    img = Image.alpha_composite(img, spotlight)
    
    # Drop shadow behind phone mockup
    px, py = 1330, 60
    pw, ph = 464, 960
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([px - 14, py - 10, px + pw + 14, py + ph + 26], radius=56, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(32))
    img = Image.alpha_composite(img, shadow)
    
    out_path = os.path.join(GRAPHICS_DIR, filename)
    img.save(out_path)
    return out_path

def create_iphone_mockup_16_9():
    width, height = 1920, 1080
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    px, py = 1330, 60
    pw, ph = 464, 960
    corner_rad = 50
    
    # Sleek Titanium Outer Bezel (100% TRANSPARENT SCREEN INTERIOR)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([px, py, px + pw, py + ph], radius=corner_rad, fill=None, outline=(64, 76, 96, 255), width=11)
    draw.rounded_rectangle([px + 10, py + 10, px + pw - 10, py + ph - 10], radius=corner_rad - 9, fill=None, outline=(24, 29, 40, 255), width=2)
    
    # 3. Dynamic Island
    di_w, di_h = 104, 28
    di_x = px + (pw - di_w) // 2
    di_y = py + 22
    draw.rounded_rectangle([di_x, di_y, di_x + di_w, di_y + di_h], radius=14, fill=(0, 0, 0, 255))
    
    out_path = os.path.join(GRAPHICS_DIR, "iphone_frame_16_9.png")
    img.save(out_path)
    return out_path

def create_screen_mask(w=442, h=938, radius=40):
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    out_path = os.path.join(GRAPHICS_DIR, "screen_mask.png")
    mask.save(out_path)
    return out_path

# ==============================================================
# 📝 2. APPLE-STYLE SCENE TITLE CARDS
# ==============================================================

SCENES_CONFIG = [
    {
        "id": "01",
        "clip": "01_Splash_Screen.mp4",
        "duration": 4.5,
        "is_intro": True,
        "pill": "OFFICIAL PRODUCT PREVIEW",
        "title": "UPSTAGE POS",
        "subtitle": "One Platform. Complete Business Control.",
        "bullets": [
            "Next-Generation Smart Point of Sale",
            "Built for High-Speed Retail & Dining",
            "Native iOS Performance & Cloud Sync"
        ],
        "accent": (59, 130, 246)
    },
    {
        "id": "02",
        "clip": "03_Dashboard.mp4",
        "duration": 6.0,
        "pill": "INTELLIGENT ARCHITECTURE",
        "title": "Meet Your Smarter POS",
        "subtitle": "Run your entire store or restaurant directly from your iPhone.",
        "bullets": [
            "Real-time Cloud Sync & Offline Resilience",
            "Zero Hardware Setup Required",
            "Modern Apple Design & Fluid Touch UI"
        ],
        "accent": (99, 102, 241)
    },
    {
        "id": "03",
        "clip": "03_Dashboard.mp4",
        "duration": 6.5,
        "pill": "REAL-TIME FINANCIALS",
        "title": "Your Entire Business.\nOne Dashboard.",
        "subtitle": "Live revenue, today's sales, and profit growth metrics.",
        "bullets": [
            "Live Total Sales & Today's Takings",
            "Interactive Visual Net Profit Growth Charts",
            "Dual Local Store & Global Catalog Modes"
        ],
        "accent": (16, 185, 129)
    },
    {
        "id": "04",
        "clip": "04_Shop_Profile.mp4",
        "duration": 5.5,
        "pill": "STORE MANAGEMENT",
        "title": "Manage Your Shop Effortlessly",
        "subtitle": "Custom business branding, tax settings, and online store switch.",
        "bullets": [
            "Digital Store Profile & Custom Shop UID",
            "Instant Online Store Enable/Disable Toggle",
            "GST, Location & Contact Details Management"
        ],
        "accent": (59, 130, 246)
    },
    {
        "id": "05",
        "clip": "06_Inventory.mp4",
        "duration": 6.0,
        "pill": "SMART WAREHOUSING",
        "title": "Complete Inventory Control",
        "subtitle": "Track stocks, set low inventory warnings, and manage restocks.",
        "bullets": [
            "Live Stock Counts & Low Stock Alerts",
            "Categorized Product Catalogs & Brands",
            "AI Background Remover for Product Photos"
        ],
        "accent": (245, 158, 11)
    },
    {
        "id": "06",
        "clip": "08_Barcode_Scanner.mp4",
        "duration": 6.0,
        "pill": "LIGHTNING BARCODE ENGINE",
        "title": "Scan. Add. Sell.",
        "subtitle": "High-speed camera & Bluetooth gun scanner recognition in milliseconds.",
        "bullets": [
            "Built-in Camera Laser Viewfinder",
            "Universal Bluetooth Barcode Gun Support",
            "Instant SKU Lookup & Auto Cart Tally"
        ],
        "accent": (16, 185, 129)
    },
    {
        "id": "07",
        "clip": "09_POS_Billing.mp4",
        "duration": 6.5,
        "pill": "COUNTER TERMINAL",
        "title": "Billing Made Simple",
        "subtitle": "Generate itemized invoices and serve customers in seconds.",
        "bullets": [
            "Rapid Quantity Toggles & Cart Edits",
            "Instant Subtotal & Tax Calculation",
            "Hold & Resume Active Orders Anytime"
        ],
        "accent": (99, 102, 241)
    },
    {
        "id": "08",
        "clip": "10_Cart.mp4",
        "duration": 6.0,
        "pill": "INSTANT CHECKOUT",
        "title": "Faster Checkout.\nBetter Experience.",
        "subtitle": "Accept multiple payment modes and generate instant digital receipts.",
        "bullets": [
            "Cash, Dynamic UPI QR & Card Payments",
            "Bluetooth Thermal Printer Integration",
            "Digital PDF Receipts via WhatsApp & AirDrop"
        ],
        "accent": (16, 185, 129)
    },
    {
        "id": "09",
        "clip": "12_Orders.mp4",
        "duration": 6.0,
        "pill": "ORDER LOGISTICS",
        "title": "Everything Organized.\nEvery Order Managed.",
        "subtitle": "Live order tracking with delivery boy assignment and timeline.",
        "bullets": [
            "Real-time Order Status (New, Hold, Done)",
            "Door Delivery Routing with Map Navigation",
            "Direct Customer Calling with One Touch"
        ],
        "accent": (59, 130, 246)
    },
    {
        "id": "10",
        "clip": "14_Analytics.mp4",
        "duration": 6.0,
        "pill": "BUSINESS INTELLIGENCE",
        "title": "Understand Your Business Better",
        "subtitle": "Visual sales registers, daybook ledgers, and profit reports.",
        "bullets": [
            "Daily Sales Registers with Cash Balancing",
            "Reconcile Expenses & Close Day Fast",
            "Export Invoices & Detailed Tax Summaries"
        ],
        "accent": (168, 85, 247)
    },
    {
        "id": "11",
        "clip": "15_Subscription_Plans.mp4",
        "duration": 6.5,
        "pill": "TRANSPARENT PRICING",
        "title": "Plans That Grow With You",
        "subtitle": "Simple pricing tiers designed for startups to expanding enterprises.",
        "bullets": [
            "BASIC: Free Forever Starter Features",
            "PREMIUM (₹499/mo): Unlimited Scans & Online Catalog",
            "PRO (₹1,999/mo): Multi-Staff, KDS & Analytics"
        ],
        "accent": (234, 179, 8)
    },
    {
        "id": "12",
        "clip": "03_Dashboard.mp4",
        "duration": 5.5,
        "is_outro": True,
        "pill": "GET STARTED TODAY",
        "title": "UPSTAGE POS",
        "subtitle": "Run Your Business. Smarter.",
        "bullets": [
            "Available on iOS & Modern Devices",
            "Instant Setup • No Expensive Hardware",
            "Transform Your Business Today"
        ],
        "accent": (59, 130, 246)
    }
]

def render_title_card(scene, width=1920, height=1080):
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    is_fullscreen = scene.get("is_intro") or scene.get("is_outro")
    
    if is_fullscreen:
        cx = width // 2
        
        # Pill badge
        pill_text = scene["pill"]
        p_font = get_font(20, bold=True)
        bbox = draw.textbbox((0, 0), pill_text, font=p_font)
        pw, ph = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pill_box = [cx - pw//2 - 22, 330, cx + pw//2 + 22, 330 + ph + 16]
        draw.rounded_rectangle(pill_box, radius=18, fill=(30, 41, 59, 220), outline=scene["accent"], width=2)
        draw.text((cx - pw//2, 338), pill_text, font=p_font, fill=scene["accent"])
        
        # Main Title
        t_font = get_font(88, bold=True)
        bbox_t = draw.textbbox((0, 0), scene["title"], font=t_font)
        tw = bbox_t[2] - bbox_t[0]
        draw.text((cx - tw//2, 400), scene["title"], font=t_font, fill=(255, 255, 255, 255))
        
        # Subtitle
        s_font = get_font(34, bold=False)
        bbox_s = draw.textbbox((0, 0), scene["subtitle"], font=s_font)
        sw = bbox_s[2] - bbox_s[0]
        draw.text((cx - sw//2, 515), scene["subtitle"], font=s_font, fill=(148, 163, 184, 255))
        
        # Bullets
        b_font = get_font(24, bold=False)
        by = 610
        for bullet in scene["bullets"]:
            b_text = f"•  {bullet}"
            bbox_b = draw.textbbox((0, 0), b_text, font=b_font)
            bw = bbox_b[2] - bbox_b[0]
            draw.text((cx - bw//2, by), b_text, font=b_font, fill=(203, 213, 225, 255))
            by += 46
            
    else:
        lx = 110
        
        # Pill badge
        pill_text = scene["pill"]
        p_font = get_font(18, bold=True)
        bbox = draw.textbbox((0, 0), pill_text, font=p_font)
        pw, ph = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pill_box = [lx, 150, lx + pw + 34, 150 + ph + 16]
        draw.rounded_rectangle(pill_box, radius=16, fill=(30, 41, 59, 210), outline=scene["accent"], width=2)
        draw.text((lx + 17, 158), pill_text, font=p_font, fill=scene["accent"])
        
        # Main Title
        t_font = get_font(56, bold=True)
        lines = scene["title"].split("\n")
        ty = 220
        for line in lines:
            draw.text((lx, ty), line, font=t_font, fill=(255, 255, 255, 255))
            ty += 68
            
        # Subtitle
        s_font = get_font(26, bold=False)
        draw.text((lx, ty + 12), scene["subtitle"], font=s_font, fill=(148, 163, 184, 255))
        
        # Feature Bullets with crisp vector checkmarks
        by = ty + 95
        b_font = get_font(22, bold=False)
        for bullet in scene["bullets"]:
            # Icon Circle
            draw.rounded_rectangle([lx, by + 2, lx + 26, by + 28], radius=13, fill=scene["accent"])
            # Vector checkmark
            draw.line([(lx + 7, by + 15), (lx + 12, by + 21), (lx + 20, by + 9)], fill=(255, 255, 255), width=3)
            # Text
            draw.text((lx + 42, by + 2), bullet, font=b_font, fill=(226, 232, 240, 255))
            by += 52
            
    out_path = os.path.join(GRAPHICS_DIR, f"title_{scene['id']}.png")
    img.save(out_path)
    return out_path

# ==============================================================
# 🎬 3. COMPOSITE SCENES
# ==============================================================

def render_scene_clip(scene, studio_bg, phone_mockup, screen_mask):
    out_file = os.path.join(ANIM_DIR, f"scene_{scene['id']}.mp4")
    dur = scene["duration"]
    
    is_fullscreen = scene.get("is_intro") or scene.get("is_outro")
    title_png = os.path.join(GRAPHICS_DIR, f"title_{scene['id']}.png")
    
    clip_path = os.path.join(SOURCE_DIR, scene["clip"])
    if not os.path.exists(clip_path):
        clip_path = os.path.join(SOURCE_DIR, "03_Dashboard.mp4")
        
    print(f"▶️ Rendering Scene {scene['id']}: {scene['title'].replace(chr(10), ' ')} ({dur}s)...")
    
    if is_fullscreen:
        logo_png = os.path.join(GRAPHICS_DIR, "logo.png")
        cmd = [
            FFMPEG, "-y",
            "-loop", "1", "-t", str(dur), "-i", studio_bg,
            "-loop", "1", "-t", str(dur), "-i", logo_png,
            "-loop", "1", "-t", str(dur), "-i", title_png,
            "-filter_complex",
            f"[1:v]scale=220:220[logo];"
            f"[0:v][logo]overlay=(W-w)/2:75:format=auto[v1];"
            f"[v1][2:v]overlay=0:0:format=auto,fade=t=in:st=0:d=0.5,fade=t=out:st={dur-0.5}:d=0.5[vout]",
            "-map", "[vout]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
            out_file
        ]
    else:
        # Screen area inside phone: x=1341, y=71, w=442, h=938
        cmd = [
            FFMPEG, "-y",
            "-loop", "1", "-t", str(dur), "-i", studio_bg,
            "-ss", "0.5", "-t", str(dur), "-i", clip_path,
            "-loop", "1", "-t", str(dur), "-i", phone_mockup,
            "-loop", "1", "-t", str(dur), "-i", title_png,
            "-loop", "1", "-t", str(dur), "-i", screen_mask,
            "-filter_complex",
            f"[1:v]setpts=PTS-STARTPTS,scale=442:938:force_original_aspect_ratio=increase,crop=442:938[scaled_scr];"
            f"[4:v]setpts=PTS-STARTPTS[m];"
            f"[scaled_scr][m]alphamerge[masked_scr];"
            f"[0:v]setpts=PTS-STARTPTS[bg];"
            f"[bg][masked_scr]overlay=1341:71:format=auto[v1];"
            f"[v1][2:v]overlay=0:0:format=auto[v2];"
            f"[v2][3:v]overlay=0:0:format=auto,fade=t=in:st=0:d=0.5[vout]",
            "-map", "[vout]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
            out_file
        ]
        
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        print(f"❌ Error rendering scene {scene['id']}:\n{res.stderr.decode('utf-8')[-400:]}")
        return None
        
    print(f"✅ Scene {scene['id']} complete: {out_file}")
    return out_file

# ==============================================================
# 🎞️ 4. MASTER VIDEO ASSEMBLY
# ==============================================================

def assemble_master_video(rendered_scenes, output_filename, music_file="UPSTAGE_Soundtrack_Long.wav"):
    concat_list = os.path.join(ANIM_DIR, "concat_list.txt")
    with open(concat_list, "w") as f:
        for s in rendered_scenes:
            f.write(f"file '{s}'\n")
            
    out_video = os.path.join(FINAL_DIR, output_filename)
    bgm_path = os.path.join(MUSIC_DIR, music_file)
    chime_path = os.path.join(MUSIC_DIR, "chime.wav")
    
    print(f"\n🎛️ Assembling Final Master Video: {out_video}...")
    
    temp_video = os.path.join(ANIM_DIR, "assembled_raw.mp4")
    subprocess.run([
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0", "-i", concat_list,
        "-c", "copy",
        temp_video
    ], check=True)
    
    final_cmd = [
        FFMPEG, "-y",
        "-i", temp_video,
        "-i", bgm_path,
        "-i", chime_path,
        "-filter_complex",
        "[1:a]volume=0.85,afade=t=in:st=0:d=2.0,afade=t=out:st=68:d=3.5[bgm];"
        "[2:a]volume=0.8,adelay=300|300[sfx];"
        "[bgm][sfx]amix=inputs=2:duration=first[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "256k",
        "-shortest",
        out_video
    ]
    subprocess.run(final_cmd, check=True)
    size_mb = os.path.getsize(out_video) / (1024 * 1024)
    print(f"🎉 MASTER EXPLAINER DELIVERED: {out_video} ({size_mb:.2f} MB)")
    return out_video

# ==============================================================
# ⚡ 5. SHORT 30-SECOND COMMERCIAL CUT (16:9)
# ==============================================================

def assemble_short_commercial():
    out_video = os.path.join(FINAL_DIR, "UPSTAGE_POS_Short_Advertisement_30s.mp4")
    bgm_path = os.path.join(MUSIC_DIR, "UPSTAGE_Soundtrack_Short.wav")
    
    short_scenes = ["01", "03", "06", "07", "08", "11", "12"]
    short_concat = os.path.join(ANIM_DIR, "short_concat.txt")
    
    with open(short_concat, "w") as f:
        for sid in short_scenes:
            f.write(f"file '{os.path.join(ANIM_DIR, f'scene_{sid}.mp4')}'\n")
            
    temp_video = os.path.join(ANIM_DIR, "short_assembled_raw.mp4")
    subprocess.run([
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0", "-i", short_concat,
        "-c", "copy",
        temp_video
    ], check=True)
    
    final_cmd = [
        FFMPEG, "-y",
        "-i", temp_video,
        "-i", bgm_path,
        "-filter_complex",
        "[1:a]volume=0.9,afade=t=in:st=0:d=1.5,afade=t=out:st=28:d=3.0[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "256k",
        "-shortest",
        out_video
    ]
    subprocess.run(final_cmd, check=True)
    size_mb = os.path.getsize(out_video) / (1024 * 1024)
    print(f"⚡ SHORT ADVERTISEMENT DELIVERED: {out_video} ({size_mb:.2f} MB)")
    return out_video

# ==============================================================
# 📱 6. VERTICAL SOCIAL MEDIA ADVERTISEMENT (9:16)
# ==============================================================

def assemble_vertical_advertisement():
    out_video = os.path.join(FINAL_DIR, "UPSTAGE_POS_Vertical_Advertisement.mp4")
    bgm_path = os.path.join(MUSIC_DIR, "UPSTAGE_Soundtrack_Short.wav")
    
    bg_vert = os.path.join(GRAPHICS_DIR, "studio_bg_9_16.png")
    img = Image.new("RGBA", (1080, 1920), (11, 15, 25, 255))
    draw = ImageDraw.Draw(img)
    for y in range(1920):
        factor = y / 1920
        draw.line([(0, y), (1080, y)], fill=(int(9 + factor * 8), int(13 + factor * 10), int(22 + factor * 14), 255))
        
    sp = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
    sp_draw = ImageDraw.Draw(sp)
    sp_draw.ellipse([240, 600, 840, 1300], fill=(37, 99, 235, 60))
    sp = sp.filter(ImageFilter.GaussianBlur(60))
    img = Image.alpha_composite(img, sp)
    img.save(bg_vert)
    
    mask_vert = os.path.join(GRAPHICS_DIR, "mask_vert.png")
    m_img = Image.new("L", (550, 1200), 0)
    m_draw = ImageDraw.Draw(m_img)
    m_draw.rounded_rectangle([0, 0, 550, 1200], radius=52, fill=255)
    m_img.save(mask_vert)
    
    # Bezel with TRANSPARENT SCREEN CENTER
    bezel_vert = os.path.join(GRAPHICS_DIR, "bezel_vert.png")
    b_img = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(b_img)
    bx, by, bw, bh = 250, 340, 580, 1230
    b_draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=58, fill=None, outline=(64, 76, 96, 255), width=12)
    b_draw.rounded_rectangle([bx + 11, by + 11, bx + bw - 11, by + bh - 11], radius=50, fill=None, outline=(24, 29, 40, 255), width=2)
    b_img.save(bezel_vert)
    
    txt_vert = os.path.join(GRAPHICS_DIR, "text_vert.png")
    t_img = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(t_img)
    
    t_draw.text((540 - 150, 150), "UPSTAGE POS", font=get_font(48, bold=True), fill=(255, 255, 255))
    t_draw.text((540 - 210, 220), "One Platform. Complete Business Control.", font=get_font(22, bold=False), fill=(148, 163, 184))
    
    t_draw.rounded_rectangle([540 - 240, 1640, 540 + 240, 1720], radius=40, fill=(37, 99, 235), outline=(96, 165, 250), width=2)
    t_draw.text((540 - 160, 1664), "Get Started Free on iOS", font=get_font(26, bold=True), fill=(255, 255, 255))
    t_img.save(txt_vert)
    
    dash_clip = os.path.join(SOURCE_DIR, "03_Dashboard.mp4")
    vert_cmd = [
        FFMPEG, "-y",
        "-loop", "1", "-t", "30.0", "-i", bg_vert,
        "-ss", "0.5", "-t", "30.0", "-i", dash_clip,
        "-loop", "1", "-t", "30.0", "-i", bezel_vert,
        "-loop", "1", "-t", "30.0", "-i", mask_vert,
        "-loop", "1", "-t", "30.0", "-i", txt_vert,
        "-i", bgm_path,
        "-filter_complex",
        "[1:v]scale=550:1200:force_original_aspect_ratio=increase,crop=550:1200[scaled];"
        "[scaled][3:v]alphamerge[masked];"
        "[0:v][masked]overlay=265:355:format=auto[v1];"
        "[v1][2:v]overlay=0:0:format=auto[v2];"
        "[v2][4:v]overlay=0:0:format=auto,fade=t=in:st=0:d=1.0[vout];"
        "[5:a]volume=0.9,afade=t=in:st=0:d=1.5,afade=t=out:st=27:d=3.0[aout]",
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "256k",
        "-shortest",
        out_video
    ]
    subprocess.run(vert_cmd, check=True)
    size_mb = os.path.getsize(out_video) / (1024 * 1024)
    print(f"📱 VERTICAL ADVERTISEMENT DELIVERED: {out_video} ({size_mb:.2f} MB)")
    return out_video

def main():
    print("🎬 STARTING UPSTAGE POS APPLE-STYLE VIDEO RE-RENDER (TRANSPARENT BEZEL & VECTOR ICONS)...")
    t0 = time.time()
    
    studio_bg = create_studio_bg()
    phone_mockup = create_iphone_mockup_16_9()
    screen_mask = create_screen_mask()
    
    for sc in SCENES_CONFIG:
        render_title_card(sc)
        
    rendered_scenes = []
    for sc in SCENES_CONFIG:
        clip = render_scene_clip(sc, studio_bg, phone_mockup, screen_mask)
        if clip:
            rendered_scenes.append(clip)
            
    master_video = assemble_master_video(rendered_scenes, "UPSTAGE_POS_Premium_Explainer_4K.mp4")
    short_video = assemble_short_commercial()
    vert_video = assemble_vertical_advertisement()
    
    elapsed = time.time() - t0
    print(f"\n🏆 ALL DELIVERABLES FINISHED IN {elapsed:.1f}s!")

if __name__ == "__main__":
    main()
