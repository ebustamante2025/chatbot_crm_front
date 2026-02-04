# CRM Frontend

Panel para agentes donde llegan los mensajes del widget-chatbot. Permite chatear con clientes, asignar y cerrar conversaciones.

## Características

- **Pestañas de roles** en la parte superior: Asesor, Administrador, Supervisor, Ventas
- **Chat con color azul** para mensajes del agente
- **Lista de conversaciones** del widget-chatbot
- **Tomar conversación** (asignar a sí mismo)
- **Enviar mensajes** al cliente
- **Cerrar conversación**

## Requisitos

- API Backend corriendo en `http://localhost:3001`
- Base de datos con datos de ejemplo (`npm run seed:run` en api-backend)

## Cómo iniciar

```bash
# 1. Instalar dependencias
cd apps/crm-frontend
npm install

# 2. Iniciar en modo desarrollo (puerto 3003)
npm run dev
```

Abre http://localhost:3003

## Flujo

1. El cliente usa el widget, se registra y elige "Chatear con agente"
2. Se crea una conversación en la BD (estado EN_COLA)
3. Los mensajes del cliente se guardan en la BD
4. El agente ve la conversación en el CRM, hace clic en "Tomar conversación"
5. El agente puede enviar mensajes que el cliente ve en el widget (polling cada 3 segundos)
