#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import signal
import shutil
import struct
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

SIMULATOR_UDID = "09FB25A4-0F86-45BC-9FF4-FA123DABD362"
BASE_DIR = os.path.expanduser("~/Desktop/Ramesh/Upstage_POS_Promotional_Videos")
FINAL_DIR = os.path.join(BASE_DIR, "Final_Recordings")

# Global navigation target for the HTTP server
current_cmd = "idle"

class NavHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global current_cmd
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(current_cmd.encode('utf-8'))
    def log_message(self, format, *args):
        pass

def start_nav_server():
    server = HTTPServer(('127.0.0.1', 8765), NavHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

def set_nav(target):
    global current_cmd
    current_cmd = target
    time.sleep(1.8)
    current_cmd = "idle"

def get_mp4_duration(filename):
    try:
        with open(filename, 'rb') as f:
            data = f.read()
        idx = data.find(b'mvhd')
        if idx == -1:
            return None
        version = data[idx+4]
        if version == 0:
            timescale, duration = struct.unpack('>II', data[idx+16:idx+24])
        else:
            timescale, duration = struct.unpack('>IQ', data[idx+24:idx+36])
        return duration / timescale if timescale else None
    except Exception as e:
        return None

def record_screen(nav_cmd, category_folder, filename, is_final=False, post_nav_action=None):
    print(f"\n==========================================")
    print(f"🎬 RECORDING: {filename}")
    print(f"📁 Category: {category_folder}")
    print(f"🎯 Navigation: {nav_cmd}")
    print(f"==========================================")
    
    # 1. Navigate to screen
    set_nav(nav_cmd)
    time.sleep(1.5)
    
    # 2. Setup paths
    out_dir = os.path.join(BASE_DIR, category_folder)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, filename)
    
    # 3. Start recording
    rec_cmd = ["xcrun", "simctl", "io", SIMULATOR_UDID, "recordVideo", "--codec=h264", out_file]
    proc = subprocess.Popen(rec_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"⏺️  Recording started (PID: {proc.pid})...")
    
    # 4. Wait & perform natural UI interaction if specified
    start_time = time.time()
    if post_nav_action:
        time.sleep(3.0)
        try:
            post_nav_action()
        except Exception as e:
            print("Action error:", e)
    
    # Ensure full 10-second duration
    elapsed = time.time() - start_time
    remaining = 10.2 - elapsed
    if remaining > 0:
        time.sleep(remaining)
        
    # 5. Stop recording cleanly
    print(f"⏹️  Stopping recording after 10s...")
    proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        
    time.sleep(1.0)
    
    # 6. Verify recording
    if not os.path.exists(out_file):
        print(f"❌ ERROR: File does not exist: {out_file}")
        return False
        
    size_bytes = os.path.getsize(out_file)
    dur = get_mp4_duration(out_file)
    print(f"✅ Saved: {out_file}")
    print(f"📊 Size: {size_bytes / (1024*1024):.2f} MB | Duration: {dur:.2f}s" if dur else f"📊 Size: {size_bytes} B")
    
    # 7. Copy to Final_Recordings if specified
    if is_final:
        os.makedirs(FINAL_DIR, exist_ok=True)
        final_file = os.path.join(FINAL_DIR, filename)
        shutil.copy2(out_file, final_file)
        print(f"🌟 Copied to Final_Recordings: {filename}")
        
    return True

