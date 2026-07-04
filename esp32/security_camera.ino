/*
 * ESP32-CAM Security Camera Firmware
 * Hardware: AI-Thinker ESP32-CAM
 * Board: AI Thinker ESP32-CAM, PSRAM enabled
 * Partition: Huge APP (3MB No OTA/1MB SPIFFS)
 * Flash: QIO
 *
 * Features:
 * - Motion detection (frame differencing, configurable threshold)
 * - Photo capture to SPIFFS with NTP timestamps
 * - Event log (last 100 events in JSON)
 * - Web dashboard with live preview, settings, event log
 * - Credential reset from web UI (clears WiFi + admin, reboots to AP)
 * - Adaptive flashlight (auto/on/off)
 * - WiFi fallback to AP mode (ESP32-CAM-Setup / 12345678)
 * - Optional upload to remote server
 */

#include <esp_camera.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <time.h>
#include <FS.h>

// === PIN DEFINITIONS (AI-Thinker ESP32-CAM) ===
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

// === DEFAULTS ===
#define AP_SSID          "ESP32-CAM-Setup"
#define AP_PASS          "12345678"
#define MDNS_NAME        "esp32-cam"
#define CONFIG_PATH      "/config.json"
#define EVENTS_PATH      "/events.json"
#define CAPTURE_DIR      "/captures"
#define MAX_EVENTS       100
#define MAX_CAPTURES     20
#define ADMIN_USER       "admin"
#define ADMIN_PASS       "CommandeR48"
#define STREAM_TIMEOUT   30000 // ms before auto-closing stream

// === CONFIG STRUCT ===
typedef struct {
  int jpegQuality;
  framesize_t frameSize;
  int motionThreshold;
  int flashMode;        // 0=off, 1=on, 2=auto
  int flashThreshold;   // brightness 0-255 below which flash activates (auto)
  char ntpServer[64];
  int tzOffset;
  char serverUrl[256];
  char apiKey[64];
  int captureInterval;  // ms between captures during motion
} config_t;

config_t cfg;

// === GLOBALS ===
WebServer server(80);
DNSServer dns;
HTTPClient httpClient;
Preferences prefs;
bool cameraOk = false;
bool apMode = false;
bool timeSynced = false;
unsigned long lastCapture = 0;

// Motion detection
uint8_t* prevFrame = NULL;
size_t prevLen = 0;

// Event log
StaticJsonDocument<16384> eventLog;
int eventCount = 0;

// Admin credentials (loaded from Preferences, fallback to defaults)
String adminUser = ADMIN_USER;
String adminPass = ADMIN_PASS;

// === SPIFFS HELPERS ===
void setDefaults() {
  cfg.jpegQuality = 10;
  cfg.frameSize = FRAMESIZE_QVGA;
  cfg.motionThreshold = 30000;
  cfg.flashMode = 2;
  cfg.flashThreshold = 80;
  cfg.tzOffset = 0;
  cfg.captureInterval = 2000;
  strlcpy(cfg.ntpServer, "pool.ntp.org", sizeof(cfg.ntpServer));
  strlcpy(cfg.serverUrl, "", sizeof(cfg.serverUrl));
  strlcpy(cfg.apiKey, "", sizeof(cfg.apiKey));
}

void initFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("SPIFFS mount FAILED");
  } else {
    Serial.println("SPIFFS OK");
  }
}

void loadConfig() {
  File f = SPIFFS.open(CONFIG_PATH, "r");
  if (!f) {
    Serial.println("No config file, using defaults");
    return;
  }
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.println("Config parse error, using defaults");
    return;
  }
  cfg.jpegQuality = doc["jq"] | cfg.jpegQuality;
  cfg.frameSize = (framesize_t)(doc["fs"] | (int)cfg.frameSize);
  cfg.motionThreshold = doc["mt"] | cfg.motionThreshold;
  cfg.flashMode = doc["fm"] | cfg.flashMode;
  cfg.flashThreshold = doc["ft"] | cfg.flashThreshold;
  cfg.tzOffset = doc["tz"] | cfg.tzOffset;
  cfg.captureInterval = doc["ci"] | cfg.captureInterval;
  strlcpy(cfg.ntpServer, doc["ns"] | "pool.ntp.org", sizeof(cfg.ntpServer));
  strlcpy(cfg.serverUrl, doc["su"] | "", sizeof(cfg.serverUrl));
  strlcpy(cfg.apiKey, doc["ak"] | "", sizeof(cfg.apiKey));
  Serial.println("Config loaded from SPIFFS");
}

