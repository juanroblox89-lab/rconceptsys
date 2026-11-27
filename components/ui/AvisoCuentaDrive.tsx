"use client";

import { FolderOpen } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { cuentaEquipoEsperada } from "@/lib/drive-equipo";

export function AvisoCuentaDrive({
  cuenta,
  abriendo = false,
  onCancelar,
  onContinuar,
  textoBoton = "Abrir Google Drive",
}: {
  cuenta?: string | null;
  abriendo?: boolean;
  onCancelar: () => void;
  onContinuar: () => void;
  textoBoton?: string;
}) {
  const correo = cuentaEquipoEsperada(cuenta);
  return (
    <div
      role="region"
      aria-label="Aviso de cuenta de Google Drive"
      style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-8)" }}
    >
      <Aviso
        tipo="advertencia"
        titulo={<>Usa la cuenta {correo}</>}
        texto={
          <>
            Antes de continuar, asegúrate de iniciar sesión con <strong>{correo}</strong> en Google Drive para ver y seleccionar las carpetas del equipo.
          </>
        }
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--rc-esp-8)", justifyContent: "flex-end" }}>
        <Boton variante="secundario" tamano="sm" onClick={onCancelar} disabled={abriendo}>
          Cancelar
        </Boton>
        <Boton variante="primario" tamano="sm" cargando={abriendo} onClick={onContinuar}>
          <FolderOpen size={14} aria-hidden="true" />
          {textoBoton}
        </Boton>
      </div>
    </div>
  );
}
