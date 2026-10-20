#include "Contrato.h"
#include <ArduinoJson.h>

// Redondea a 2 decimales y evita el "-0".
static double redondear2(float v) {
  return (double)(roundf(v * 100.0f) / 100.0f) + 0.0;
}

static void ponerFloat(JsonDocument& doc, const char* clave, float v) {
  if (isfinite(v)) doc[clave] = redondear2(v);
  else             doc[clave] = nullptr;          // null en el JSON
}

static void ponerEntero(JsonDocument& doc, const char* clave, int32_t v) {
  if (v >= 0) doc[clave] = v;
  else        doc[clave] = nullptr;
}

// Serializa doc en buf. Devuelve 0 si no cabe.
static size_t escribir(JsonDocument& doc, char* buf, size_t capacidad) {
  if (buf == nullptr || capacidad == 0) return 0;
  size_t necesarios = measureJson(doc);
  if (necesarios + 1 > capacidad) {             // +1 por el \0 final
    buf[0] = '\0';
    return 0;
  }
  return serializeJson(doc, buf, capacidad);
}

size_t armarTelemetriaAmbiente(char* buf, size_t capacidad, const char* nodeId,
                               uint32_t seq, uint32_t uptimeS,
                               const LecturaAmbiente& l) {
  JsonDocument doc;
  doc["schema"]   = 1;
  doc["type"]     = "ambiente";
  doc["node_id"]  = nodeId;
  doc["seq"]      = seq;
  doc["uptime_s"] = uptimeS;
  ponerFloat(doc, "temp", l.temp);
  ponerFloat(doc, "hum", l.hum);
  ponerFloat(doc, "dew_point", l.dewPoint);
  ponerFloat(doc, "rate_c_min", l.rateCMin);
  ponerEntero(doc, "pm1_0", l.pm1_0);
  ponerEntero(doc, "pm2_5", l.pm2_5);
  ponerEntero(doc, "pm10", l.pm10);

  if (l.errSht41 || l.errPms) {                 // "err" solo si hay fallas
    JsonArray err = doc["err"].to<JsonArray>();
    if (l.errSht41) err.add("sht41_timeout");
    if (l.errPms)   err.add("pms_sin_trama");
  }
  return escribir(doc, buf, capacidad);
}

size_t armarEstadoOnlineAmbiente(char* buf, size_t capacidad, const char* nodeId,
                                 const char* fw, bool sht41Ok, bool pms5003Ok) {
  JsonDocument doc;
  doc["schema"]  = 1;
  doc["node_id"] = nodeId;
  doc["status"]  = "online";
  doc["fw"]      = fw;
  JsonObject sensores = doc["sensors"].to<JsonObject>();
  sensores["sht41"]   = sht41Ok;
  sensores["pms5003"] = pms5003Ok;
  return escribir(doc, buf, capacidad);
}

size_t armarEstadoOffline(char* buf, size_t capacidad, const char* nodeId) {
  JsonDocument doc;
  doc["schema"]  = 1;
  doc["node_id"] = nodeId;
  doc["status"]  = "offline";
  return escribir(doc, buf, capacidad);
}