void saveConfig() {
  StaticJsonDocument<512> doc;
  doc["jq"] = cfg.jpegQuality;
  doc["fs"] = (int)cfg.frameSize;
  doc["mt"] = cfg.motionThreshold;
  doc["fm"] = cfg.flashMode;
  doc["ft"] = cfg.flashThreshold;
  doc["tz"] = cfg.tzOffset;
  doc["ci"] = cfg.captureInterval;
  doc["ns"] = cfg.ntpServer;
  doc["su"] = cfg.serverUrl;
  doc["ak"] = cfg.apiKey;
  File f = SPIFFS.open(CONFIG_PATH, "w");
  if (!f) {
    Serial.println("Config save FAILED");
    return;
  }
  serializeJson(doc, f);
  f.close();
  Serial.println("Config saved");
}

void loadEvents() {
  File f = SPIFFS.open(EVENTS_PATH, "r");
  if (!f) return;
  DeserializationError err = deserializeJson(eventLog, f);
  f.close();
  if (err) { eventLog.clear(); return; }
  JsonArray arr = eventLog.as<JsonArray>();
  eventCount = arr.size();
}

void saveEvents() {
  File f = SPIFFS.open(EVENTS_PATH, "w");
  if (!f) return;
  serializeJson(eventLog, f);
  f.close();
}

void addEvent(const char* filename, int pixels) {
  JsonArray arr = eventLog.as<JsonArray>();
  while (arr.size() >= MAX_EVENTS) {
    arr.remove(0);
  }
  JsonObject ev = arr.createNestedObject();
  ev["t"] = millis() / 1000;
  ev["f"] = filename;
  ev["p"] = pixels;
  struct tm ti;
  if (getLocalTime(&ti)) {
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &ti);
    ev["ts"] = buf;
  }
  eventCount = arr.size();
  saveEvents();
}

// === ADMIN CREDENTIAL HELPERS ===
void loadAdminCreds() {
  String u = prefs.getString("adminUser", "");
  String p = prefs.getString("adminPass", "");
  if (u.length() > 0) adminUser = u;
  if (p.length() > 0) adminPass = p;
}

void saveAdminCreds(const String& user, const String& pass) {
  prefs.putString("adminUser", user);
  prefs.putString("adminPass", pass);
  adminUser = user;
  adminPass = pass;
}

void resetAdminCreds() {
  prefs.remove("adminUser");
  prefs.remove("adminPass");
  adminUser = ADMIN_USER;
  adminPass = ADMIN_PASS;
}

// === CAMERA ===
camera_config_t cameraConfig;

void initCameraConfig() {
  cameraConfig.pin_pwdn = CAM_PWDN_GPIO;
  cameraConfig.pin_reset = CAM_RESET_GPIO;
  cameraConfig.pin_xclk = CAM_XCLK_GPIO;
  cameraConfig.pin_sscb_sda = CAM_SIOD_GPIO;
  cameraConfig.pin_sscb_scl = CAM_SIOC_GPIO;
  cameraConfig.pin_d7 = CAM_Y9_GPIO;
  cameraConfig.pin_d6 = CAM_Y8_GPIO;
  cameraConfig.pin_d5 = CAM_Y7_GPIO;
  cameraConfig.pin_d4 = CAM_Y6_GPIO;
  cameraConfig.pin_d3 = CAM_Y5_GPIO;
  cameraConfig.pin_d2 = CAM_Y4_GPIO;
  cameraConfig.pin_d1 = CAM_Y3_GPIO;
  cameraConfig.pin_d0 = CAM_Y2_GPIO;
  cameraConfig.pin_vsync = CAM_VSYNC_GPIO;
  cameraConfig.pin_href = CAM_HREF_GPIO;
  cameraConfig.pin_pclk = CAM_PCLK_GPIO;
  cameraConfig.xclk_freq_hz = 20000000;
  cameraConfig.ledc_timer = LEDC_TIMER_0;
  cameraConfig.ledc_channel = LEDC_CHANNEL_0;
  cameraConfig.pixel_format = PIXFORMAT_JPEG;
  cameraConfig.frame_size = cfg.frameSize;
  cameraConfig.jpeg_quality = cfg.jpegQuality;
  cameraConfig.fb_count = 2;
}

