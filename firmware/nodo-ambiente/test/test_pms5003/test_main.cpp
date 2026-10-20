#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>
#include <string.h>
#include <Pms5003.h>

// Trama valida armada y calculada a mano:
// CF=1: PM1.0=9, PM2.5=14, PM10=21 | Atm: PM1.0=8, PM2.5=13, PM10=20
// Suma bytes 0..29 = 66+77+28 + (9+14+21+8+13+20) + 0x97 = 407 = 0x0197
static const uint8_t TRAMA_OK[32] = {
  0x42, 0x4D, 0x00, 0x1C,
  0x00, 0x09, 0x00, 0x0E, 0x00, 0x15,      // CF=1
  0x00, 0x08, 0x00, 0x0D, 0x00, 0x14,      // atmosferico
  0,0, 0,0, 0,0, 0,0, 0,0, 0,0,            // conteos en cero
  0x97, 0x00,                              // version y error
  0x01, 0x97                               // suma de comprobacion
};

static int alimentarTodo(Pms5003Parser& p, const uint8_t* d, size_t n) {
  int tramas = 0;
  for (size_t i = 0; i < n; i++) {
    if (p.alimentar(d[i])) tramas++;
  }
  return tramas;
}

void setUp(void) {}
void tearDown(void) {}

// 1) Una trama correcta se interpreta bien
void test_trama_valida(void) {
  Pms5003Parser p;
  TEST_ASSERT_EQUAL(1, alimentarTodo(p, TRAMA_OK, 32));
  TEST_ASSERT_EQUAL_UINT16(9,  p.datos().pm1_0_cf1);
  TEST_ASSERT_EQUAL_UINT16(14, p.datos().pm2_5_cf1);
  TEST_ASSERT_EQUAL_UINT16(21, p.datos().pm10_cf1);
  TEST_ASSERT_EQUAL_UINT16(8,  p.datos().pm1_0_atm);
  TEST_ASSERT_EQUAL_UINT16(13, p.datos().pm2_5_atm);
  TEST_ASSERT_EQUAL_UINT16(20, p.datos().pm10_atm);
  TEST_ASSERT_EQUAL_UINT32(1, p.validas());
  TEST_ASSERT_EQUAL_UINT32(0, p.sumaMala());
}

// 2) Suma de comprobacion danada: se rechaza y NO se inventan valores
void test_suma_mala(void) {
  uint8_t t[32];
  memcpy(t, TRAMA_OK, 32);
  t[31] = 0x98;
  Pms5003Parser p;
  TEST_ASSERT_EQUAL(0, alimentarTodo(p, t, 32));
  TEST_ASSERT_EQUAL_UINT32(1, p.sumaMala());
  TEST_ASSERT_EQUAL_UINT32(0, p.validas());
  TEST_ASSERT_EQUAL_UINT16(0, p.datos().pm2_5_cf1);
}

// 3) Largo distinto de 28: se rechaza
void test_largo_malo(void) {
  uint8_t t[32];
  memcpy(t, TRAMA_OK, 32);
  t[3] = 0x1D;
  Pms5003Parser p;
  TEST_ASSERT_EQUAL(0, alimentarTodo(p, t, 32));
  TEST_ASSERT_EQUAL_UINT32(1, p.longMala());
  TEST_ASSERT_EQUAL_UINT32(0, p.validas());
}

// 4) Basura antes de la trama (incluido un "42" suelto): se recupera
void test_basura_antes(void) {
  const uint8_t basura[] = {0x00, 0x00, 0x80, 0xC0, 0x42, 0x00, 0x42};
  Pms5003Parser p;
  alimentarTodo(p, basura, sizeof(basura));
  TEST_ASSERT_EQUAL(1, alimentarTodo(p, TRAMA_OK, 32));
  TEST_ASSERT_EQUAL_UINT16(14, p.datos().pm2_5_cf1);
}

// 5) Dos tramas seguidas: se leen las dos
void test_dos_tramas(void) {
  Pms5003Parser p;
  alimentarTodo(p, TRAMA_OK, 32);
  alimentarTodo(p, TRAMA_OK, 32);
  TEST_ASSERT_EQUAL_UINT32(2, p.validas());
  TEST_ASSERT_EQUAL_UINT32(64, p.bytes());
}

// 6) El ruido real que viste en tu volcado: ninguna trama, sin fallar
void test_ruido_real(void) {
  const uint8_t ruido[] = {0x00, 0x00, 0x80, 0xC0};
  Pms5003Parser p;
  TEST_ASSERT_EQUAL(0, alimentarTodo(p, ruido, sizeof(ruido)));
  TEST_ASSERT_EQUAL_UINT32(4, p.bytes());
  TEST_ASSERT_EQUAL_UINT32(0, p.validas());
}

// 7) Una trama buena despues de una mala: se recupera
void test_mala_luego_buena(void) {
  uint8_t t[32];
  memcpy(t, TRAMA_OK, 32);
  t[31] = 0x98;
  Pms5003Parser p;
  alimentarTodo(p, t, 32);
  TEST_ASSERT_EQUAL(1, alimentarTodo(p, TRAMA_OK, 32));
  TEST_ASSERT_EQUAL_UINT32(1, p.sumaMala());
  TEST_ASSERT_EQUAL_UINT32(1, p.validas());
}

static void correrPruebas(void) {
  UNITY_BEGIN();
  RUN_TEST(test_trama_valida);
  RUN_TEST(test_suma_mala);
  RUN_TEST(test_largo_malo);
  RUN_TEST(test_basura_antes);
  RUN_TEST(test_dos_tramas);
  RUN_TEST(test_ruido_real);
  RUN_TEST(test_mala_luego_buena);
  UNITY_END();
}

#ifdef ARDUINO
void setup() {
  delay(2000);          // da tiempo a que se abra el puerto serie
  correrPruebas();
}
void loop() {}
#else
int main(int, char**) {
  correrPruebas();
  return 0;
}
#endif