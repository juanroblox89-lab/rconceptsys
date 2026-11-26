import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Boton } from "../../components/ui/Boton";
import { nombreReferenciaVisible, referenciasDelTrabajo } from "../referencias-trabajo";
import type { Tarea } from "../types";

const cssProxy = new Proxy({}, { get: (_t, prop) => String(prop) });
const moduleConExtensiones = Module as unknown as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
moduleConExtensiones._extensions[".css"] = (mod) => {
  mod.exports = { __esModule: true, default: cssProxy };
};

test("Boton expone variantes guardar (verde) y peligro (rojo)", () => {
  const htmlGuardar = renderToStaticMarkup(React.createElement(Boton, { variante: "guardar" }, "Guardar cambios"));
  const htmlPeligro = renderToStaticMarkup(React.createElement(Boton, { variante: "peligro" }, "Quitar"));
  assert.ok(htmlGuardar.includes("rc-btn--guardar"));
  assert.ok(htmlGuardar.includes("Guardar cambios"));
  assert.ok(htmlPeligro.includes("rc-btn--peligro"));
  assert.ok(htmlPeligro.includes("Quitar"));
});

test("ReferenciasDriveTrabajo y SelectorCarpetaTrabajo muestran ruta arriba y nombre real debajo con Quitar rojo", async () => {
  const { ReferenciasDriveTrabajo } = await import("../../components/ui/ReferenciasDriveTrabajo");
  const { SelectorCarpetaTrabajo } = await import("../../components/SelectorCarpetaTrabajo");
  const { PickerDriveCliente } = await import("../../components/PickerDriveCliente");

  const tareaConRuta: Tarea = {
    id: 1,
    tipo_id: 1,
    titulo: "Reel",
    asignado_a: "u1",
    creado_por: "a1",
    estado: "pendiente",
    creada_en: "2026-11-24T12:00:00Z",
    drive_referencias: [
      {
        id: "carp123",
        nombre: "La Sixtina",
        url: "https://drive.google.com/drive/folders/carp123",
        tipo: "carpeta",
        ruta: "Mi unidad / Rohlfing concept / Clientes",
      },
    ],
  };

  const htmlVista = renderToStaticMarkup(React.createElement(ReferenciasDriveTrabajo, { tarea: tareaConRuta }));
  const idxRuta = htmlVista.indexOf("Mi unidad / Rohlfing concept / Clientes");
  const idxNombre = htmlVista.indexOf("La Sixtina");
  assert.ok(idxRuta > 0 && idxNombre > idxRuta, "La ruta debe mostrarse arriba del nombre real");
  assert.ok(htmlVista.includes('title="Mi unidad / Rohlfing concept / Clientes"'));
  assert.ok(htmlVista.includes('title="La Sixtina"'));

  const htmlSelector = renderToStaticMarkup(
    React.createElement(SelectorCarpetaTrabajo, {
      valor: tareaConRuta.drive_referencias ?? [],
      onChange: () => {},
      deshabilitado: false,
    }),
  );
  assert.ok(htmlSelector.includes("Mi unidad / Rohlfing concept / Clientes"));
  assert.ok(htmlSelector.includes("rc-btn--peligro"));

  const htmlCliente = renderToStaticMarkup(
    React.createElement(PickerDriveCliente, {
      valor: [
        {
          id: "carp123",
          nombre: "Material crudo",
          url: "https://drive.google.com/drive/folders/carp123",
          ruta: "Mi unidad / Rohlfing concept / Clientes / La Sixtina",
        },
      ],
      onChange: () => {},
      disabled: false,
    }),
  );
  const cIdxRuta = htmlCliente.indexOf("Mi unidad / Rohlfing concept / Clientes / La Sixtina");
  const cIdxNombre = htmlCliente.indexOf("Material crudo");
  assert.ok(cIdxRuta > 0 && cIdxNombre > cIdxRuta);
  assert.ok(htmlCliente.includes("rc-btn--peligro"));
});

test("referenciasDelTrabajo usa nombre real resuelto en trabajos legados y fallback limpio", () => {
  const legadaResuelta: Tarea = {
    id: 2,
    tipo_id: 1,
    titulo: "Legada",
    asignado_a: "u1",
    creado_por: "a1",
    estado: "pendiente",
    creada_en: "2026-11-24T12:00:00Z",
    drive_carpeta_id: "sixtina_id",
    drive_carpeta_nombre: "La Sixtina",
    drive_carpeta_ruta: "Mi unidad / Rohlfing concept / Clientes",
  };
  const refsResueltas = referenciasDelTrabajo(legadaResuelta);
  assert.equal(refsResueltas.length, 1);
  assert.equal(refsResueltas[0].nombre, "La Sixtina");
  assert.equal(refsResueltas[0].ruta, "Mi unidad / Rohlfing concept / Clientes");

  const legadaSinDrive: Tarea = {
    id: 3,
    tipo_id: 1,
    titulo: "Legada sin Drive",
    asignado_a: "u1",
    creado_por: "a1",
    estado: "pendiente",
    creada_en: "2026-11-24T12:00:00Z",
    drive_carpeta_id: "legado_id",
  };
  assert.equal(referenciasDelTrabajo(legadaSinDrive)[0].nombre, "Carpeta del trabajo");
  assert.equal(nombreReferenciaVisible({ nombre: "", tipo: "carpeta" }), "Carpeta de Drive");
});