void applyCameraConfig() {
  sensor_t* s = esp_camera_sensor_get();
  if (!s) { Serial.println("No sensor"); return; }
  s->set_framesize(s, cfg.frameSize);
  s->set_quality(s, cfg.jpegQuality);
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_aec_value(s, 300);
  s->set_gain_ctrl(s, 1);
  s->set_agc_gain(s, 0);
  Serial.println("Camera config applied");
}

bool initCamera() {
  initCameraConfig();
  esp_err_t e = esp_camera_init(&cameraConfig);
  if (e != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", e);
    return false;
  }
  applyCameraConfig();
  return true;
}

// === FLASHLIGHT ===
void flashOn() { digitalWrite(FLASH_GPIO, HIGH); }
void flashOff() { digitalWrite(FLASH_GPIO, LOW); }

bool isDark(const uint8_t* buf, size_t len) {
  int sum = 0, n = 0;
  size_t step = len / 50;
  if (step < 1) step = 1;
  for (size_t i = len / 3; i < len * 2 / 3 && n < 50; i += step, n++) {
    sum += buf[i];
  }
  int avg = sum / max(n, 1);
  return avg < cfg.flashThreshold;
}

void handleFlash(bool motion) {
  if (cfg.flashMode == 0) { flashOff(); return; }
  if (cfg.flashMode == 1) { flashOn(); return; }
  if (!motion) { flashOff(); return; }
  camera_fb_t* fb = esp_camera_fb_get();
  if (fb) {
    if (isDark(fb->buf, fb->len)) flashOn();
    esp_camera_fb_return(fb);
  }
}

// === MOTION DETECTION ===
bool detectMotion(const uint8_t* img, size_t len, int* outDiff) {
  if (!prevFrame || prevLen != len) {
    free(prevFrame);
    prevFrame = (uint8_t*)malloc(len);
    if (prevFrame) {
      memcpy(prevFrame, img, len);
      prevLen = len;
    }
    return false;
  }
  int diff = 0;
  size_t step = max((size_t)(len / 256), (size_t)1);
  for (size_t i = 0; i < len; i += step) {
    diff += abs((int)img[i] - (int)prevFrame[i]);
  }
  memcpy(prevFrame, img, len);
  if (outDiff) *outDiff = diff;
  return diff > cfg.motionThreshold;
}

// === CAPTURE & SAVE ===
void cleanupCaptures() {
  File root = SPIFFS.open(CAPTURE_DIR);
  if (!root || !root.isDirectory()) return;
  struct FileEntry { char name[64]; time_t time; };
  FileEntry files[MAX_CAPTURES + 10];
  int count = 0;
  File f = root.openNextFile();
  while (f && count < MAX_CAPTURES + 10) {
    if (!f.isDirectory()) {
      strlcpy(files[count].name, f.name(), sizeof(files[count].name));
      struct stat st;
      if (stat(f.name(), &st) == 0) files[count].time = st.st_mtime;
      else files[count].time = 0;
      count++;
    }
    f = root.openNextFile();
  }
  root.close();
  if (count <= MAX_CAPTURES) return;
  for (int i = 0; i < count - 1; i++) {
    for (int j = 0; j < count - 1 - i; j++) {
      if (files[j].time > files[j + 1].time) {
        FileEntry tmp = files[j];
        files[j] = files[j + 1];
        files[j + 1] = tmp;
      }
    }
  }
  int toDelete = count - MAX_CAPTURES;
  for (int i = 0; i < toDelete; i++) {
    SPIFFS.remove(files[i].name);
    Serial.print("Removed old: ");
    Serial.println(files[i].name);
  }
}

String saveCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return "";
  struct tm ti;
  char fname[64];
  if (getLocalTime(&ti)) {
    strftime(fname, sizeof(fname), CAPTURE_DIR "/%Y-%m-%d_%H-%M-%S.jpg", &ti);
  } else {
    snprintf(fname, sizeof(fname), CAPTURE_DIR "/%lu.jpg", millis() / 1000);
  }
  File f = SPIFFS.open(fname, "w");
  if (f) {
    f.write(fb->buf, fb->len);
    f.close();
    cleanupCaptures();
  }
  if (strlen(cfg.serverUrl) > 0 && WiFi.status() == WL_CONNECTED) {
    uploadCapture(fb->buf, fb->len, fname);
  }
  esp_camera_fb_return(fb);
  return String(fname);
}

