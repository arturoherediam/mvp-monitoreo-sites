#pragma once
// Funciones meteorologicas comunes a los nodos (tarea 6.1).
// No depende de Arduino: se puede probar en PC.
#include <stdint.h>
#include <math.h>

// Punto de rocio en grados C con la formula de Magnus
// (a = 17.62, b = 243.12, segun docs/acuerdos/contrato-json.md).
// Devuelve NAN si los datos no son validos (NAN, humedad <= 0 o > 100).
float puntoRocioC(float tempC, float humRel);

// Velocidad de cambio de temperatura en C/min con ventana de 60 s.
class TasaCambio {
public:
  static const uint32_t VENTANA_MS = 60000UL;   // 60 s (contrato)
  static const uint8_t  CAPACIDAD  = 32;        // muestras maximas guardadas

  // minSpanMs: tiempo minimo entre la muestra mas vieja y la mas nueva
  // para calcular la tasa (decision tecnica propia, ver documentacion).
  explicit TasaCambio(uint32_t minSpanMs = 30000UL);

  // Guarda una muestra valida. Llamar solo con lecturas reales del sensor.
  void agregar(float tempC, uint32_t ahoraMs);

  // Devuelve C/min, o NAN si aun no hay datos suficientes en la ventana.
  float porMinuto(uint32_t ahoraMs);

  void reiniciar();

private:
  float    _temp[CAPACIDAD];
  uint32_t _t[CAPACIDAD];
  uint8_t  _inicio;   // indice de la muestra mas vieja
  uint8_t  _cuenta;   // cuantas muestras hay
  uint32_t _minSpanMs;
  void descartarViejas(uint32_t ahoraMs);
};