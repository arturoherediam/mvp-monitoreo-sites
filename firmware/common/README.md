# Librería común de firmware

Código compartido por ambos nodos (tarea 6.1, Priscila; revisa Luis Mario):

- Armado del JSON del contrato con ArduinoJson v7.
- Punto de rocío (Magnus, a = 17.62, b = 243.12) y velocidad de cambio en ventana de 60 s.
- Reconexión MQTT con LWT y estado retenido.

Pruebas obligatorias del punto de rocío: 25 °C y 60 % dan 16.7 °C; 30 °C y 70 % dan 23.9 °C.
