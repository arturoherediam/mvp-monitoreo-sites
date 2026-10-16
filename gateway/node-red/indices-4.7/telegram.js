// Preparar Telegram: arma la petición a la API de bots para el nodo http request (POST).
// El token y el chat NO van en el flujo: se leen de variables de entorno de Node-RED
//   TELEGRAM_TOKEN   token del bot (de @BotFather)
//   TELEGRAM_CHAT    id del chat o grupo del equipo
const token = env.get('TELEGRAM_TOKEN');
const chat = env.get('TELEGRAM_CHAT');
if (!token || !chat) {
    node.status({ fill: 'yellow', shape: 'ring', text: 'Telegram sin configurar' });
    return null;
}
const texto = String((msg.payload && msg.payload.text) || '').slice(0, 4000);
if (!texto) return null;
node.status({ fill: 'green', shape: 'dot', text: 'enviado ' + new Date().toLocaleTimeString('es-MX') });
return {
    url: 'https://api.telegram.org/bot' + token + '/sendMessage',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    payload: { chat_id: chat, text: texto }
};
