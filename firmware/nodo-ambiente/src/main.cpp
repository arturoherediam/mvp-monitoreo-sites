#include <Arduino.h>
#include <Meteo.h>      // viene de firmware/common
#include <Contrato.h>   // viene de firmware/common
#include <WiFi.h>
#include <MqttNodo.h>
#include "secrets.h"

// Pruebas de la libreria comun (tarea 6.1). No usa sensores.
// Imprime PASS o FAIL por cada prueba en el monitor serie.
WiFiClient clienteRed;
MqttNodo mqtt(clienteRed, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASSWORD, NODE_ID);
int fallos = 0;

void revisa(const char* nombre, bool ok) {
  Serial.print(ok ? "PASS  " : "FAIL  ");
  Serial.println(nombre);
  if (!ok) fallos++;
}

bool cerca(float valor, float esperado, float tolerancia) {
  return !isnan(valor) && fabsf(valor - esperado) <= tolerancia;
}

// ---------- Parte 1: punto de rocio y tasa de cambio ----------

void pruebaPuntoRocio() {
  float r1 = puntoRocioC(25.0f, 60.0f);
  float r2 = puntoRocioC(30.0f, 70.0f);
  Serial.print("  25 C y 60 % -> "); Serial.println(r1, 2);
  Serial.print("  30 C y 70 % -> "); Serial.println(r2, 2);
  revisa("rocio 25 C / 60 % = 16.7", cerca(r1, 16.7f, 0.05f));
  revisa("rocio 30 C / 70 % = 23.9", cerca(r2, 23.9f, 0.05f));
  revisa("rocio con humedad 0 = NAN", isnan(puntoRocioC(25.0f, 0.0f)));
  revisa("rocio con dato NAN = NAN", isnan(puntoRocioC(NAN, 60.0f)));
}

void pruebaTasa(uint32_t base, const char* etiqueta) {
  TasaCambio tasa;
  // 13 muestras, una cada 5 s durante 60 s, subiendo 0.5 C por minuto.
  for (int k = 0; k <= 12; k++) {
    uint32_t t = base + (uint32_t)k * 5000UL;
    tasa.agregar(24.0f + 0.5f * (k * 5000.0f / 60000.0f), t);
    if (k == 0) {
      revisa("tasa con 1 muestra = NAN", isnan(tasa.porMinuto(t)));
    }
  }
  uint32_t fin = base + 60000UL;
  float r = tasa.porMinuto(fin);
  Serial.print("  tasa "); Serial.print(etiqueta); Serial.print(" -> "); Serial.println(r, 3);
  revisa("tasa sube 0.5 C/min", cerca(r, 0.5f, 0.01f));
  revisa("tasa vacia tras 70 s sin datos = NAN", isnan(tasa.porMinuto(fin + 70000UL)));
}

// ---------- Parte 2: JSON del contrato ----------

// Compara el JSON generado con el texto esperado y lo imprime.
void revisaJson(const char* nombre, const char* generado, const char* esperado) {
  Serial.print("  "); Serial.println(generado);
  revisa(nombre, strcmp(generado, esperado) == 0);
}

void pruebaJson() {
  char buf[300];

  LecturaAmbiente ok;
  ok.temp = 29.4f; ok.hum = 71.2f; ok.dewPoint = 23.6f; ok.rateCMin = 0.0f;
  ok.pm1_0 = 9; ok.pm2_5 = 14; ok.pm10 = 21;

  armarTelemetriaAmbiente(buf, sizeof(buf), "amb-01", 88, 912, ok);
  revisaJson("json normal (ambiente.json)", buf,
    R"({"schema":1,"type":"ambiente","node_id":"amb-01","seq":88,"uptime_s":912,"temp":29.4,"hum":71.2,"dew_point":23.6,"rate_c_min":0,"pm1_0":9,"pm2_5":14,"pm10":21})");

  LecturaAmbiente sinPms = ok;
  sinPms.pm1_0 = sinPms.pm2_5 = sinPms.pm10 = ENTERO_NO_DISPONIBLE;
  sinPms.errPms = true;
  armarTelemetriaAmbiente(buf, sizeof(buf), "amb-01", 89, 917, sinPms);
  revisaJson("json falla PMS5003", buf,
    R"({"schema":1,"type":"ambiente","node_id":"amb-01","seq":89,"uptime_s":917,"temp":29.4,"hum":71.2,"dew_point":23.6,"rate_c_min":0,"pm1_0":null,"pm2_5":null,"pm10":null,"err":["pms_sin_trama"]})");

  LecturaAmbiente sinSht = ok;
  sinSht.temp = sinSht.hum = sinSht.dewPoint = sinSht.rateCMin = NAN;
  sinSht.errSht41 = true;
  armarTelemetriaAmbiente(buf, sizeof(buf), "amb-01", 90, 922, sinSht);
  revisaJson("json falla SHT41", buf,
    R"({"schema":1,"type":"ambiente","node_id":"amb-01","seq":90,"uptime_s":922,"temp":null,"hum":null,"dew_point":null,"rate_c_min":null,"pm1_0":9,"pm2_5":14,"pm10":21,"err":["sht41_timeout"]})");

  LecturaAmbiente ambos;                      // todo en NAN / sin dato
  ambos.errSht41 = true; ambos.errPms = true;
  armarTelemetriaAmbiente(buf, sizeof(buf), "amb-01", 91, 927, ambos);
  revisaJson("json con ambas fallas", buf,
    R"({"schema":1,"type":"ambiente","node_id":"amb-01","seq":91,"uptime_s":927,"temp":null,"hum":null,"dew_point":null,"rate_c_min":null,"pm1_0":null,"pm2_5":null,"pm10":null,"err":["sht41_timeout","pms_sin_trama"]})");

  LecturaAmbiente redondeo = ok;
  redondeo.temp = 24.3156f; redondeo.dewPoint = -0.001f; redondeo.rateCMin = -0.001f;
  armarTelemetriaAmbiente(buf, sizeof(buf), "amb-01", 92, 932, redondeo);
  revisaJson("json redondea a 2 decimales y sin -0", buf,
    R"({"schema":1,"type":"ambiente","node_id":"amb-01","seq":92,"uptime_s":932,"temp":24.32,"hum":71.2,"dew_point":0,"rate_c_min":0,"pm1_0":9,"pm2_5":14,"pm10":21})");

  armarEstadoOnlineAmbiente(buf, sizeof(buf), "amb-01", "1.0.0", true, true);
  revisaJson("estado online", buf,
    R"({"schema":1,"node_id":"amb-01","status":"online","fw":"1.0.0","sensors":{"sht41":true,"pms5003":true}})");

  armarEstadoOffline(buf, sizeof(buf), "amb-01");
  revisaJson("estado offline (LWT)", buf,
    R"({"schema":1,"node_id":"amb-01","status":"offline"})");

  char chico[40];
  size_t n = armarEstadoOnlineAmbiente(chico, sizeof(chico), "amb-01", "1.0.0", true, true);
  revisa("buffer chico devuelve 0", n == 0);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  mqtt.iniciar();
  Serial.println();
  Serial.println("=== Pruebas libreria comun (6.1) ===");
  pruebaPuntoRocio();
  pruebaTasa(0UL, "normal");
  pruebaTasa(4294937296UL, "con vuelta de millis");   // 2^32 - 30000
  pruebaJson();
  Serial.println(fallos == 0 ? "=== TODO OK ===" : "=== HAY FALLOS ===");
}

void loop() {
}