def main():
    print("🚀 Initializing Upstage POS Demo Recording Automation...")
    server = start_nav_server()
    time.sleep(1)
    
    # Actions for natural scrolling
    def scroll_down():
        subprocess.run(["osascript", "-e", '''
tell application "Simulator" to activate
tell application "System Events"
    tell process "Simulator"
        key code 125
        delay 0.5
        key code 125
        delay 0.5
        key code 126
    end tell
end tell
'''], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    recordings = [
        # 1. 01_Splash_Login
        {
            "nav": 'RESET_ROOT|{"screen":"Splash"}',
            "folder": "01_Splash_Login",
            "file": "01_Splash_Screen.mp4",
            "is_final": True,
        },
        {
            "nav": 'RESET_ROOT|{"screen":"Login"}',
            "folder": "01_Splash_Login",
            "file": "02_Login_Screen.mp4",
            "is_final": True,
        },
        {
            "nav": "StaffLogin",
            "folder": "01_Splash_Login",
            "file": "02b_Staff_Login_Screen.mp4",
            "is_final": False,
        },
        {
            "nav": "Register",
            "folder": "01_Splash_Login",
            "file": "02c_Register_Screen.mp4",
            "is_final": False,
        },
        
        # 2. 02_Dashboard
        {
            "nav": 'RESET_ROOT|{"screen":"Dashboard"}',
            "folder": "02_Dashboard",
            "file": "03_Dashboard.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        {
            "nav": 'RESET_ROOT|{"screen":"Dashboard"}',
            "folder": "02_Dashboard",
            "file": "03b_Dashboard_Growth_Profit.mp4",
            "is_final": False,
        },
        
        # 3. 03_Shop_Profile
        {
            "nav": "Profile",
            "folder": "03_Shop_Profile",
            "file": "04_Shop_Profile.mp4",
            "is_final": True,
        },
        
        # 4. 04_Product_Management
        {
            "nav": "RestaurantMenu",
            "folder": "04_Product_Management",
            "file": "05_Product_Management.mp4",
            "is_final": True,
        },
        {
            "nav": "AddFoods",
            "folder": "04_Product_Management",
            "file": "07_Add_Product.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 5. 05_Inventory
        {
            "nav": "Inventory",
            "folder": "05_Inventory",
            "file": "06_Inventory.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        {
            "nav": "PurchaseHistory",
            "folder": "05_Inventory",
            "file": "06b_Purchase_Restock.mp4",
            "is_final": False,
        },
        
        # 6. 06_Barcode_Scanner
        {
            "nav": "Scan",
            "folder": "06_Barcode_Scanner",
            "file": "08_Barcode_Scanner.mp4",
            "is_final": True,
        },
        
        # 7. 07_POS_Billing
        {
            "nav": "Sales",
            "folder": "07_POS_Billing",
            "file": "09_POS_Billing.mp4",
            "is_final": True,
        },
        
        # 8. 08_Cart_Checkout
        {
            "nav": 'Sales|{"showReview":true}',
            "folder": "08_Cart_Checkout",
            "file": "10_Cart.mp4",
            "is_final": True,
        },
        {
            "nav": 'Sales|{"showReview":true}',
            "folder": "08_Cart_Checkout",
            "file": "11_Checkout.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 9. 09_Orders
        {
            "nav": "Orders",
            "folder": "09_Orders",
            "file": "12_Orders.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 10. 10_Customers
        {
            "nav": "StaffCreation",
            "folder": "10_Customers",
            "file": "13_Customers.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 11. 11_Reports_Analytics
        {
            "nav": "SalesHistory",
            "folder": "11_Reports_Analytics",
            "file": "14_Analytics.mp4",
            "is_final": True,
        },
        {
            "nav": "JournalEntry",
            "folder": "11_Reports_Analytics",
            "file": "14b_Journal_Daybook.mp4",
            "is_final": False,
        },
        
        # 12. 12_Subscriptions
        {
            "nav": "Subscription",
            "folder": "12_Subscriptions",
            "file": "15_Subscription_Plans.mp4",
            "is_final": True,
        },
        {
            "nav": "Subscription",
            "folder": "12_Subscriptions",
            "file": "16_BASIC_Subscription.mp4",
            "is_final": True,
        },
        {
            "nav": "Subscription",
            "folder": "12_Subscriptions",
            "file": "17_PREMIUM_Subscription.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        {
            "nav": "Subscription",
            "folder": "12_Subscriptions",
            "file": "18_PRO_Subscription.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 13. 13_Settings
        {
            "nav": "Settings",
            "folder": "13_Settings",
            "file": "19_Settings.mp4",
            "is_final": True,
            "action": scroll_down,
        },
        
        # 14. 14_Other_Screens
        {
            "nav": "RestaurantBilling",
            "folder": "14_Other_Screens",
            "file": "20_Restaurant_Sales_Billing.mp4",
            "is_final": True,
        },
        {
            "nav": "WaiterOrder",
            "folder": "14_Other_Screens",
            "file": "21_Waiter_Order.mp4",
            "is_final": False,
        },
        {
            "nav": "KitchenDisplay",
            "folder": "14_Other_Screens",
            "file": "22_Kitchen_Display.mp4",
            "is_final": False,
        },
        {
            "nav": 'RESET_ROOT|{"screen":"Onboarding"}',
            "folder": "14_Other_Screens",
            "file": "23_Onboarding_Screen.mp4",
            "is_final": False,
        },
    ]
    
    results = []
    for item in recordings:
        success = record_screen(
            item["nav"],
            item["folder"],
            item["file"],
            item["is_final"],
            item.get("action")
        )
        results.append({
            "file": item["file"],
            "folder": item["folder"],
            "is_final": item["is_final"],
            "success": success
        })
        time.sleep(1.0)
        
    print("\n🎉 ALL SCREEN RECORDINGS COMPLETED!")
    print(f"Total screens processed: {len(results)}")
    print(f"Successful: {sum(1 for r in results if r['success'])}")
    
    server.shutdown()

if __name__ == "__main__":
    main()
