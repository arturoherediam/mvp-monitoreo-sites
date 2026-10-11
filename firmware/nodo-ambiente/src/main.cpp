#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SensirionI2cSht4x.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Meteo.h>          // firmware/common: punto de rocio y tasa de cambio
#include <Pms5003.h>        // lib/Pms5003: lector de tramas
#include "secrets.h"

// ================= Pines (propuesta; por confirmar en hardware/pinout.md) =================
const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PMS_RX  = 16;     // acuerdo: UART2 en GPIO16/17. Cual es RX y cual TX lo define Sebastian
const int PMS_TX  = 17;

// ================= Tiempos =================
const uint32_t PERIODO_MS      = 5000;  // nodo ambiente: cada 5 s (contrato)
const uint32_t REINTENTO_MS    = 5000;  // espera entre intentos de conexion MQTT
const uint32_t PMS_VIGENCIA_MS = 3000;  // si la ultima trama es mas vieja, se considera "sin trama"

// ================= PMS5003: CF=1 o atmosferico =================
// DECISION PENDIENTE de Priscila (fecha limite 13 oct). Valor PROVISIONAL:
const bool PMS_USAR_ATM = true;

// ================= OLED =================
const int OLED_ANCHO = 128;
const int OLED_ALTO  = 64;            // cambia a 32 si tu pantalla es 128x32
const uint8_t OLED_DIR = 0x3C;

// ================= MQTT =================
const char* TOPIC_DATOS  = "site/datos";
const char* TOPIC_ESTADO = "site/estado/" NODE_ID;
const char* MSG_OFFLINE  = "{\"schema\":1,\"node_id\":\"" NODE_ID "\",\"status\":\"offline\"}";
const char* MSG_ONLINE   = "{\"schema\":1,\"node_id\":\"" NODE_ID "\",\"status\":\"online\",\"fw\":\"0.1.0\"}";

// ================= Objetos =================
WiFiClient red;
PubSubClient mqtt(red);
SensirionI2cSht4x sht41;
Adafruit_SSD1306 pantalla(OLED_ANCHO, OLED_ALTO, &Wire, -1);
TasaCambio tasa;
Pms5003Parser pms;

// ================= Estado =================
uint32_t seq = 0;
uint32_t ultimaLecturaMs = 0;
uint32_t ultimoIntentoMs = 0;
uint32_t ultimaTramaPmsMs = 0;
bool oledOk = false;
bool wifiAvisado = false;

struct Lectura {
  bool shtOk;
  float temp, hum, rocio, tasaMin;
  bool pmsOk;
  uint16_t pm1, pm25, pm10;
};

float redondear(float v, int decimales) {
  float f = powf(10, decimales);
  return roundf(v * f) / f;
}

// ---------- PMS5003: se lee continuamente para no perder bytes ----------
void leerPms() {
  while (Serial2.available()) {
    if (pms.alimentar(Serial2.read())) ultimaTramaPmsMs = millis();
  }
}

// ---------- Medicion ----------
Lectura medir(uint32_t ahora) {
  Lectura l = {};

  float t = NAN, h = NAN;
  l.shtOk = (sht41.measureHighPrecision(t, h) == 0);
  if (l.shtOk) {
    tasa.agregar(t, ahora);                 // solo lecturas reales
    l.temp = t;
    l.hum = h;
    l.rocio = puntoRocioC(t, h);
    l.tasaMin = tasa.porMinuto(ahora);
  }

  l.pmsOk = pms.validas() > 0 && (ahora - ultimaTramaPmsMs) <= PMS_VIGENCIA_MS;
  if (l.pmsOk) {
    const Pms5003Datos& d = pms.datos();
    l.pm1  = PMS_USAR_ATM ? d.pm1_0_atm : d.pm1_0_cf1;
    l.pm25 = PMS_USAR_ATM ? d.pm2_5_atm : d.pm2_5_cf1;
    l.pm10 = PMS_USAR_ATM ? d.pm10_atm  : d.pm10_cf1;
  }
  return l;
}

// ---------- Publicacion (contrato JSON v1) ----------
void publicar(const Lectura& l, uint32_t ahora) {
  if (!mqtt.connected()) {
    Serial.println("Sin MQTT: lectura NO publicada");
    return;
  }

  JsonDocument doc;
  doc["schema"]   = 1;
  doc["type"]     = "ambiente";
  doc["node_id"]  = NODE_ID;
  doc["seq"]      = seq++;                 // sube solo en cada publicacion
  doc["uptime_s"] = ahora / 1000;

  if (l.shtOk) {
    doc["temp"]      = redondear(l.temp, 2);
    doc["hum"]       = redondear(l.hum, 1);
    doc["dew_point"] = redondear(l.rocio, 1);
    if (isnan(l.tasaMin)) doc["rate_c_min"] = nullptr;
    else                  doc["rate_c_min"] = redondear(l.tasaMin, 2);
  } else {
    doc["temp"] = nullptr;
    doc["hum"] = nullptr;
    doc["dew_point"] = nullptr;
    doc["rate_c_min"] = nullptr;
    doc["err"].add("sht41_timeout");      // codigo pendiente de aprobar por el equipo
  }

  if (l.pmsOk) {
    doc["pm1_0"] = l.pm1;
    doc["pm2_5"] = l.pm25;
    doc["pm10"]  = l.pm10;
  } else {
    doc["pm1_0"] = nullptr;
    doc["pm2_5"] = nullptr;
    doc["pm10"]  = nullptr;
    doc["err"].add("pms_sin_trama");      // codigo definido en el contrato
  }

  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n == 0 || n >= sizeof(buf) - 1) {
    Serial.println("ERROR: el JSON no cabe en el buffer");
    return;
  }
  bool ok = mqtt.publish(TOPIC_DATOS, buf);
  Serial.print(ok ? "PUB OK: " : "PUB FALLO: ");
  Serial.println(buf);
}

