// lib/__tests__/drive-enlaces.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CUENTA_EQUIPO_DRIVE,
  cuentaEquipoEsperada,
  esCuentaEquipoDrive,
  esUrlHttpsValida,
  normalizarCorreoDrive,
  normalizarUrlEnlace,
  truncarNombreEnlace,
} from "../drive-equipo";
import type { ChatAdjunto } from "../types";

// Stub de CSS Modules para poder renderizar componentes TSX en pruebas unitarias con Node.
const cssProxy = new Proxy({}, { get: (_t, prop) => String(prop) });
const moduleConExtensiones = Module as unknown as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
moduleConExtensiones._extensions[".css"] = (mod) => {
  mod.exports = { __esModule: true, default: cssProxy };
};

test("normalización y detección de cuenta del equipo de Drive", () => {
  assert.equal(CUENTA_EQUIPO_DRIVE, "ladlejuan26@gmail.com");
  assert.equal(normalizarCorreoDrive("  LADLEJUAN26@gmail.com "), "ladlejuan26@gmail.com");
  assert.equal(cuentaEquipoEsperada(undefined), "ladlejuan26@gmail.com");
  assert.equal(cuentaEquipoEsperada("  custom@team.test  "), "custom@team.test");

  // Ignora mayúsculas y espacios
  assert.equal(esCuentaEquipoDrive("  LADLEJUAN26@GMAIL.COM "), true);
  assert.equal(esCuentaEquipoDrive("ladlejuan26@gmail.com"), true);
  // Si no hay correo aún, no marca falso positivo
  assert.equal(esCuentaEquipoDrive(""), true);
  assert.equal(esCuentaEquipoDrive(null), true);
  // Cuenta distinta se detecta
  assert.equal(esCuentaEquipoDrive("otra@gmail.com"), false);
  assert.equal(esCuentaEquipoDrive("otra@gmail.com", "otra@gmail.com"), true);
});

test("validación y normalización de URLs y nombres de enlaces rápidos", () => {
  assert.equal(esUrlHttpsValida("https://drive.google.com/drive/folders/abc123"), true);
  assert.equal(esUrlHttpsValida("http://drive.google.com/drive/folders/abc123"), false);
  assert.equal(esUrlHttpsValida("https://user@drive.google.com/drive/folders/abc123"), false);
  assert.equal(esUrlHttpsValida("javascript:alert(1)"), false);

  // Normaliza host y barra final conservando sensibilidad a mayúsculas del ID de Drive
  assert.equal(
    normalizarUrlEnlace("https://Drive.Google.com/drive/folders/1AbCDefG/"),
    "https://drive.google.com/drive/folders/1AbCDefG",
  );
  assert.equal(
    normalizarUrlEnlace("  https://drive.google.com/drive/folders/1AbCDefG  "),
    normalizarUrlEnlace("https://drive.google.com/drive/folders/1AbCDefG/"),
  );
  assert.notEqual(
    normalizarUrlEnlace("https://drive.google.com/drive/folders/1AbCDefG"),
    normalizarUrlEnlace("https://drive.google.com/drive/folders/1abcdefg"),
  );

  assert.equal(truncarNombreEnlace("  Carpeta corta  ", 40), "Carpeta corta");
  assert.equal(truncarNombreEnlace("A".repeat(55), 40).length, 40);
});

test("AdjuntoVista de tipo drive muestra botón visible «Abrir carpeta» sin enlaces anidados", async () => {
  const { AdjuntoVista } = await import("../../components/chat/AdjuntoVista");
  const adjunto: ChatAdjunto = {
    id: 42,
    mensaje_id: 9,
    autor_id: "user-1",
    tipo: "drive",
    nombre: "Tomas de Estudio Norte",
    mime: "application/vnd.google-apps.folder",
    tamano: 0,
    url_externa: "https://drive.google.com/drive/folders/estudio_norte_123",
    creado_en: new Date().toISOString(),
  };

  const html = renderToStaticMarkup(React.createElement(AdjuntoVista, { adjunto }));

  assert.ok(html.includes("Tomas de Estudio Norte"));
  assert.ok(html.includes("Abrir carpeta"));
  assert.ok(html.includes('href="https://drive.google.com/drive/folders/estudio_norte_123"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));

  // Sin enlace anidado: exactamente un <a> y el contenedor exterior es <div>
  const links = html.match(/<a\b/g) ?? [];
  assert.equal(links.length, 1);
  assert.ok(html.startsWith("<div "));
});

test("AdjuntoVista de tipo drive oculta enlace si la URL externa no es de Google Drive https", async () => {
  const { AdjuntoVista } = await import("../../components/chat/AdjuntoVista");
  const adjuntoMalo: ChatAdjunto = {
    id: 43,
    mensaje_id: 10,
    autor_id: "user-1",
    tipo: "drive",
    nombre: "Enlace inválido",
    mime: "application/vnd.google-apps.folder",
    tamano: 0,
    url_externa: "https://ejemplo-malo.test/carpeta",
    creado_en: new Date().toISOString(),
  };

  const html = renderToStaticMarkup(React.createElement(AdjuntoVista, { adjunto: adjuntoMalo }));
  assert.ok(html.includes("Enlace inválido"));
  assert.equal(html.includes("<a "), false);
  assert.equal(html.includes("Abrir carpeta"), false);
});

test("MenuAdjuntos renderiza botón + con atributos accesibles y estado deshabilitado", async () => {
  const { MenuAdjuntos } = await import("../../components/chat/MenuAdjuntos");
  const html = renderToStaticMarkup(
    React.createElement(MenuAdjuntos, {
      onArchivos: () => {},
      onDrive: () => {},
      onError: () => {},
      esAdmin: true,
      deshabilitado: true,
    }),
  );
  assert.ok(html.includes('aria-label="Adjuntar"'));
  assert.ok(html.includes("disabled"));
});