void uploadCapture(const uint8_t* jpg, size_t len, const char* fname) {
  char url[320];
  snprintf(url, sizeof(url), "%s/api/camera/ingest", cfg.serverUrl);
  const char b64t[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t b64len = ((len + 2) / 3) * 4;
  char* b64 = (char*)malloc(b64len + 1);
  if (!b64) return;
  for (size_t i = 0, o = 0; i < len; i += 3) {
    uint32_t v = ((uint32_t)jpg[i] << 16) | ((i + 1 < len ? jpg[i + 1] : 0) << 8) | (i + 2 < len ? jpg[i + 2] : 0);
    b64[o++] = b64t[(v >> 18) & 0x3F];
    b64[o++] = b64t[(v >> 12) & 0x3F];
    b64[o++] = (i + 1 < len) ? b64t[(v >> 6) & 0x3F] : '=';
    b64[o++] = (i + 2 < len) ? b64t[v & 0x3F] : '=';
    if (o > 48000) break;
  }
  b64[b64len] = '\0';
  char* body = (char*)malloc(51200);
  if (!body) { free(b64); return; }
  int bodyLen = snprintf(body, 51200,
    "{\"apiKey\":\"%s\",\"motionType\":\"motion\",\"image\":\"%s\"}",
    cfg.apiKey, b64);
  free(b64);
  if (bodyLen >= 51199) { free(body); return; }
  httpClient.begin(url);
  httpClient.addHeader("Content-Type", "application/json");
  int code = httpClient.POST((uint8_t*)body, strlen(body));
  if (code != 200) {
    Serial.print("Upload fail: ");
    Serial.println(httpClient.getString());
  } else {
    Serial.println("Upload OK");
  }
  httpClient.end();
  free(body);
}

// === NTP ===
void syncTime() {
  configTime(cfg.tzOffset * 3600, 0, cfg.ntpServer);
  Serial.print("Syncing NTP");
  int tries = 0;
  while (!time(nullptr) && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  time_t now = time(nullptr);
  if (now > 100000) {
    timeSynced = true;
    struct tm ti;
    getLocalTime(&ti);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &ti);
    Serial.print("Time synced: ");
    Serial.println(buf);
  } else {
    Serial.println("Time sync FAILED");
  }
}

// === WIFI ===
void startAP() {
  apMode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  dns.start(53, "*", WiFi.softAPIP());
  Serial.print("AP mode: ");
  Serial.print(AP_SSID);
  Serial.print(" / ");
  Serial.print(AP_PASS);
  Serial.print(" at ");
  Serial.println(WiFi.softAPIP());
}

void connectWiFi(const char* ssid, const char* pass) {
  apMode = false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  Serial.print("Connecting to ");
  Serial.println(ssid);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed, switching to AP");
    startAP();
  }
}

// === WEB AUTH ===
bool checkAuth() {
  if (!server.authenticate(adminUser.c_str(), adminPass.c_str())) {
    server.requestAuthentication();
    return false;
  }
  return true;
}

