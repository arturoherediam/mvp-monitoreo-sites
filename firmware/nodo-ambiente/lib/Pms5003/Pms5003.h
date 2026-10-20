#pragma once
#include <stdint.h>
#include <stddef.h>

// Lector de tramas del PMS5003 (32 bytes, encabezado 0x42 0x4D).
// No depende de Arduino: se puede probar en el ESP32 o en la PC.

struct Pms5003Datos {
  uint16_t pm1_0_cf1;
  uint16_t pm2_5_cf1;
  uint16_t pm10_cf1;
  uint16_t pm1_0_atm;
  uint16_t pm2_5_atm;
  uint16_t pm10_atm;
  uint16_t cuentas[6];   // particulas por 0.1 L: >0.3, >0.5, >1.0, >2.5, >5.0, >10 um
};

class Pms5003Parser {
public:
  static const uint8_t LARGO_TRAMA = 32;

  // Recibe un byte. Devuelve true cuando se completa una trama VALIDA.
  bool alimentar(uint8_t b);

  // Datos de la ultima trama valida (solo cambian con una trama valida).
  const Pms5003Datos& datos() const { return datos_; }

  uint32_t bytes() const     { return bytes_; }
  uint32_t validas() const   { return validas_; }
  uint32_t sumaMala() const  { return sumaMala_; }
  uint32_t longMala() const  { return longMala_; }

private:
  uint8_t buf_[LARGO_TRAMA];
  uint8_t pos_ = 0;
  Pms5003Datos datos_ = {};
  uint32_t bytes_ = 0;
  uint32_t validas_ = 0;
  uint32_t sumaMala_ = 0;
  uint32_t longMala_ = 0;

  static uint16_t leer16(const uint8_t* p) {
    return (uint16_t)((p[0] << 8) | p[1]);
  }
};