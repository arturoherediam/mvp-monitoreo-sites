#include "Meteo.h"

float puntoRocioC(float tempC, float humRel) {
  if (isnan(tempC) || isnan(humRel)) return NAN;
  if (humRel <= 0.0f || humRel > 100.0f) return NAN;

  const double a = 17.62;
  const double b = 243.12;
  double gamma = log((double)humRel / 100.0) + (a * tempC) / (b + tempC);
  return (float)((b * gamma) / (a - gamma));
}

TasaCambio::TasaCambio(uint32_t minSpanMs)
  : _inicio(0), _cuenta(0), _minSpanMs(minSpanMs) {}

void TasaCambio::reiniciar() {
  _inicio = 0;
  _cuenta = 0;
}

void TasaCambio::descartarViejas(uint32_t ahoraMs) {
  // La resta sin signo funciona aunque millis() de la vuelta.
  while (_cuenta > 0 && (uint32_t)(ahoraMs - _t[_inicio]) > VENTANA_MS) {
    _inicio = (_inicio + 1) % CAPACIDAD;
    _cuenta--;
  }
}

void TasaCambio::agregar(float tempC, uint32_t ahoraMs) {
  if (isnan(tempC)) return;
  descartarViejas(ahoraMs);
  if (_cuenta == CAPACIDAD) {                 // buffer lleno: quita la mas vieja
    _inicio = (_inicio + 1) % CAPACIDAD;
    _cuenta--;
  }
  uint8_t pos = (_inicio + _cuenta) % CAPACIDAD;
  _temp[pos] = tempC;
  _t[pos] = ahoraMs;
  _cuenta++;
}

float TasaCambio::porMinuto(uint32_t ahoraMs) {
  descartarViejas(ahoraMs);
  if (_cuenta < 2) return NAN;

  uint8_t viejo = _inicio;
  uint8_t nuevo = (_inicio + _cuenta - 1) % CAPACIDAD;
  uint32_t span = (uint32_t)(_t[nuevo] - _t[viejo]);
  if (span < _minSpanMs || span == 0) return NAN;

  float deltaC = _temp[nuevo] - _temp[viejo];
  float minutos = (float)span / 60000.0f;
  return deltaC / minutos;
}