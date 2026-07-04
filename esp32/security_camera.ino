/*
 * ESP32-CAM Security Camera Firmware
 * Hardware: AI-Thinker ESP32-CAM module
 * Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)
 * Board Settings: PSRAM must be enabled (Tools -> PSRAM -> "Enabled")
 * Power: 5V / 2A minimum (USB ports often insufficient)
 */

#include <esp_camera.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ESPmDNS.h>

#define CAM_PWDN_GPIO    32
#define CAM_RESET_GPIO   -1
#define CAM_XCLK_GPIO    0
#define CAM_SIOD_GPIO    26
#define CAM_SIOC_GPIO    27
#define CAM_Y9_GPIO      35
#define CAM_Y8_GPIO      34
#define CAM_Y7_GPIO      39
#define CAM_Y6_GPIO      36
#define CAM_Y5_GPIO      21
#define CAM_Y4_GPIO      19
#define CAM_Y3_GPIO      18
#define CAM_Y2_GPIO      5
#define CAM_VSYNC_GPIO   25
#define CAM_HREF_GPIO    23
#define CAM_PCLK_GPIO    22
#define FLASH_GPIO        4

#define DEF_SERVER   "https://security-camera-api.onrender.com"
#define DEF_APIKEY   "944426cc151ab6f1a157179da296513103ee66494d6f18ff321d2e06862fd2c2"
#define AP_SSID      "ESP32-CAM"
#define MDNS_NAME    "esp32-cam"

WebServer server(80);
DNSServer dns;
Preferences prefs;
HTTPClient http;

String serverUrl = DEF_SERVER;
String apiKey = DEF_APIKEY;
int intervalIdle = 3000;
int intervalMotion = 500;
int motionThreshold = 30000;
bool cameraOk = false;
uint8_t* prevFrame = NULL;
size_t prevLen = 0;

static camera_config_t camera_config = {
  .pin_pwdn = CAM_PWDN_GPIO,
  .pin_reset = CAM_RESET_GPIO,
  .pin_xclk = CAM_XCLK_GPIO,
  .pin_sscb_sda = CAM_SIOD_GPIO,
  .pin_sscb_scl = CAM_SIOC_GPIO,
  .pin_d7 = CAM_Y9_GPIO,
  .pin_d6 = CAM_Y8_GPIO,
  .pin_d5 = CAM_Y7_GPIO,
  .pin_d4 = CAM_Y6_GPIO,
  .pin_d3 = CAM_Y5_GPIO,
  .pin_d2 = CAM_Y4_GPIO,
  .pin_d1 = CAM_Y3_GPIO,
  .pin_d0 = CAM_Y2_GPIO,
  .pin_vsync = CAM_VSYNC_GPIO,
  .pin_href = CAM_HREF_GPIO,
  .pin_pclk = CAM_PCLK_GPIO,
  .xclk_freq_hz = 20000000,
  .ledc_timer = LEDC_TIMER_0,
  .ledc_channel = LEDC_CHANNEL_0,
  .pixel_format = PIXFORMAT_JPEG,
  .frame_size = FRAMESIZE_QVGA,
  .jpeg_quality = 10,
  .fb_count = 2,
};

const char b64t[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
String toBase64(const uint8_t* d, size_t n) {
  String r; r.reserve((n + 2) / 3 * 4);
  for (size_t i = 0; i < n; i += 3) {
    uint32_t v = ((uint32_t)d[i] << 16) | ((i+1 < n ? d[i+1] : 0) << 8) | (i+2 < n ? d[i+2] : 0);
    r += b64t[(v >> 18) & 0x3F];
    r += b64t[(v >> 12) & 0x3F];
    r += (i+1 < n) ? b64t[(v >> 6) & 0x3F] : '=';
    r += (i+2 < n) ? b64t[v & 0x3F] : '=';
  }
  return r;
}

bool initCamera() {
  esp_err_t e = esp_camera_init(&camera_config);
  if (e != ESP_OK) return false;
  sensor_t* s = esp_camera_sensor_get();
  s->set_framesize(s, FRAMESIZE_QVGA);
  s->set_quality(s, 10);
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_aec_value(s, 300);
  s->set_gain_ctrl(s, 1);
  s->set_agc_gain(s, 0);
  return true;
}

void flashOn() { digitalWrite(FLASH_GPIO, HIGH); }
void flashOff() { digitalWrite(FLASH_GPIO, LOW); }

bool isDark(camera_fb_t* fb) {
  int sum = 0, n = 0;
  for (size_t i = fb->len / 3; i < fb->len * 2 / 3 && n < 50; i += fb->len / 50, n++)
    sum += fb->buf[i];
  return (sum / max(n, 1)) < 80;
}

bool detectMotion(const uint8_t* img, size_t len) {
  if (!prevFrame || prevLen != len) {
    free(prevFrame); prevFrame = NULL;
    prevFrame = (uint8_t*)malloc(len);
    if (prevFrame) { memcpy(prevFrame, img, len); prevLen = len; }
    return false;
  }
  int diff = 0, step = max((int)(len / 256), 1);
  for (size_t i = 0; i < len; i += step) diff += abs((int)img[i] - (int)prevFrame[i]);
  memcpy(prevFrame, img, len);
  return diff > motionThreshold;
}

void sendFrame(const uint8_t* jpg, size_t len, const char* type) {
  if (WiFi.status() != WL_CONNECTED) return;
  String b64 = toBase64(jpg, len);
  String body = "{\"apiKey\":\"" + apiKey + "\",\"motionType\":\"" + type + "\",\"image\":\"" + b64 + "\"}";
  if (body.length() > 50000) {
    Serial.println("Frame too large, skipping");
    return;
  }
  http.begin(serverUrl + "/api/camera/ingest");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code != 200) Serial.println("Upload fail: " + http.getString());
  http.end();
}

