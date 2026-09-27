/**
 * RConcept Systems — configuración de Capacitor (wrapper Android).
 *
 * - appId `co.rohlfingconcept.rsys` es PLACEHOLDER (cambiar al id real
 *   de Play Console cuando Juan lo defina).
 * - webDir `www`: el frontend usa Next.js en modo servidor por defecto
 *   (`next.config.ts` SIN `output: "export"`, verificado), así que no hay
 *   directorio estático local que empaquetar. `www/` es un placeholder
 *   vacío documentado: la app Android cargará la web remota vía
 *   `server.url`. Si el frontend cambiara a `output: "export"`, cambiar
 *   webDir a `out` (directorio que genera `npm run build` en ese modo).
 * - `server.url`: Capacitor lee esta config de forma ESTÁTICA, el valor
 *   queda fijado al correr `npx cap sync`. Se toma de la variable de
 *   entorno `CAP_SERVER_URL` (ver `.env.example`): vacía en local = la
 *   app usa el bundle local (`www/`); en el build Android apuntar a la
 *   web desplegada, ej. `CAP_SERVER_URL=https://<web>.vercel.app npx cap sync android`.
 * - `cleartext: true` permite `http://` en desarrollo local. Jamás usar
 *   una URL http en producción.
 *
 * PENDIENTE (F0): `@capacitor/core` + `@capacitor/cli` +
 * `@capacitor/android` aún no instalados y `android/` aún no generado.
 * (Pasos exactos en `README.md` § "Android / APK".)
 * NOTA tsc: sin tipo importado a propósito — @capacitor/cli aún no está
 * instalado; al instalarlo se puede tipar como CapacitorConfig.
 */
const config = {
  appId: "co.rohlfingconcept.rsys",
  appName: "RConcept Systems",
  webDir: "www",
  server: {
    url: process.env.CAP_SERVER_URL,
    cleartext: true,
  },
};

export default config;
