#include "MqttNodo.h"
#include "Contrato.h"
#include <stdio.h>
#include <string.h>

static const char* TOPIC_DATOS = "site/datos";

MqttNodo::MqttNodo(Client& red, const char* host, uint16_t port,
                   const char* user, const char* password, const char* nodeId)
  : _mqtt(red), _host(host), _port(port), _user(user), _pass(password),
    _nodeId(nodeId), _intentos(0), _proximoIntentoMs(0) {
  _topicEstado[0] = '\0';
  _willMsg[0] = '\0';
  _estadoOnline[0] = '\0';
}

void MqttNodo::iniciar() {
  snprintf(_topicEstado, sizeof(_topicEstado), "site/estado/%s", _nodeId);
  armarEstadoOffline(_willMsg, sizeof(_willMsg), _nodeId);

  _mqtt.setServer(_host, _port);
  // El buffer por defecto (256 bytes) apenas alcanza para nuestro JSON mas largo.
  _mqtt.setBufferSize(512);
  // Un intento de conexion bloqueara como maximo 3 s (por defecto serian 15 s).
  _mqtt.setSocketTimeout(3);
}

void MqttNodo::definirEstadoOnline(const char* json) {
  if (json == nullptr) return;
  bool cambio = strcmp(json, _estadoOnline) != 0;
  strncpy(_estadoOnline, json, sizeof(_estadoOnline) - 1);
  _estadoOnline[sizeof(_estadoOnline) - 1] = '\0';
  if (cambio && _mqtt.connected()) {
    _mqtt.publish(_topicEstado, _estadoOnline, true);   // retenido
  }
}

void MqttNodo::intentarConexion(uint32_t ahoraMs) {
  // LWT: topic de estado, QoS 0, retenido, mensaje "offline".
  bool ok = _mqtt.connect(_nodeId, _user, _pass,
                          _topicEstado, 0, true, _willMsg);
  if (ok) {
    _intentos = 0;
    if (_estadoOnline[0] != '\0') {
      _mqtt.publish(_topicEstado, _estadoOnline, true); // retenido
    }
  } else {
    if (_intentos < 255) _intentos++;
    uint32_t espera = 2000UL << (_intentos > 5 ? 4 : _intentos - 1);  // 2,4,8,16,32
    if (espera > 30000UL) espera = 30000UL;
    _proximoIntentoMs = ahoraMs + espera;
  }
}

void MqttNodo::actualizar(uint32_t ahoraMs) {
  if (_mqtt.connected()) {
    _mqtt.loop();           // atiende el keep-alive
    return;
  }
  // Resta con signo: correcta aunque millis() de la vuelta.
  if ((int32_t)(ahoraMs - _proximoIntentoMs) < 0) return;
  intentarConexion(ahoraMs);
}

bool MqttNodo::conectado() {
  return _mqtt.connected();
}

bool MqttNodo::publicarTelemetria(const char* json) {
  if (!_mqtt.connected() || json == nullptr) return false;
  return _mqtt.publish(TOPIC_DATOS, json);   // QoS 0
}

int MqttNodo::codigoEstado() {
  return _mqtt.state();
}