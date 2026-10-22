#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "secrets.h"

#define FW_VERSION "1.0.0"

// ---------- Configuración ----------
constexpr bool     USAR_RED = true;               // true cuando ya haya broker MQTT
constexpr uint8_t  MUX_ADDR = 0x70, SHT_ADDR = 0x44, OLED_ADDR = 0x3C;
constexpr uint8_t  PIN_SDA = 21, PIN_SCL = 22;
constexpr uint8_t  PIN_FLAMA = 34;                 // solo entrada, sin pull-up interno
constexpr bool     FLAMA_ACTIVA_EN_BAJO = true;    // módulo LM393: DO = LOW con flama
constexpr uint8_t  CANAL_A = 2;                    // SHT41 posición A -> SD2/SC2
constexpr uint8_t  CANAL_B = 0;                    // SHT41 posición B -> SD0/SC0
constexpr uint32_t PERIODO_DATOS_MS = 2000;
constexpr uint32_t REPETIR_FLAMA_MS = 1000;
constexpr uint32_t ANTIRREBOTE_MS   = 50;
constexpr uint8_t  MARGEN_X = 3;                   // píxeles desde el borde izquierdo de la OLED
constexpr uint8_t  MARGEN_Y = 4;                   // píxeles desde el borde superior de la OLED
constexpr uint32_t I2C_HZ   = 100000;              // si la OLED sale con ruido, prueba 50000

const char* TOPIC_DATOS = "site/datos";
String topicEstado = String("site/estado/") + NODE_ID;

// ---------- Estado ----------
Adafruit_SSD1306 oled(128, 64, &Wire, -1, I2C_HZ, I2C_HZ);        // reloj fijo (por defecto la librería sube a 400 kHz al dibujar)
WiFiClient wifi;
PubSubClient mqtt(wifi);

constexpr uint8_t N_HIST = 31;                     // 31 muestras a 2 s = ventana de 60 s
struct Posicion {
  char id; uint8_t canal;
  bool ok; const char* err;
  float temp, hum, rocio, tasa;
  float hT[N_HIST]; uint32_t hMs[N_HIST]; uint8_t head, n;
  uint16_t fallos;                                 // lecturas fallidas desde el arranque
  Posicion(char i, uint8_t c)
    : id(i), canal(c), ok(false), err(nullptr),
      temp(0), hum(0), rocio(0), tasa(0), hT{}, hMs{}, head(0), n(0), fallos(0) {}
};
Posicion pos[2] = { {'A', CANAL_A}, {'B', CANAL_B} };

uint32_t seq = 0;
bool muxOk = true, flama = false;
bool estadoPublicado[3] = {false, false, false};
uint32_t tDatos = 0, tFlamaRep = 0, tReintento = 0, tCand = 0;
bool flamaCand = false;

// ---------- Cálculos ----------
float puntoRocio(float t, float h) {               // Magnus a=17.62, b=243.12
  const float a = 17.62, b = 243.12;
  float g = log(h / 100.0f) + (a * t) / (b + t);
  return b * g / (a - g);
}

void guardarHist(Posicion& p, float t, uint32_t ms) {
  p.hT[p.head] = t; p.hMs[p.head] = ms;
  p.head = (p.head + 1) % N_HIST;
  if (p.n < N_HIST) p.n++;
}

float tasaCambio(const Posicion& p) {              // °C/min en ventana de 60 s
  if (p.n < 2) return 0;
  uint8_t nuevo = (p.head + N_HIST - 1) % N_HIST;
  uint8_t viejo = (p.head + N_HIST - p.n) % N_HIST;
  float dtMin = (p.hMs[nuevo] - p.hMs[viejo]) / 60000.0f;
  return dtMin < 0.016f ? 0 : (p.hT[nuevo] - p.hT[viejo]) / dtMin;
}

// ---------- Sensores ----------
uint8_t crc8(const uint8_t* d, uint8_t len) {
  uint8_t c = 0xFF;
  for (uint8_t i = 0; i < len; i++) {
    c ^= d[i];
    for (uint8_t b = 0; b < 8; b++) c = (c & 0x80) ? (c << 1) ^ 0x31 : (c << 1);
  }
  return c;
}