// === WEB HANDLERS ===
void handleRoot() {
  if (!checkAuth()) return;
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<meta http-equiv='refresh' content='30'><style>";
  html += "body{font-family:sans-serif;padding:16px;max-width:420px;margin:auto;background:#1a1a2e;color:#e0e0e0}";
  html += "h2{color:#e94560}.c{background:#16213e;border-radius:12px;padding:16px;margin:12px 0}";
  html += "input,select{width:100%;padding:10px;margin:6px 0 12px;border:1px solid #2a2a4a;border-radius:6px;background:#1a1a2e;color:#e0e0e0}";
  html += "button{width:100%;padding:12px;background:#e94560;color:#fff;border:none;border-radius:6px;cursor:pointer}";
  html += "a{color:#4ade80;text-decoration:none}.s{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}";
  html += "</style></head><body>";
  html += "<h2>ESP32-CAM Security</h2>";
  html += "<div class='c'>";
  String ipStr = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("AP: " AP_SSID);
  html += "<div class='s'><span>WiFi</span><span>" + ipStr + "</span></div>";
  html += "<div class='s'><span>Camera</span><span>" + String(cameraOk ? "OK" : "FAIL") + "</span></div>";
  html += "<div class='s'><span>Time</span><span>" + String(timeSynced ? "Synced" : "Not synced") + "</span></div>";
  html += "<div class='s'><span>Events</span><span>" + String(eventCount) + "</span></div>";
  struct tm ti;
  if (getLocalTime(&ti)) {
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &ti);
    html += "<div class='s'><span>Now</span><span>" + String(buf) + "</span></div>";
  }
  String mdnsLink = String("<a href='http://") + MDNS_NAME + ".local'>" + MDNS_NAME + ".local</a>";
  html += "<div class='s'><span>mDNS</span><span>" + mdnsLink + "</span></div>";
  html += "</div>";
  html += "<div class='c' style='text-align:center'>";
  html += "<a href='/stream' style='display:block;padding:12px;background:#16213e;border-radius:8px;color:#4ade80;text-decoration:none'>Live Stream</a>";
  html += "<br><a href='/cam' style='font-size:13px'>Snapshot</a>";
  html += "</div>";
  html += "<div class='c'><h3>Recent Events</h3>";
  JsonArray arr = eventLog.as<JsonArray>();
  int cnt = arr.size();
  int start = cnt > 20 ? cnt - 20 : 0;
  for (int i = cnt - 1; i >= start; i--) {
    JsonObject ev = arr[i];
    const char* ts = ev["ts"] | "";
    const char* fn = ev["f"] | "";
    int px = ev["p"] | 0;
    html += "<div class='s'><span>" + String(ts) + "</span><a href='" + String(fn) + "'>" + String(px) + "px</a></div>";
  }
  if (cnt == 0) html += "<div style='color:#667'>No events</div>";
  html += "</div>";
  html += "<div class='c' style='text-align:center'>";
  html += "<a href='/settings' style='color:#e94560;font-size:16px'>Settings</a>";
  html += "</div>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleStream() {
  if (!checkAuth()) return;
  if (!cameraOk) { server.send(503, "text/plain", "Camera unavailable"); return; }
  WiFiClient client = server.client();
  client.setNoDelay(true);
  client.print("HTTP/1.1 200 OK\r\n");
  client.print("Content-Type: multipart/x-mixed-replace; boundary=frame\r\n");
  client.print("Cache-Control: no-cache\r\n");
  client.print("Connection: close\r\n\r\n");
  unsigned long startTime = millis();
  unsigned long lastFrame = 0;
  while (client.connected() && (millis() - startTime < STREAM_TIMEOUT)) {
    unsigned long now = millis();
    if (now - lastFrame < 100) { delay(5); continue; }
    lastFrame = now;
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { delay(10); continue; }
    client.print("--frame\r\n");
    client.print("Content-Type: image/jpeg\r\n");
    client.print("Content-Length: ");
    client.print(fb->len);
    client.print("\r\n\r\n");
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    esp_camera_fb_return(fb);
  }
  Serial.println("Stream ended");
}

void handleCam() {
  if (!cameraOk) { server.send(503, "text/plain", "Camera unavailable"); return; }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { server.send(500, "text/plain", "Capture failed"); return; }
  server.send(200, "image/jpeg", String((const char*)fb->buf, fb->len));
  esp_camera_fb_return(fb);
}

void handleCapture() {
  String path = server.uri();
  if (!SPIFFS.exists(path)) { server.send(404, "text/plain", "Not found"); return; }
  File f = SPIFFS.open(path, "r");
  if (!f) { server.send(500, "text/plain", "Error"); return; }
  server.streamFile(f, "image/jpeg");
  f.close();
}