void adaptExposure(camera_fb_t* fb) {
  sensor_t* s = esp_camera_sensor_get();
  if (isDark(fb)) {
    flashOn();
    s->set_gain_ctrl(s, 1);
    s->set_agc_gain(s, 2);
    s->set_aec_value(s, 500);
  } else {
    flashOff();
    s->set_aec_value(s, 250);
    s->set_agc_gain(s, 0);
  }
}

void captureLoop() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { delay(1000); return; }
  adaptExposure(fb);
  bool motion = detectMotion(fb->buf, fb->len);
  if (motion) {
    Serial.println("MOTION");
    sendFrame(fb->buf, fb->len, "motion");
    delay(intervalMotion);
  } else {
    sendFrame(fb->buf, fb->len, "idle");
    delay(intervalIdle);
  }
  esp_camera_fb_return(fb);
}

void handleRoot() {
  String h = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>";
  h += "body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto;background:#f5f5f5}";
  h += "h2{color:#e94560}.c{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,.1)}";
  h += "input{width:100%;padding:10px;margin:6px 0 12px;border:1px solid #ddd;border-radius:6px}";
  h += "button{width:100%;padding:12px;background:#e94560;color:#fff;border:none;border-radius:6px;cursor:pointer}";
  h += "label{font-size:13px;color:#555;font-weight:600}</style></head><body>";
  h += "<h2>ESP32-CAM</h2>";
  h += "<div class='c'>";
  h += "WiFi: " + String(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "AP mode") + "<br>";
  h += "Camera: " + String(cameraOk ? "OK" : "FAIL") + "<br>";
  h += "mDNS: <a href='http://esp32-cam.local'>esp32-cam.local</a>";
  h += "</div>";
  h += "<div class='c'><form action='/save' method='POST'>";
  h += "<label>Wi-Fi SSID</label><input name='s' value='" + prefs.getString("ssid", "") + "'>";
  h += "<label>Password</label><input type='password' name='p'>";
  h += "<label>Server URL</label><input name='u' value='" + serverUrl + "'>";
  h += "<label>API Key</label><input name='k' value='" + apiKey + "'>";
  h += "<button>Save & Reboot</button></form></div>";
  h += "<div class='c' style='text-align:center'>";
  h += "<a href='/cam' style='color:#e94560'>Camera Preview</a> | ";
  h += "<a href='/reset' style='color:#e94560' onclick=\"return confirm('Reset?')\">Factory Reset</a>";
  h += "</div>";
  h += "</body></html>";
  server.send(200, "text/html", h);
}

void handleSave() {
  if (server.hasArg("s") && server.arg("s").length() > 0) {
    prefs.putString("ssid", server.arg("s"));
    prefs.putString("pass", server.arg("p"));
  }
  if (server.hasArg("u") && server.arg("u").length() > 0) {
    prefs.putString("url", server.arg("u"));
    prefs.putString("key", server.arg("k"));
  }
  server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;text-align:center'><h2>Saved!</h2><p>Rebooting...</p></body></html>");
  delay(1000);
  ESP.restart();
}

void handleCam() {
  if (!cameraOk) { server.send(503, "text/plain", "Camera not available"); return; }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { server.send(500, "text/plain", "Capture failed"); return; }
  String b64 = toBase64(fb->buf, fb->len);
  esp_camera_fb_return(fb);
  String h = "<html><body style='font-family:sans-serif;padding:20px'><h2>Camera</h2>";
  h += "<img src='data:image/jpeg;base64," + b64 + "' style='width:100%;border-radius:8px'/>";
  h += "<br><a href='/' style='color:#e94560'>Back</a></body></html>";
  server.send(200, "text/html", h);
}

void handleReset() {
  prefs.clear();
  server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;text-align:center'><h2>Reset!</h2><p>Rebooting...</p></body></html>");
  delay(1000);
  ESP.restart();
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Booting ===");

  pinMode(FLASH_GPIO, OUTPUT);
  flashOff();

  prefs.begin("cam", false);
  serverUrl = prefs.getString("url", DEF_SERVER);
  apiKey = prefs.getString("key", DEF_APIKEY);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");

  Serial.println("Starting AP...");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID);
  Serial.print("AP SSID: "); Serial.println(AP_SSID);
  Serial.print("AP IP:   "); Serial.println(WiFi.softAPIP());

  // Try to connect to saved WiFi (non-blocking)
  if (ssid.length() > 0) {
    Serial.print("Connecting to "); Serial.println(ssid);
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
  }

  // DNS + Web server
  dns.start(53, "*", WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/cam", handleCam);
  server.on("/reset", handleReset);
  server.onNotFound([]() { server.send(200, "text/plain", "ESP32-CAM"); });
  server.begin();
  Serial.println("Web server started");

  // mDNS
  if (MDNS.begin(MDNS_NAME)) {
    Serial.print("mDNS: http://"); Serial.print(MDNS_NAME); Serial.println(".local/");
    MDNS.addService("http", "tcp", 80);
  }

  // Camera init (after WiFi, failure won't block AP)
  cameraOk = initCamera();
  if (!cameraOk) {
    Serial.println("Camera init FAILED");
  } else {
    Serial.println("Camera OK");
  }

  Serial.println("=== Ready ===");
}

// ===== LOOP =====
void loop() {
  dns.processNextRequest();
  server.handleClient();

  if (WiFi.status() == WL_CONNECTED && cameraOk) {
    captureLoop();
  } else {
    delay(10);
  }
}
