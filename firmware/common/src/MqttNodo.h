#pragma once
// Conexion MQTT de un nodo: reconexion, LWT y estado retenido (tarea 6.1).
// Sirve para ambos nodos (rack y ambiente). Usa PubSubClient (solo QoS 0).
//
// Topics (docs/acuerdos/contrato-json.md):
//   telemetria -> site/datos
//   estado     -> site/estado/<node_id>   (retenido; el LWT publica "offline" aqui)
//
// Esta clase NO conecta el WiFi: eso lo hace el programa del nodo.
#include <Arduino.h>
#include <Client.h>
#include <PubSubClient.h>

class MqttNodo {
public:
  // red: el cliente TCP (por ejemplo un WiFiClient). Los textos (host, user,
  // password, nodeId) deben seguir existiendo mientras se use la clase
  // (las constantes de secrets.h cumplen esto).
  MqttNodo(Client& red, const char* host, uint16_t port,
           const char* user, const char* password, const char* nodeId);

  // Llamar una vez en setup(). Prepara el buffer y el mensaje LWT.
  void iniciar();

  // JSON de estado "online" que se publica (retenido) al conectar.
  // Si cambia estando conectado, se vuelve a publicar.
  void definirEstadoOnline(const char* json);

  // Llamar en cada vuelta de loop(). Mantiene la conexion y reintenta con
  // espera creciente (2, 4, 8, 16 y 30 s). Solo bloquea durante un intento.
  void actualizar(uint32_t ahoraMs);

  bool conectado();

  // Publica telemetria en site/datos (QoS 0). false si no hay conexion.
  bool publicarTelemetria(const char* json);

  // Codigo de estado de PubSubClient (0 = conectado; negativos = fallas).
  int codigoEstado();

  const char* topicEstado() const { return _topicEstado; }

private:
  PubSubClient _mqtt;
  const char*  _host;
  uint16_t     _port;
  const char*  _user;
  const char*  _pass;
  const char*  _nodeId;

  char     _topicEstado[40];
  char     _willMsg[96];       // JSON offline (LWT)
  char     _estadoOnline[200]; // JSON online

  uint8_t  _intentos;
  uint32_t _proximoIntentoMs;

  void intentarConexion(uint32_t ahoraMs);
};