void handleSettings() {
  if (!checkAuth()) return;
  if (server.method() == HTTP_POST) {
    if (server.hasArg("jq")) cfg.jpegQuality = server.arg("jq").toInt();
    if (server.hasArg("fs")) cfg.frameSize = (framesize_t)server.arg("fs").toInt();
    if (server.hasArg("mt")) cfg.motionThreshold = server.arg("mt").toInt();
    if (server.hasArg("fm")) cfg.flashMode = server.arg("fm").toInt();
    if (server.hasArg("ft")) cfg.flashThreshold = server.arg("ft").toInt();
    if (server.hasArg("tz")) cfg.tzOffset = server.arg("tz").toInt();
    if (server.hasArg("ci")) cfg.captureInterval = server.arg("ci").toInt();
    if (server.hasArg("ns")) strlcpy(cfg.ntpServer, server.arg("ns").c_str(), sizeof(cfg.ntpServer));
    if (server.hasArg("su")) strlcpy(cfg.serverUrl, server.arg("su").c_str(), sizeof(cfg.serverUrl));
    if (server.hasArg("ak")) strlcpy(cfg.apiKey, server.arg("ak").c_str(), sizeof(cfg.apiKey));
    if (server.hasArg("auser") && server.arg("auser").length() > 0 &&
        server.hasArg("apass") && server.arg("apass").length() > 0) {
      saveAdminCreds(server.arg("auser"), server.arg("apass"));
    }
    if (server.hasArg("ws") && server.arg("ws").length() > 0) {
      prefs.putString("ssid", server.arg("ws"));
      prefs.putString("pass", server.arg("wp"));
    }
    saveConfig();
    applyCameraConfig();
    if (server.hasArg("ws") && server.arg("ws").length() > 0) {
      server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;color:#fff;background:#1a1a2e'><h2>Saved! Rebooting...</h2></body></html>");
      delay(1000);
      ESP.restart();
    } else {
      server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;color:#fff;background:#1a1a2e'><h2>Saved!</h2><a href='/' style='color:#4ade80'>Back</a></body></html>");
    }
    return;
  }
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>";
  html += "body{font-family:sans-serif;padding:16px;max-width:420px;margin:auto;background:#1a1a2e;color:#e0e0e0}";
  html += "h2{color:#e94560}.c{background:#16213e;border-radius:12px;padding:16px;margin:12px 0}";
  html += "input,select{width:100%;padding:10px;margin:6px 0 12px;border:1px solid #2a2a4a;border-radius:6px;background:#1a1a2e;color:#e0e0e0}";
  html += "button{width:100%;padding:12px;background:#e94560;color:#fff;border:none;border-radius:6px;cursor:pointer}";
  html += "a{color:#4ade80;text-decoration:none}label{font-size:13px;color:#8899aa}</style></head><body>";
  html += "<h2>Settings</h2>";
  html += "<div class='c'><form method='POST'>";
  html += "<label>JPEG Quality (1-100)</label><input name='jq' type='number' min='1' max='100' value='" + String(cfg.jpegQuality) + "'>";
  html += "<label>Frame Size</label><select name='fs'>";
  int sizes[] = { FRAMESIZE_UXGA, FRAMESIZE_SVGA, FRAMESIZE_VGA, FRAMESIZE_QVGA, FRAMESIZE_QQVGA };
  const char* snames[] = { "UXGA (1600x1200)", "SVGA (800x600)", "VGA (640x480)", "QVGA (320x240)", "QQVGA (160x120)" };
  for (int i = 0; i < 5; i++) {
    html += "<option value='" + String(sizes[i]) + "'" + String(sizes[i] == (int)cfg.frameSize ? " selected" : "") + ">" + String(snames[i]) + "</option>";
  }
  html += "</select>";
  html += "<label>Motion Threshold (1000-100000)</label><input name='mt' type='number' min='1000' max='100000' value='" + String(cfg.motionThreshold) + "'>";
  html += "<label>Flash Mode</label><select name='fm'>";
  html += "<option value='0'" + String(cfg.flashMode == 0 ? " selected" : "") + ">Off</option>";
  html += "<option value='1'" + String(cfg.flashMode == 1 ? " selected" : "") + ">On</option>";
  html += "<option value='2'" + String(cfg.flashMode == 2 ? " selected" : "") + ">Auto</option>";
  html += "</select>";
  html += "<label>Flash Brightness Threshold (0-255, lower = darker)</label><input name='ft' type='number' min='0' max='255' value='" + String(cfg.flashThreshold) + "'>";
  html += "<label>NTP Server</label><input name='ns' value='" + String(cfg.ntpServer) + "'>";
  html += "<label>Time Zone Offset (hours)</label><input name='tz' type='number' min='-12' max='14' value='" + String(cfg.tzOffset) + "'>";
  html += "<label>Capture Interval (ms)</label><input name='ci' type='number' min='500' max='30000' value='" + String(cfg.captureInterval) + "'>";
  html += "<label>Server URL</label><input name='su' value='" + String(cfg.serverUrl) + "'>";
  html += "<label>API Key</label><input name='ak' value='" + String(cfg.apiKey) + "'>";
  html += "<hr style='border-color:#2a2a4a'>";
  html += "<h3>Admin Credentials</h3>";
  html += "<label>Admin Username</label><input name='auser' value='" + adminUser + "'>";
  html += "<label>Admin Password</label><input type='password' name='apass' value='" + adminPass + "'>";
  html += "<hr style='border-color:#2a2a4a'>";
  html += "<h3>WiFi</h3>";
  html += "<label>WiFi SSID (leave blank to keep current)</label><input name='ws' value=''>";
  html += "<label>WiFi Password</label><input type='password' name='wp'>";
  html += "<button type='submit'>Save</button>";
  html += "</form></div>";
  html += "<div class='c' style='text-align:center'>";
  html += "<a href='/resetcreds' style='color:#e94560' onclick=\"return confirm('Reset ALL credentials (WiFi + admin) and reboot to AP mode?')\">Reset Credentials</a>";
  html += "<br><br><a href='/reset' style='color:#e94560' onclick=\"return confirm('Reset all settings to defaults?')\">Factory Reset</a>";
  html += "</div>";
  html += "<div style='text-align:center;margin-top:12px'><a href='/'>Back</a></div>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleResetCreds() {
  if (!checkAuth()) return;
  prefs.remove("ssid");
  prefs.remove("pass");
  resetAdminCreds();
  SPIFFS.remove(CONFIG_PATH);
  SPIFFS.remove(EVENTS_PATH);
  setDefaults();
  server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;color:#fff;background:#1a1a2e'><h2>Credentials reset! Rebooting to AP mode...</h2><p>Connect to <b>" AP_SSID "</b> and browse to 192.168.4.1</p></body></html>");
  delay(1000);
  ESP.restart();
}

