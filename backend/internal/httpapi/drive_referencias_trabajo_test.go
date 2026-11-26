package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/httpapi"
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

func TestResolverRutaDriveYCacheSinExponerTokens(t *testing.T) {
	ctx := context.Background()
	api, s := configurarTestAPI()
	const admin = "admin-ruta"
	const editor = "editor-ruta"
	for _, p := range []*store.Perfil{
		{ID: admin, Correo: "juan@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true},
		{ID: editor, Correo: "editor@rconcept.com", Nombre: "Editor", Estado: store.EstadoAprobado, EsAdmin: false},
	} {
		if err := s.CrearOActualizarPerfil(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.CrearTipoTrabajo(ctx, &store.TipoTrabajo{Clave: "edicion_test", Nombre: "Edición", Precio: 50000, Unidad: "trabajo", Activo: true}); err != nil {
		t.Fatal(err)
	}
	cliente, err := s.CrearCliente(ctx, "La Sixtina")
	if err != nil {
		t.Fatal(err)
	}
	api.F5.Drive = httpapi.ConfDrive{ClientID: "client", ClientSecret: "secret", PickerKey: "picker", PickerAppID: "123"}
	if err := s.GuardarConexionDrive(ctx, &store.ConexionDrive{
		Correo:            "equipo@rconcept.com",
		CarpetaRaizID:     "rc_root",
		CarpetaClientesID: "rc_clientes",
		RefreshToken:      "secreto-drive-no-exponer",
	}); err != nil {
		t.Fatal(err)
	}

	const mimeFolder = "application/vnd.google-apps.folder"
	nodos := map[string]carpetaPrueba{
		"root":       {ID: "my_drive_id", Name: "My Drive", Mime: mimeFolder},
		"rc_root":    {ID: "rc_root", Name: "Rohlfing concept", Mime: mimeFolder, Parents: []string{"my_drive_id"}},
		"rc_clients": {ID: "rc_clients", Name: "Clientes", Mime: mimeFolder, Parents: []string{"rc_root"}},
		"sixtina":      {ID: "sixtina", Name: "La Sixtina", Mime: mimeFolder, Parents: []string{"rc_clients"}},
		"entrega_clip": {ID: "entrega_clip", Name: "Clips campaña marzo", Mime: mimeFolder, Parents: []string{"sixtina"}},
		"ciclo_a":    {ID: "ciclo_a", Name: "Ciclo A", Mime: mimeFolder, Parents: []string{"ciclo_b"}},
		"ciclo_b":    {ID: "ciclo_b", Name: "Ciclo B", Mime: mimeFolder, Parents: []string{"ciclo_a"}},
	}
	for i := 1; i <= 15; i++ {
		padres := []string{"my_drive_id"}
		if i > 1 {
			padres = []string{fmt.Sprintf("prof_%02d", i-1)}
		}
		id := fmt.Sprintf("prof_%02d", i)
		nodos[id] = carpetaPrueba{ID: id, Name: fmt.Sprintf("Nivel %02d", i), Mime: mimeFolder, Parents: padres}
	}

	var llamadasFiles int
	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			return send(200, map[string]any{"access_token": "tok-drive-super-secreto", "expires_in": 3600})
		}
		if r.URL.Host == "www.googleapis.com" && strings.HasPrefix(r.URL.Path, "/drive/v3/files/") {
			llamadasFiles++
			id := strings.TrimPrefix(r.URL.Path, "/drive/v3/files/")
			if nodo, ok := nodos[id]; ok {
				return send(200, nodo)
			}
			return send(404, map[string]string{"error": "not found"})
		}
		return send(404, nil)
	})}

	rutas := api.Routes()

	// Permisos y validación de GET /api/admin/drive/referencia
	if res := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=entrega_clip", "", nil); res.Code != 401 {
		t.Fatalf("sin auth esperaba 401, obtuvo %d", res.Code)
	}
	if res := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=entrega_clip", editor, nil); res.Code != 403 {
		t.Fatalf("no-admin esperaba 403, obtuvo %d", res.Code)
	}
	if res := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=bad*id", admin, nil); res.Code != 400 {
		t.Fatalf("id inválido esperaba 400, obtuvo %d", res.Code)
	}

	res := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=entrega_clip", admin, nil)
	if res.Code != 200 {
		t.Fatalf("esperaba 200, obtuvo %d: %s", res.Code, res.Body.String())
	}
	bodyStr := res.Body.String()
	if strings.Contains(bodyStr, "tok-drive-super-secreto") || strings.Contains(bodyStr, "secreto-drive-no-exponer") {
		t.Fatalf("el endpoint nunca debe exponer tokens: %s", bodyStr)
	}
	var ref store.ReferenciaDriveTrabajo
	if err := json.Unmarshal(res.Body.Bytes(), &ref); err != nil {
		t.Fatal(err)
	}
	if ref.Nombre != "Clips campaña marzo" || ref.Ruta != "Mi unidad / Rohlfing concept / Clientes / La Sixtina" || ref.Tipo != "carpeta" {
		t.Fatalf("referencia resuelta inesperada: %+v", ref)
	}

	// Segunda consulta debe usar caché corta sin golpear /drive/v3/files nuevamente
	antes := llamadasFiles
	resCache := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=entrega_clip", admin, nil)
	if resCache.Code != 200 || llamadasFiles != antes {
		t.Fatalf("se esperaba uso de caché (antes=%d, despues=%d, status=%d)", antes, llamadasFiles, resCache.Code)
	}

	// Protección contra ciclos y tope de profundidad (12 padres)
	resCiclo := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=ciclo_a", admin, nil)
	if resCiclo.Code != 200 {
		t.Fatalf("ciclo debe resolver sin colgarse: %d %s", resCiclo.Code, resCiclo.Body.String())
	}
	var refCiclo store.ReferenciaDriveTrabajo
	_ = json.Unmarshal(resCiclo.Body.Bytes(), &refCiclo)
	if refCiclo.Nombre != "Ciclo A" || refCiclo.Ruta != "Ciclo B" {
		t.Fatalf("ciclo inesperado: %+v", refCiclo)
	}

	resProf := doRequest(rutas, "GET", "/api/admin/drive/referencia?id=prof_15", admin, nil)
	if resProf.Code != 200 {
		t.Fatalf("profundidad tope falló: %d", resProf.Code)
	}
	var refProf store.ReferenciaDriveTrabajo
	_ = json.Unmarshal(resProf.Body.Bytes(), &refProf)
	if partes := strings.Split(refProf.Ruta, " / "); len(partes) != 12 {
		t.Fatalf("tope de profundidad debe ser 12 padres, obtuvo %d (%q)", len(partes), refProf.Ruta)
	}

	// Persistencia en POST /api/admin/tareas aunque venga nombre genérico y sin ruta
	creadaRes := doRequest(rutas, "POST", "/api/admin/tareas", admin, map[string]any{
		"tipo_id": 1, "cliente_id": cliente.ID, "asignado_a": editor, "forzar": true, "titulo": "Trabajo con ruta", "fecha_limite": "2026-12-05",
		"drive_referencias": []map[string]any{
			{"id": "entrega_clip", "nombre": "Carpeta del trabajo", "url": "https://drive.google.com/drive/folders/entrega_clip", "tipo": "carpeta"},
		},
	})
	if creadaRes.Code != 201 {
		t.Fatalf("POST tarea: %d %s", creadaRes.Code, creadaRes.Body.String())
	}
	var creada store.Tarea
	_ = json.Unmarshal(creadaRes.Body.Bytes(), &creada)
	if len(creada.DriveReferencias) != 1 || creada.DriveReferencias[0].Nombre != "Clips campaña marzo" || creada.DriveReferencias[0].Ruta != "Mi unidad / Rohlfing concept / Clientes / La Sixtina" {
		t.Fatalf("no persistió nombre real y ruta al guardar: %+v", creada.DriveReferencias)
	}

	// Trabajo legado en store con drive_referencias nil y solo drive_carpeta_id se enriquece en GET sin romper nil
	legada, err := s.CrearTarea(ctx, &store.Tarea{
		TipoID: 1, ClienteID: &cliente.ID, AsignadoA: editor, CreadoPor: admin, Titulo: "Legado", DriveCarpetaID: strPtr("sixtina"),
	})
	if err != nil {
		t.Fatal(err)
	}
	resLegada := doRequest(rutas, "GET", fmt.Sprintf("/api/tareas/%d/detalle", legada.ID), editor, nil)
	if resLegada.Code != 200 {
		t.Fatalf("detalle legado: %d", resLegada.Code)
	}
	var legadaOut store.Tarea
	_ = json.Unmarshal(resLegada.Body.Bytes(), &legadaOut)
	if legadaOut.DriveReferencias != nil || legadaOut.DriveCarpetaNombre == nil || *legadaOut.DriveCarpetaNombre != "La Sixtina" || legadaOut.DriveCarpetaRuta == nil || *legadaOut.DriveCarpetaRuta != "Mi unidad / Rohlfing concept / Clientes" {
		t.Fatalf("legada sin enriquecer: %+v", legadaOut)
	}

	// Guardar referencia de cliente persiste ruta en DriveReferencias
	patchCli := doRequest(rutas, "PATCH", fmt.Sprintf("/api/admin/clientes/%d", cliente.ID), admin, map[string]any{
		"drive_referencias": []string{"entrega_clip"},
	})
	if patchCli.Code != 200 {
		t.Fatalf("PATCH cliente: %d %s", patchCli.Code, patchCli.Body.String())
	}
	var cliOut store.Cliente
	_ = json.Unmarshal(patchCli.Body.Bytes(), &cliOut)
	if len(cliOut.DriveReferencias) != 1 || cliOut.DriveReferencias[0].Ruta != "Mi unidad / Rohlfing concept / Clientes / La Sixtina" {
		t.Fatalf("cliente no persistió ruta: %+v", cliOut.DriveReferencias)
	}

	// Desconectar Drive limpia caché y fallback en GET funciona limpio
	doRequest(rutas, "POST", "/api/admin/drive/desconectar", admin, nil)
	resDesconectado := doRequest(rutas, "GET", fmt.Sprintf("/api/tareas/%d/detalle", legada.ID), editor, nil)
	if resDesconectado.Code != 200 {
		t.Fatalf("detalle sin Drive debe seguir devolviendo 200: %d", resDesconectado.Code)
	}
}

func strPtr(s string) *string { return &s }