// Libera un SDA atascado (9 pulsos de reloj) y reinicia el periférico I2C
void recuperarBus() {
  Wire.end();
  pinMode(PIN_SDA, INPUT_PULLUP);
  pinMode(PIN_SCL, OUTPUT_OPEN_DRAIN);
  for (int i = 0; i < 9; i++) {
    digitalWrite(PIN_SCL, LOW);  delayMicroseconds(5);
    digitalWrite(PIN_SCL, HIGH); delayMicroseconds(5);
  }
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(I2C_HZ);
}

// 0 = ok, 1 = mux sin respuesta, 2 = SHT41 timeout/CRC
int leerSHT41Una(uint8_t canal, float& t, float& h) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(1 << canal);
  if (Wire.endTransmission() != 0) return 1;

  Wire.beginTransmission(SHT_ADDR);
  Wire.write(0xFD);                                // medición de alta precisión
  if (Wire.endTransmission() != 0) return 2;
  delay(15);                                       // la medición tarda hasta 8.3 ms
  if (Wire.requestFrom((int)SHT_ADDR, 6) != 6) return 2;
  uint8_t b[6];
  for (auto& x : b) x = Wire.read();
  if (crc8(b, 2) != b[2] || crc8(b + 3, 2) != b[5]) return 2;

  uint16_t rt = (b[0] << 8) | b[1], rh = (b[3] << 8) | b[4];
  t = -45.0f + 175.0f * rt / 65535.0f;
  h = constrain(-6.0f + 125.0f * rh / 65535.0f, 0.0f, 100.0f);
  return 0;
}

// Reintenta hasta 3 veces; si todo falla, recupera el bus
int leerSHT41(uint8_t canal, float& t, float& h) {
  int r = 2;
  for (uint8_t intento = 0; intento < 3; intento++) {
    r = leerSHT41Una(canal, t, h);
    if (r == 0) return 0;
    delay(5);
  }
  recuperarBus();
  return r;
}

void leerPosicion(Posicion& p, uint32_t now) {
  float t, h;
  int r = leerSHT41(p.canal, t, h);
  if (r == 0) {
    p.ok = true; p.err = nullptr;
    p.temp = t; p.hum = h; p.rocio = puntoRocio(t, h);
    guardarHist(p, t, now);
    p.tasa = tasaCambio(p);
  } else {
    p.ok = false; p.fallos++;
    static char buf[2][24];                        // indexado por posición (A=0, B=1)
    uint8_t i = p.id - 'A';
    if (r == 1) p.err = "mux_sin_respuesta";
    else { snprintf(buf[i], sizeof(buf[i]), "sht41_%c_timeout", p.id); p.err = buf[i]; }
  }
}

// ---------- MQTT ----------
void publicarEstado() {
  JsonDocument d;
  d["schema"] = 1; d["node_id"] = NODE_ID; d["status"] = "online"; d["fw"] = FW_VERSION;
  JsonObject s = d["sensors"].to<JsonObject>();
  s["tca9548a"] = muxOk; s["sht41_A"] = pos[0].ok; s["sht41_B"] = pos[1].ok;
  char buf[256]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicEstado.c_str(), (const uint8_t*)buf, n, true);   // retenido
  estadoPublicado[0] = muxOk; estadoPublicado[1] = pos[0].ok; estadoPublicado[2] = pos[1].ok;
}

void publicarDatos() {
  if (!USAR_RED || !mqtt.connected()) return;
  JsonDocument d;
  d["schema"] = 1; d["type"] = "rack"; d["node_id"] = NODE_ID;
  d["seq"] = ++seq; d["uptime_s"] = millis() / 1000;
  JsonArray arr = d["positions"].to<JsonArray>();
  JsonArray errs;
  for (auto& p : pos) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = String(p.id);
    if (p.ok) {
      o["temp"]       = serialized(String(p.temp, 2));
      o["hum"]        = serialized(String(p.hum, 1));
      o["dew_point"]  = serialized(String(p.rocio, 1));
      o["rate_c_min"] = serialized(String(p.tasa, 2));
    } else {
      o["temp"] = nullptr; o["hum"] = nullptr;
      o["dew_point"] = nullptr; o["rate_c_min"] = nullptr;
      if (errs.isNull()) errs = d["err"].to<JsonArray>();
      errs.add(p.err);
    }
    if (p.id == 'A') o["flame"] = flama;           // el módulo de flama está en la posición A
  }
  char buf[512]; size_t n = serializeJson(d, buf);
  mqtt.publish(TOPIC_DATOS, (const uint8_t*)buf, n);                 // QoS 0
}

