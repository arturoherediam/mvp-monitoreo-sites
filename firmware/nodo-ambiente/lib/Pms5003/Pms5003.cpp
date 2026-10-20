#include "Pms5003.h"

bool Pms5003Parser::alimentar(uint8_t b) {
  bytes_++;

  // 1) Esperar el primer byte del encabezado
  if (pos_ == 0) {
    if (b == 0x42) buf_[pos_++] = b;
    return false;
  }

  // 2) Esperar el segundo byte del encabezado
  if (pos_ == 1) {
    if (b == 0x4D) {
      buf_[pos_++] = b;
    } else if (b == 0x42) {
      // "42 42 4D": el segundo 42 puede ser el inicio real; seguimos esperando 4D
    } else {
      pos_ = 0;
    }
    return false;
  }

  // 3) Guardar el byte
  buf_[pos_++] = b;

  // 4) Al tener el largo (bytes 2 y 3), revisarlo
  if (pos_ == 4) {
    if (leer16(&buf_[2]) != 28) {
      longMala_++;
      pos_ = 0;
    }
    return false;
  }

  // 5) Esperar hasta tener los 32 bytes
  if (pos_ < LARGO_TRAMA) return false;
  pos_ = 0;

  // 6) Suma de comprobacion: bytes 0 a 29 contra bytes 30 y 31
  uint16_t suma = 0;
  for (uint8_t i = 0; i < 30; i++) suma += buf_[i];
  if (suma != leer16(&buf_[30])) {
    sumaMala_++;
    return false;              // no se tocan los datos
  }

  // 7) Trama valida: copiar los datos
  datos_.pm1_0_cf1 = leer16(&buf_[4]);
  datos_.pm2_5_cf1 = leer16(&buf_[6]);
  datos_.pm10_cf1  = leer16(&buf_[8]);
  datos_.pm1_0_atm = leer16(&buf_[10]);
  datos_.pm2_5_atm = leer16(&buf_[12]);
  datos_.pm10_atm  = leer16(&buf_[14]);
  for (uint8_t i = 0; i < 6; i++) {
    datos_.cuentas[i] = leer16(&buf_[16 + 2 * i]);
  }
  validas_++;
  return true;
}