void handleReset() {
  if (!checkAuth()) return;
  SPIFFS.remove(CONFIG_PATH);
  SPIFFS.remove(EVENTS_PATH);
  setDefaults();
  server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;color:#fff;background:#1a1a2e'><h2>Settings reset! Rebooting...</h2></body></html>");
  delay(1000);
  ESP.restart();
}

void handleNotFound() {
  if (server.uri().startsWith("/captures/")) {
    handleCapture();
    return;
  }
  server.send(200, "text/plain", "ESP32-CAM Security Camera");
}

// === SETUP ===
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== ESP32-CAM Security Camera ===");

  setDefaults();

  pinMode(FLASH_GPIO, OUTPUT);
  flashOff();

  initFS();
  loadConfig();

  prefs.begin("cam", false);
  loadAdminCreds();
  loadEvents();

  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  if (ssid.length() > 0) {
    connectWiFi(ssid.c_str(), pass.c_str());
  } else {
    startAP();
  }

  if (MDNS.begin(MDNS_NAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.print("mDNS: http://");
    Serial.print(MDNS_NAME);
    Serial.println(".local/");
  }

  server.on("/", handleRoot);
  server.on("/settings", HTTP_ANY, handleSettings);
  server.on("/cam", handleCam);
  server.on("/stream", handleStream);
  server.on("/reset", handleReset);
  server.on("/resetcreds", handleResetCreds);
  server.on("/restart", []() {
    if (!checkAuth()) return;
    server.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:40px;color:#fff;background:#1a1a2e'><h2>Rebooting...</h2></body></html>");
    delay(500);
    ESP.restart();
  });
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("Web server started");

  cameraOk = initCamera();
  Serial.println(cameraOk ? "Camera OK" : "Camera FAILED");

  syncTime();
  SPIFFS.mkdir(CAPTURE_DIR);

  Serial.println("=== Ready ===");
  Serial.print("Visit http://");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(WiFi.localIP());
  } else {
    Serial.print("192.168.4.1");
  }
  Serial.println("/");
}

// === LOOP ===
void loop() {
  dns.processNextRequest();
  server.handleClient();

  if (cameraOk && WiFi.status() == WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastCapture >= (unsigned long)cfg.captureInterval) {
      lastCapture = now;
      camera_fb_t* fb = esp_camera_fb_get();
      if (fb) {
        int diff = 0;
        bool motion = detectMotion(fb->buf, fb->len, &diff);
        if (motion) {
          Serial.print("MOTION: ");
          Serial.println(diff);
          handleFlash(true);
          esp_camera_fb_return(fb);
          camera_fb_t* cap = esp_camera_fb_get();
          if (cap) {
            String fname = saveCapture();
            if (fname.length() > 0) {
              addEvent(fname.c_str(), diff);
              Serial.print("Saved: ");
              Serial.println(fname);
            }
            esp_camera_fb_return(cap);
          }
          flashOff();
          delay(500);
        } else {
          handleFlash(false);
          esp_camera_fb_return(fb);
        }
      }
    }
  } else {
    delay(10);
  }
}
