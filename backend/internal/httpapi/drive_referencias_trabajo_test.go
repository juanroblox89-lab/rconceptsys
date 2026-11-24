package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestF9ReferenciasDeTrabajo(t *testing.T) {
	rutas, s, admin, editor, cam, _ := setupF2TestEnvironment(t)
	const enlace = "https://drive.google.com/drive/folders/cliente_f9?resourcekey=clave"
	cliente, err := s.ActualizarCliente(context.Background(), 1, map[string]any{"drive_carpeta_id": "cliente_f9", "drive_url": enlace})
	if err != nil {
		t.Fatal(err)
	}
	datos := map[string]any{"tipo_id": 2, "asignado_a": editor, "cliente_id": cliente.ID, "titulo": "Corte F9", "fecha_limite": "2026-12-05"}
	peticion := func(method, ruta, usuario string, body any, status int) *store.Tarea {
		t.Helper()
		res := doRequest(rutas, method, ruta, usuario, body)
		if res.Code != status {
			t.Fatalf("%s %s: %d, esperaba %d: %s", method, ruta, res.Code, status, res.Body.String())
		}
		if status != 200 && status != 201 {
			return nil
		}
		var tarea store.Tarea
		if err := json.Unmarshal(res.Body.Bytes(), &tarea); err != nil {
			t.Fatal(err)
		}
		return &tarea
	}
	const alta = "/api/admin/tareas"
	creada := peticion("POST", alta, admin, datos, 201)
	automatica := store.ReferenciaDriveTrabajo{ID: "cliente_f9", Nombre: "Carpeta de " + cliente.Nombre, URL: enlace, Tipo: "carpeta"}
	if len(creada.DriveReferencias) != 1 || creada.DriveReferencias[0] != automatica {
		t.Fatalf("referencia automática: %+v", creada.DriveReferencias)
	}
	ruta := fmt.Sprintf("%s/%d", alta, creada.ID)
	refs := []store.ReferenciaDriveTrabajo{automatica}
	for i := 1; i <= 3; i++ {
		refs = append(refs, store.ReferenciaDriveTrabajo{ID: fmt.Sprintf("archivo_%d", i), Nombre: "Guía", URL: fmt.Sprintf("https://docs.google.com/document/d/archivo_%d/edit", i), Tipo: "archivo"})
	}
	datos["drive_referencias"] = refs
	peticion("POST", alta, admin, datos, 400)
	peticion("PATCH", ruta, admin, map[string]any{"drive_referencias": refs}, 400)
	peticion("PATCH", ruta, editor, map[string]any{"drive_referencias": refs[:3]}, 403)
	for _, url := range []string{"http://drive.google.com/open?id=prueba", "https://drive.google.com.ejemplo.test/abc", "https://drive.google.com@ejemplo.test/abc", "javascript:alert(1)"} {
		invalida := refs[1]
		invalida.URL = url
		peticion("PATCH", ruta, admin, map[string]any{"drive_referencias": []store.ReferenciaDriveTrabajo{invalida}}, 400)
	}
	peticion("PATCH", ruta, admin, map[string]any{"drive_referencias": nil}, 400)
	peticion("PATCH", ruta, admin, map[string]any{"drive_referencias": refs[:3]}, 200)
	if guardada := peticion("GET", ruta, admin, nil, 200); len(guardada.DriveReferencias) != 3 || guardada.DriveReferencias[2] != refs[2] {
		t.Fatalf("no se guardaron las tres referencias: %+v", guardada.DriveReferencias)
	}
	for usuario, visible := range map[string]bool{editor: true, cam: false} {
		res := doRequest(rutas, "GET", "/api/tareas", usuario, nil)
		if res.Code != 200 || strings.Contains(res.Body.String(), refs[2].URL) != visible {
			t.Fatalf("visibilidad de referencias de %s: %d: %s", usuario, res.Code, res.Body.String())
		}
	}
	vacia := []store.ReferenciaDriveTrabajo{}
	if editada := peticion("PATCH", ruta, admin, map[string]any{"drive_referencias": vacia}, 200); editada.DriveReferencias == nil || len(editada.DriveReferencias) != 0 {
		t.Fatal("no se conservó la eliminación explícita")
	}
	datos["drive_referencias"] = refs[1:2]
	if reemplazada := peticion("POST", alta, admin, datos, 201); len(reemplazada.DriveReferencias) != 1 || reemplazada.DriveReferencias[0] != refs[1] {
		t.Fatal("no se respetó la referencia personalizada")
	}
}
