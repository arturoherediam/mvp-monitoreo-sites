#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <SensirionI2cSht4x.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Meteo.h>          // firmware/common: punto de rocio y tasa de cambio
#include <Contrato.h>       // firmware/common: armado del JSON del contrato
#include <MqttNodo.h>       // firmware/common: MQTT con LWT, reconexion y estado retenido
#include <Pms5003.h>        // lib/Pms5003: lector de tramas
#include "secrets.h"

const char* FW_VERSION = "0.1.0";

// ================= Pines (propuesta; por confirmar en hardware/pinout.md) =================
const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PMS_RX  = 16;     // acuerdo: UART2 en GPIO16/17. Cual es RX y cual TX lo define Sebastian
const int PMS_TX  = 17;

// ================= Tiempos =================
const uint32_t PERIODO_MS      = 5000;  // nodo ambiente: cada 5 s (contrato)
const uint32_t PMS_VIGENCIA_MS = 3000;  // si la ultima trama es mas vieja, se considera "sin trama"

// ================= PMS5003: CF=1 o atmosferico =================
// DECISION PENDIENTE de Priscila (fecha limite 13 oct). Valor PROVISIONAL:
const bool PMS_USAR_ATM = true;

// ================= OLED =================
const int OLED_ANCHO = 128;
const int OLED_ALTO  = 64;            // cambia a 32 si tu pantalla es 128x32
const uint8_t OLED_DIR = 0x3C;

// ================= Objetos =================
WiFiClient red;
MqttNodo mqtt(red, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASSWORD, NODE_ID);
SensirionI2cSht4x sht41;
Adafruit_SSD1306 pantalla(OLED_ANCHO, OLED_ALTO, &Wire, -1);
TasaCambio tasa;
Pms5003Parser pms;

// ================= Estado =================
uint32_t seq = 0;                       // el primer mensaje publicado lleva seq = 1
uint32_t ultimaLecturaMs = 0;
uint32_t ultimaTramaPmsMs = 0;
bool oledOk = false;
bool wifiAvisado = false;
bool mqttAvisado = false;

// Ultimo estado "online" entregado a MqttNodo (para no rearmarlo si no cambia)
bool estadoDefinido = false;
bool estadoSht = false;
bool estadoPms = false;

struct Lectura {
  bool shtOk;
  float temp, hum, rocio, tasaMin;
  bool pmsOk;
  uint16_t pm1, pm25, pm10;
};

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

// ---------- Estado "online" (armado por Contrato, publicado por MqttNodo) ----------
// Solo se rearma si cambia el estado de algun sensor; MqttNodo lo republica si esta conectado.
void definirEstado(bool shtOk, bool pmsOk) {
  if (estadoDefinido && shtOk == estadoSht && pmsOk == estadoPms) return;

  char buf[200];
  size_t n = armarEstadoOnlineAmbiente(buf, sizeof(buf), NODE_ID, FW_VERSION, shtOk, pmsOk);
  if (n == 0) {
    Serial.println("ERROR: el estado online no cabe en el buffer");
    return;
  }
  mqtt.definirEstadoOnline(buf);
  estadoDefinido = true;
  estadoSht = shtOk;
  estadoPms = pmsOk;
  Serial.print("Estado online: ");
  Serial.println(buf);
}

// ---------- Telemetria (armada por Contrato, publicada por MqttNodo) ----------
void publicar(const Lectura& l, uint32_t ahora) {
  if (!mqtt.conectado()) {
    Serial.println("Sin MQTT: lectura NO publicada");
    return;
  }

  // Valores por defecto de LecturaAmbiente: NAN y ENTERO_NO_DISPONIBLE (salen como null)
  LecturaAmbiente la;
  if (l.shtOk) {
    la.temp     = l.temp;
    la.hum      = l.hum;
    la.dewPoint = l.rocio;
    la.rateCMin = l.tasaMin;               // NAN si aun no hay datos -> null
  } else {
    la.errSht41 = true;                    // -> "sht41_timeout"
  }
  if (l.pmsOk) {
    la.pm1_0 = l.pm1;
    la.pm2_5 = l.pm25;
    la.pm10  = l.pm10;
  } else {
    la.errPms = true;                      // -> "pms_sin_trama"
  }

  char buf[512];
  uint32_t siguiente = seq + 1;            // contrato: empieza en 1 y sube en cada publicacion
  size_t n = armarTelemetriaAmbiente(buf, sizeof(buf), NODE_ID, siguiente, ahora / 1000, la);
  if (n == 0) {
    Serial.println("ERROR: el JSON no cabe en el buffer");
    return;
  }
  seq = siguiente;

  bool ok = mqtt.publicarTelemetria(buf);
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
  pantalla.println(mqtt.conectado() ? "OK" : "--");

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

// ---------- Conexiones ----------
// El WiFi lo maneja este programa; MQTT lo maneja MqttNodo (no conecta el WiFi).
void gestionarConexiones(uint32_t ahora) {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiAvisado) Serial.println("WiFi perdido, esperando reconexion...");
    wifiAvisado = false;
    return;                                // sin WiFi no se intenta MQTT
  }
  if (!wifiAvisado) {
    wifiAvisado = true;
    Serial.print("WiFi OK. IP del ESP32: ");
    Serial.println(WiFi.localIP());
  }

  mqtt.actualizar(ahora);                  // reconexion con espera creciente, LWT y estado retenido

  bool conectado = mqtt.conectado();
  if (conectado != mqttAvisado) {
    mqttAvisado = conectado;
    if (conectado) {
      Serial.println("MQTT OK");
    } else {
      Serial.print("MQTT desconectado, codigo=");
      Serial.println(mqtt.codigoEstado());
    }
  }
}

// ================= Programa principal =================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.print("=== Nodo ambiente: firmware integrado (v");
  Serial.print(FW_VERSION);
  Serial.println(") ===");

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
  uint32_t serie = 0;
  bool shtDetectado = (sht41.serialNumber(serie) == 0);
  Serial.println(shtDetectado ? "SHT41 OK" : "ERROR: SHT41 no responde");

  // PMS5003 por UART2. Buffer grande para no perder bytes si MQTT tarda.
  Serial2.setRxBufferSize(1024);
  Serial2.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);

  // WiFi (lo maneja este programa)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando a WiFi: ");
  Serial.println(WIFI_SSID);

  // MQTT (lo maneja la libreria comun)
  mqtt.iniciar();
  definirEstado(shtDetectado, false);      // el PMS aun no ha mandado tramas
  Serial.print("Broker: ");
  Serial.print(MQTT_HOST); Serial.print(":"); Serial.println(MQTT_PORT);
}

void loop() {
  uint32_t ahora = millis();

  leerPms();                    // siempre, para no perder bytes
  gestionarConexiones(ahora);

  if (ahora - ultimaLecturaMs >= PERIODO_MS) {
    ultimaLecturaMs = ahora;
    Lectura l = medir(ahora);
    definirEstado(l.shtOk, l.pmsOk);       // republica el estado solo si cambia
    publicar(l, ahora);
    mostrar(l);
  }
}