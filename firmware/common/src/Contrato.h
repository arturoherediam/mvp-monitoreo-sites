#pragma once
// Armado de los mensajes JSON del contrato (docs/acuerdos/contrato-json.md).
// No depende de Arduino: se puede probar en PC. Usa ArduinoJson v7.
#include <stdint.h>
#include <stddef.h>
#include <math.h>

// Valor interno para "entero sin dato" (PM). En el JSON sale como null.
const int32_t ENTERO_NO_DISPONIBLE = -1;

// Una lectura completa del nodo ambiente.
// Las medidas flotantes en NAN y los PM en ENTERO_NO_DISPONIBLE salen como null.
struct LecturaAmbiente {
  float   temp     = NAN;
  float   hum      = NAN;
  float   dewPoint = NAN;
  float   rateCMin = NAN;
  int32_t pm1_0    = ENTERO_NO_DISPONIBLE;
  int32_t pm2_5    = ENTERO_NO_DISPONIBLE;
  int32_t pm10     = ENTERO_NO_DISPONIBLE;
  bool    errSht41 = false;   // agrega "sht41_timeout" a err
  bool    errPms   = false;   // agrega "pms_sin_trama" a err
};

// Todas devuelven cuantos bytes escribieron en buf (sin contar el \0),
// o 0 si el mensaje no cabe en 'capacidad'.

// Telemetria (topic site/datos).
size_t armarTelemetriaAmbiente(char* buf, size_t capacidad, const char* nodeId,
                               uint32_t seq, uint32_t uptimeS,
                               const LecturaAmbiente& lectura);

// Estado "online" retenido (topic site/estado/<node_id>).
size_t armarEstadoOnlineAmbiente(char* buf, size_t capacidad, const char* nodeId,
                                 const char* fw, bool sht41Ok, bool pms5003Ok);

// Estado "offline" (el que publica el LWT).
size_t armarEstadoOffline(char* buf, size_t capacidad, const char* nodeId);