void mantenerConexiones(uint32_t now) {
  if (now - tReintento < 5000) return;
  if (WiFi.status() != WL_CONNECTED) { tReintento = now; WiFi.begin(WIFI_SSID, WIFI_PASSWORD); return; }
  if (!mqtt.connected()) {
    tReintento = now;
    const char* lwt = "{\"schema\":1,\"node_id\":\"" NODE_ID "\",\"status\":\"offline\"}";
    bool ok = (strlen(MQTT_USER) > 0)
      ? mqtt.connect(NODE_ID, MQTT_USER, MQTT_PASSWORD, topicEstado.c_str(), 1, true, lwt)
      : mqtt.connect(NODE_ID, topicEstado.c_str(), 1, true, lwt);   // broker anónimo (desarrollo)
    if (ok) publicarEstado();
  }
}

// ---------- Flama ----------
void vigilarFlama(uint32_t now) {
  bool raw = digitalRead(PIN_FLAMA) == (FLAMA_ACTIVA_EN_BAJO ? LOW : HIGH);
  if (raw != flamaCand) { flamaCand = raw; tCand = now; }
  if (now - tCand >= ANTIRREBOTE_MS && flama != flamaCand) {
    flama = flamaCand;
    Serial.println(flama ? ">> FLAMA detectada" : ">> Flama apagada");
    publicarDatos();                               // evento inmediato
    tFlamaRep = now;
  }
  if (flama && now - tFlamaRep >= REPETIR_FLAMA_MS) {   // QoS 0: repetir mientras esté activa
    publicarDatos();
    tFlamaRep = now;
  }
}

// ---------- I2C / OLED ----------
bool i2cResponde(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void cerrarCanales() {                             // deja solo el bus principal (OLED) visible
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(0);
  Wire.endTransmission();
}

bool oledViva = false;

void dibujarOLED() {
  if (!i2cResponde(OLED_ADDR)) { oledViva = false; return; }   // sin contacto: no dibujar
  if (!oledViva) {                                             // volvió: reconfigurar la pantalla
    oledViva = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR, true, false);
    if (!oledViva) return;
  }
  oled.clearDisplay(); oled.setTextSize(1); oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(MARGEN_X, MARGEN_Y);
  oled.printf("%s %s %s", NODE_ID,
              WiFi.status() == WL_CONNECTED ? "WiFi" : "----",
              mqtt.connected() ? "MQTT" : "----");
  for (int i = 0; i < 2; i++) {
    oled.setCursor(MARGEN_X, MARGEN_Y + 16 + i * 14);
    if (pos[i].ok) oled.printf("%c: %.1fC  %.0f%%", pos[i].id, pos[i].temp, pos[i].hum);
    else           oled.printf("%c: ERROR", pos[i].id);
  }
  oled.setCursor(MARGEN_X, MARGEN_Y + 46);
  oled.print(flama ? "!! FLAMA !!" : "Flama: no");
  oled.display();
}

// ---------- Arduino ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_FLAMA, INPUT);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(I2C_HZ);
  cerrarCanales();                                 // no heredar un canal abierto de antes
  oledViva = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledViva) Serial.println("OLED no encontrada (0x3C)");
  if (USAR_RED) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setBufferSize(512);                       // el default de 256 B no alcanza
  }
}

void loop() {
  uint32_t now = millis();
  if (USAR_RED) { mantenerConexiones(now); mqtt.loop(); }
  vigilarFlama(now);

  if (now - tDatos >= PERIODO_DATOS_MS) {
    tDatos = now;
    for (auto& p : pos) leerPosicion(p, now);
    cerrarCanales();                               // la OLED queda sola en el bus mientras dibuja
    muxOk = !(pos[0].err && !strcmp(pos[0].err, "mux_sin_respuesta"));

    for (auto& p : pos) {
      if (p.ok) Serial.printf("%c: %.2f C  %.1f %%  rocio %.1f C  tasa %.2f C/min  (fallos %u)\n",
                              p.id, p.temp, p.hum, p.rocio, p.tasa, p.fallos);
      else      Serial.printf("%c: ERROR %s  (fallos %u)\n", p.id, p.err, p.fallos);
    }
    Serial.printf("Flama: %s\n\n", flama ? "SI" : "no");

    publicarDatos();
    dibujarOLED();
    if (USAR_RED && mqtt.connected() && (estadoPublicado[0] != muxOk ||
        estadoPublicado[1] != pos[0].ok || estadoPublicado[2] != pos[1].ok))
      publicarEstado();                            // refresca el estado retenido si cambió la salud
  }
}