test("AdjuntosAsignacion elimina por completo el botón y código de Abrir fuera", async () => {
  const fuente = readFileSync("components/AdjuntosAsignacion.tsx", "utf8");
  assert.equal(fuente.includes("Abrir fuera"), false);
  assert.equal(fuente.includes("fuera de RConcept"), false);
  assert.equal(fuente.includes("EnlaceExterno"), false);

  const { AdjuntosRechazoVista } = await import("../../components/AdjuntosAsignacion");
  const html = renderToStaticMarkup(
    React.createElement(AdjuntosRechazoVista, {
      tarea: 10,
      items: [{ id: "a1", tipo: "imagen", nombre: "referencia.png", mime: "image/png", tamano: 1024 }],
    }),
  );
  assert.equal(html.includes("Abrir fuera"), false);
  assert.ok(html.includes("Descargar"));
});

test("RoadmapHistorial construye flujo cronológico completo con flechas, notas y motivos", async () => {
  const { RoadmapHistorial, construirPasosRoadmap } = await import("../../components/RoadmapHistorial");
  const tarea: Tarea = {
    id: 55,
    tipo_id: 1,
    titulo: "Reel campaña",
    asignado_a: "ed1",
    creado_por: "adm1",
    creador: { id: "adm1", correo: "adm@test", nombre: "Juan Admin", foto_path: null, estado: "aprobado", es_admin: true, creado_en: "2026-11-01T10:00:00Z" },
    estado: "aceptada",
    precio_congelado: 90000,
    creada_en: "2026-11-20T10:00:00Z",
    historial: [
      {
        id: 1,
        tarea_id: 55,
        actor_nombre: "Lina Editor",
        evento: "entrega_enviada",
        detalle: "Entrega enviada por Drive",
        metodo_entrega: "drive",
        enlace_medios: "https://drive.google.com/drive/folders/ent1",
        entrega_nombre: "Corte v1",
        entrega_tipo: "carpeta",
        nota: "Primera versión lista.",
        creado_en: "2026-11-21T14:00:00Z",
      },
      {
        id: 2,
        tarea_id: 55,
        actor_nombre: "Juan Admin",
        evento: "entrega_rechazada",
        detalle: "Entrega devuelta con observaciones",
        motivo: "Subir música en los últimos 5 segundos.",
        creado_en: "2026-11-22T10:00:00Z",
      },
      {
        id: 3,
        tarea_id: 55,
        actor_nombre: "Lina Editor",
        evento: "entrega_enviada",
        detalle: "Entrega enviada por WhatsApp",
        metodo_entrega: "whatsapp",
        nota: "Audio corregido.",
        creado_en: "2026-11-23T11:00:00Z",
      },
      {
        id: 4,
        tarea_id: 55,
        actor_nombre: "Juan Admin",
        evento: "entrega_aceptada",
        detalle: "Entrega aprobada",
        creado_en: "2026-11-24T16:00:00Z",
      },
    ],
  };

  const pasos = construirPasosRoadmap(tarea);
  assert.deepEqual(
    pasos.map((p) => p.titulo),
    ["Asignado", "Entrega registrada", "Devuelto", "Nueva entrega", "Aprobado"],
  );

  const html = renderToStaticMarkup(React.createElement(RoadmapHistorial, { tarea }));
  assert.ok(html.includes("Asignado"));
  assert.ok(html.includes("Entrega registrada"));
  assert.ok(html.includes("Devuelto"));
  assert.ok(html.includes("Nueva entrega"));
  assert.ok(html.includes("Aprobado"));
  assert.ok(html.includes("Primera versión lista."));
  assert.ok(html.includes("Subir música en los últimos 5 segundos."));
  assert.ok(html.includes("Entregado por WhatsApp"));
  assert.ok(html.includes("Audio corregido."));
  assert.ok(html.includes("90.000"));
  assert.ok(html.includes("roadmapConector"));
  assert.ok(html.includes("roadmapFlechaDer"));
  assert.ok(html.includes("roadmapFlechaAbajo"));

  const reabierta: Tarea = { ...tarea, estado: "pendiente", precio_congelado: null, historial: [
    ...(tarea.historial ?? []),
    { id: 5, tarea_id: tarea.id, evento: "pedido_de_nuevo", detalle: "Se pidió rehacer", motivo: "Cambiar el cierre", creado_en: "2026-11-25T16:00:00Z" },
  ] };
  assert.equal(construirPasosRoadmap(reabierta).at(-1)?.titulo, "Se pidió rehacer");
  const htmlReapertura = renderToStaticMarkup(React.createElement(RoadmapHistorial, { tarea: reabierta }));
  assert.match(htmlReapertura, /Cambiar el cierre/);
  assert.match(htmlReapertura, /drive\.google\.com\/drive\/folders\/ent1/);
});