// ---------- Pantalla ----------
void mostrar(const Lectura& l) {
  if (!oledOk) return;
  pantalla.clearDisplay();
  pantalla.setTextSize(1);
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setCursor(0, 0);

  pantalla.println("Nodo ambiente " NODE_ID);
  pantalla.print("WiFi:");
  pantalla.print(WiFi.status() == WL_CONNECTED ? "OK " : "-- ");
  pantalla.print(" MQTT:");
  pantalla.println(mqtt.connected() ? "OK" : "--");

  if (l.shtOk) {
    pantalla.print("Temp:  "); pantalla.print(l.temp, 2);  pantalla.println(" C");
    pantalla.print("HR:    "); pantalla.print(l.hum, 1);   pantalla.println(" %");
    pantalla.print("Rocio: "); pantalla.print(l.rocio, 1); pantalla.println(" C");
  } else {
    pantalla.println("SHT41: ERROR");
    pantalla.println();
    pantalla.println();
  }

  if (l.pmsOk) {
    pantalla.print("PM2.5: "); pantalla.print(l.pm25); pantalla.println(" ug/m3");
  } else {
    pantalla.println("PM: sin trama");
  }

  pantalla.print("seq: "); pantalla.println(seq);
  pantalla.display();
}

// ---------- Conexiones (sin bloquear) ----------
void intentarMqtt() {
  Serial.print("Conectando al broker ");
  Serial.print(MQTT_HOST); Serial.print(":"); Serial.println(MQTT_PORT);
  bool ok = mqtt.connect(NODE_ID, MQTT_USER, MQTT_PASS,
                         TOPIC_ESTADO, 0, true, MSG_OFFLINE);   // LWT retenido
  if (ok) {
    Serial.println("MQTT OK");
    mqtt.publish(TOPIC_ESTADO, MSG_ONLINE, true);              // estado retenido
  } else {
    Serial.print("MQTT FALLO, rc=");
    Serial.println(mqtt.state());
  }
}

void gestionarConexiones(uint32_t ahora) {
  if (WiFi.status() != WL_CONNECTED) {
    wifiAvisado = false;
    return;                                // el ESP32 reintenta el WiFi solo
  }
  if (!wifiAvisado) {
    wifiAvisado = true;
    Serial.print("WiFi OK. IP del ESP32: ");
    Serial.println(WiFi.localIP());
  }
  if (!mqtt.connected() && ahora - ultimoIntentoMs >= REINTENTO_MS) {
    ultimoIntentoMs = ahora;
    intentarMqtt();
  }
}

// ================= Programa principal =================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("=== Nodo ambiente: firmware integrado (v0.1.0) ===");

  // I2C: SHT41 y OLED comparten el bus
  Wire.begin(PIN_SDA, PIN_SCL);

  oledOk = pantalla.begin(SSD1306_SWITCHCAPVCC, OLED_DIR, true, false);
  Serial.println(oledOk ? "OLED OK" : "ERROR: OLED no responde");
  if (oledOk) {
    pantalla.clearDisplay();
    pantalla.setTextSize(1);
    pantalla.setTextColor(SSD1306_WHITE);
    pantalla.setCursor(0, 0);
    pantalla.println("Iniciando...");
    pantalla.display();
  }

  sht41.begin(Wire, SHT41_I2C_ADDR_44);
  sht41.softReset();
  delay(10);

  // PMS5003 por UART2. Buffer grande para no perder bytes si MQTT tarda.
  Serial2.setRxBufferSize(1024);
  Serial2.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);

  // WiFi y MQTT
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando a WiFi: ");
  Serial.println(WIFI_SSID);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);      // el JSON no cabe en los 256 bytes por defecto
  mqtt.setSocketTimeout(5);     // no esperar demasiado si el broker no responde
}

void loop() {
  uint32_t ahora = millis();

  leerPms();                    // siempre, para no perder bytes
  gestionarConexiones(ahora);
  if (mqtt.connected()) mqtt.loop();

  if (ahora - ultimaLecturaMs >= PERIODO_MS) {
    ultimaLecturaMs = ahora;
    Lectura l = medir(ahora);
    publicar(l, ahora);
    mostrar(l);
  }
}