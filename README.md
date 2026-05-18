# Creative Production OS — Agencia RConcept

Sistema operativo interno diseñado para la gestión de producción creativa, asignaciones de equipo y control de facturación operativa.

## Tecnologías
- **Frontend**: Vanilla HTML/JS/CSS
- **Bundler**: Vite
- **Backend/DB**: Firebase (Firestore, Auth, Storage)
- **Design**: Minimalist Premium (Estilo Notion/Linear)

## Características
- **Asignaciones**: Control de grabaciones y ediciones por empleado.
- **Pagos Pendientes**: Sistema de doble validación (Usuario vs Admin).
- **Estrategia de Clientes**: Biblioteca de guiones recomendados y assets específicos.
- **Hooks & Formatos**: Biblioteca de estructuras narrativas de alta retención.

## Instalación y Desarrollo
1. Instalar dependencias: `npm install`
2. Correr en local: `npm run dev`
3. Construir para producción: `npm run build`

## Despliegue e Inteligencia Artificial
* **Hosting**: El proyecto está optimizado y configurado para desplegarse automáticamente en **Vercel** (`vercel.json` rewrite rules).
* **Base de Datos**: Utiliza **Firebase** (Firestore, Auth, Storage) para la persistencia.
* **AI Copiloto**: Integra **Anthropic Claude 3.5 Sonnet** (`api/chat.js` serverless function) configurado mediante la variable de entorno `ANTHROPIC_API_KEY` en el panel de Vercel.
