package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
)

type transporteDrivePruebas func(*http.Request) (*http.Response, error)

func (f transporteDrivePruebas) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestF8PermisosClienteEquipoYDrive(t *testing.T) {
	rutas, _, admin, editor, cam, _ := setupF2TestEnvironment(t)
	for _, ruta := range []string{
		"POST /api/admin/clientes", "PATCH /api/admin/clientes/1", "POST /api/admin/clientes/1/foto",
		"POST /api/admin/clientes/1/drive", "PATCH /api/admin/equipo", "POST /api/admin/equipo/enlaces",
		"PATCH /api/admin/equipo/enlaces/1", "DELETE /api/admin/equipo/enlaces/1",
		"GET /api/admin/drive", "POST /api/admin/drive/conectar", "POST /api/admin/drive/desconectar",
		"POST /api/admin/drive/organizar", "POST /api/admin/drive/migrar-carpetas", "GET /api/admin/drive/picker-token",
		"GET /api/admin/drive/archivos", "POST /api/admin/tareas/1/drive-carpeta", "PATCH /api/admin/tareas/1",
	} {
		t.Run(ruta, func(t *testing.T) {
			metodo, path, _ := strings.Cut(ruta, " ")
			if res := doRequest(rutas, metodo, path, cam, map[string]any{}); res.Code != 403 {
				t.Fatalf("quería 403; llegó %d: %s", res.Code, res.Body.String())
			}
		})
	}
	res := doRequest(rutas, "POST", "/api/admin/tareas", admin, map[string]any{"tipo_id": 2, "cliente_id": 1, "asignado_a": editor, "titulo": "Solo para el asignado", "fecha_limite": "2026-12-10"})
	if res.Code != 201 {
		t.Fatal(res.Code, res.Body.String())
	}
	for _, par := range []struct {
		usuario  string
		contiene bool
	}{{admin, true}, {editor, true}, {cam, false}} {
		r := doRequest(rutas, "GET", "/api/clientes/1", par.usuario, nil)
		if r.Code != 200 || strings.Contains(r.Body.String(), "Solo para el asignado") != par.contiene {
			t.Fatalf("ficha %s: %d %s", par.usuario, r.Code, r.Body.String())
		}
	}
	if res := doRequest(rutas, "POST", "/api/yo/foto", cam, map[string]any{}); res.Code != 400 {
		t.Fatalf("ruta propia no llegó a validar la foto: %d", res.Code)
	}
}

type carpetaPrueba struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Mime    string            `json:"mimeType"`
	Parents []string          `json:"parents"`
	Props   map[string]string `json:"appProperties"`
	Own     bool              `json:"ownedByMe"`
	App     bool              `json:"isAppAuthorized"`
}

func TestF8DriveOrganizacionPickerYMigracion(t *testing.T) {
	ctx := context.Background()
	api, s := configurarTestAPI()
	const admin = "admin-f8"
	const obrero = "obrero-f8"
	for _, p := range []*store.Perfil{{ID: admin, Correo: "juan@rconcept.com", Estado: store.EstadoAprobado, EsAdmin: true}, {ID: obrero, Correo: "miembro@rconcept.com", Estado: store.EstadoAprobado}} {
		if err := s.CrearOActualizarPerfil(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	api.F5.Drive = httpapi.ConfDrive{ClientID: "client", ClientSecret: "secret", PickerKey: "picker", PickerAppID: "123", RedirectURI: "https://demo.example/api/drive/callback"}
	const mime = "application/vnd.google-apps.folder"
	folders := map[string]carpetaPrueba{
		"root":         {ID: "unidad_1", Name: "Mi unidad", Mime: mime},
		"raiz_real":    {ID: "raiz_real", Name: "Rohlfing concept", Mime: mime, Parents: []string{"unidad_1"}},
		"cliente_real": {ID: "cliente_real", Name: "ESTUDIO d'Ávila  ", Mime: mime, Parents: []string{"raiz_real"}},
	}
	if err := s.GuardarConexionDrive(ctx, &store.ConexionDrive{CarpetaRaizID: "raiz_real", CarpetaClientesID: "raiz_real", RefreshToken: "secreto-de-prueba"}); err != nil {
		t.Fatal(err)
	}
	var posts, patches int
	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			_ = r.ParseForm()
			switch r.Form.Get("grant_type") {
			case "authorization_code":
				if r.Form.Get("code") != "codigo-f8" {
					t.Fatal("código distinto")
				}
			case "refresh_token":
				if r.Form.Get("refresh_token") != "secreto-de-prueba" {
					t.Fatal("no usó el refresh guardado")
				}
			default:
				t.Fatal("grant inesperado")
			}
			return send(200, map[string]any{"access_token": "temporal-demo", "refresh_token": "secreto-de-prueba", "expires_in": 3600})
		}
		if r.URL.Host != "www.googleapis.com" || r.Header.Get("Authorization") != "Bearer temporal-demo" {
			t.Fatal("solicitud Google no prevista")
		}
		if r.URL.Path == "/drive/v3/about" {
			return send(200, map[string]any{"user": map[string]string{"emailAddress": "drive@example.test"}})
		}
		id := strings.TrimPrefix(r.URL.Path, "/drive/v3/files/")
		q := r.URL.Query()
		switch {
		case r.URL.Path == "/drive/v3/files" && r.Method == "POST":
			posts++
			var f carpetaPrueba
			if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
				t.Fatal(err)
			}
			f.ID = fmt.Sprintf("carpeta_%d", posts)
			f.Own = true
			f.App = true
			if len(f.Parents) == 1 && f.Parents[0] == "root" {
				f.Parents[0] = "unidad_1"
			}
			folders[f.ID] = f
			return send(200, f)
		case r.URL.Path == "/drive/v3/files" && r.Method == "GET":
			var out []carpetaPrueba
			for _, f := range folders {
				if len(f.Parents) != 1 {
					continue
				}
				padre := f.Parents[0]
				if padre == "unidad_1" {
					padre = "root"
				}
				query := q.Get("q")
				match := (!strings.Contains(query, "name =") && !strings.Contains(query, "appProperties has")) || strings.Contains(query, "name = '"+strings.ReplaceAll(f.Name, "'", `\'`)+"'") || (f.Props["rconcept_tarea"] != "" && strings.Contains(query, "value='"+f.Props["rconcept_tarea"]+"'"))
				if match && strings.Contains(query, "'"+padre+"' in parents") {
					out = append(out, f)
				}
			}
			return send(200, map[string]any{"files": out})
		case r.Method == "GET":
			if f, ok := folders[id]; ok {
				return send(200, f)
			}
			return send(404, nil)
		case r.Method == "PATCH":
			patches++
			f, ok := folders[id]
			if !ok || !reflect.DeepEqual(f.Parents, []string{q.Get("removeParents")}) {
				t.Fatal("origen inesperado", id)
			}
			if _, ok := folders[q.Get("addParents")]; !ok {
				t.Fatal("destino inexistente")
			}
			f.Parents = []string{q.Get("addParents")}
			folders[id] = f
			return send(200, f)
		default:
			t.Fatal("método inesperado", r.Method, r.URL)
		}
		return nil, nil
	})}
	rutas := api.Routes()
	request := func(method, path string, body any, code int) []byte {
		t.Helper()
		r := doRequest(rutas, method, path, admin, body)
		if r.Code != code {
			t.Fatalf("%s %s: %d %s", method, path, r.Code, r.Body.String())
		}
		return r.Body.Bytes()
	}
	decode := func(b []byte, out any) {
		t.Helper()
		if err := json.Unmarshal(b, out); err != nil {
			t.Fatal(err)
		}
	}
	var estado map[string]any
	decode(request("POST", "/api/admin/drive/conectar", nil, 200), &estado)
	// El retorno usa un state real iniciado por el admin, y el doble sustituye únicamente a Google.
	q := strings.Split(estado["url"].(string), "state=")
	if len(q) != 2 {
		t.Fatal(estado)
	}
	request("GET", "/api/drive/callback?code=codigo-f8&state="+strings.Split(q[1], "&")[0], nil, 302)
	conexion, err := s.ObtenerConexionDrive(ctx)
	if err != nil || conexion.CarpetaClientesID == "" || conexion.Correo != "drive@example.test" {
		t.Fatal("conexión no preparada", err)
	}
	if conexion.CarpetaRaizID != "raiz_real" || conexion.CarpetaClientesID != "raiz_real" || posts != 0 {
		t.Fatal("estructura incorrecta")
	}
	n := posts
	request("POST", "/api/admin/drive/organizar", nil, 200)
	if posts != n {
		t.Fatal("duplicó carpetas al organizar")
	}
	var c store.Cliente
	decode(request("POST", "/api/admin/clientes", map[string]string{"nombre": "Estudio d'Ávila"}, 201), &c)
	if c.DriveURL == nil || c.DriveCarpetaID == nil || *c.DriveCarpetaID != "cliente_real" || c.MaterialCarpetaID != nil || c.ProductoCarpetaID != nil || posts != 0 {
		t.Fatal("cliente sin carpetas")
	}
	request("POST", "/api/admin/drive/organizar", nil, 200)
	if posts != 0 || patches != 0 {
		t.Fatal("organizar no debe escribir en Drive cuando la carpeta existe")
	}
	decode(request("GET", "/api/admin/drive", nil, 200), &estado)
	if estado["carpeta_raiz_nombre"] != "Rohlfing concept" {
		t.Fatal(estado)
	}
	var nueva store.Cliente
	decode(request("POST", "/api/admin/clientes", map[string]string{"nombre": "Cliente sin carpeta"}, 201), &nueva)
	if posts != 1 || nueva.DriveCarpetaID == nil || nueva.MaterialCarpetaID != nil || nueva.ProductoCarpetaID != nil || folders[*nueva.DriveCarpetaID].Parents[0] != "raiz_real" {
		t.Fatal("solo se debe crear la carpeta directa del cliente")
	}
	if folders[*c.DriveCarpetaID].Parents[0] != conexion.CarpetaClientesID {
		t.Fatal("padre del cliente")
	}
	for _, tc := range []struct{ q, padre string }{{"", conexion.CarpetaRaizID}, {fmt.Sprintf("?cliente_id=%d", c.ID), *c.DriveCarpetaID}} {
		r := doRequest(rutas, "GET", "/api/admin/drive/picker-token"+tc.q, admin, nil)
		if r.Code != 200 || !strings.Contains(r.Header().Get("Cache-Control"), "no-store") || strings.Contains(r.Body.String(), "secreto-de-prueba") || strings.Contains(r.Body.String(), "refresh_token") || !strings.Contains(r.Body.String(), tc.padre) {
			t.Fatalf("picker: %d %s", r.Code, r.Body.String())
		}
	}
	altaTarea := func(cliente any) store.Tarea {
		var tarea store.Tarea
		decode(request("POST", "/api/admin/tareas", map[string]any{"tipo_id": 1, "cliente_id": cliente, "asignado_a": obrero, "forzar": true, "titulo": "Corte demo", "descripcion": "Corte\npara revisión", "fecha_limite": "2026-12-05"}, 201), &tarea)
		return tarea
	}
	tarea := altaTarea(c.ID)
	if tarea.DriveCarpetaID == nil {
		t.Fatal("tarea sin carpeta")
	}
	f := folders[*tarea.DriveCarpetaID]
	if f.Parents[0] != *c.DriveCarpetaID || !strings.HasSuffix(f.Name, " · Corte para revisión") || !strings.HasPrefix(f.Name, "2026-12-05 ") {
		t.Fatalf("nombre o padre: %+v", f)
	}
	sinCliente := altaTarea(nil)
	if sinCliente.DriveCarpetaID == nil || folders[*sinCliente.DriveCarpetaID].Parents[0] != conexion.CarpetaRaizID {
		t.Fatal("tarea sin cliente fuera de la raíz")
	}
	repetir := altaTarea(c.ID)
	if repetir.DriveCarpetaID == nil || *repetir.DriveCarpetaID == *tarea.DriveCarpetaID {
		t.Fatal("dos trabajos compartieron la carpeta")
	}
	legado, err := s.CrearTarea(ctx, &store.Tarea{Titulo: "Rodaje anterior", TipoID: 1, ClienteID: &c.ID, AsignadoA: obrero, CreadoPor: admin})
	if err != nil {
		t.Fatal(err)
	}
	ajena, err := s.CrearTarea(ctx, &store.Tarea{Titulo: "Ajena", TipoID: 1, ClienteID: &c.ID, AsignadoA: obrero, CreadoPor: admin})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		t   *store.Tarea
		id  string
		app bool
	}{{legado, "legado_1", true}, {ajena, "ajena_1", false}} {
		folders[item.id] = carpetaPrueba{ID: item.id, Name: fmt.Sprintf("T-%d %s", item.t.ID, item.t.Titulo), Mime: mime, Parents: []string{"unidad_1"}, Own: true, App: item.app}
		if _, err = s.ActualizarCarpetaDriveTarea(ctx, item.t.ID, item.id, "https://drive.google.com/drive/folders/"+item.id); err != nil {
			t.Fatal(err)
		}
	}
	ruta := "/api/admin/drive/migrar-carpetas"
	var plan struct {
		Huella      string
		Movimientos []struct{ Nombre, Destino string }
		Omitidas    []int64
	}
	n = posts
	decode(request("POST", ruta, map[string]string{}, 200), &plan)
	if len(plan.Movimientos) != 1 || !strings.Contains(plan.Movimientos[0].Nombre, "Rodaje anterior") || plan.Movimientos[0].Destino != "Rohlfing concept/ESTUDIO d'Ávila  " || !reflect.DeepEqual(plan.Omitidas, []int64{ajena.ID}) || patches != 0 || posts != n {
		t.Fatalf("plan o simulación: %+v", plan)
	}
	request("POST", ruta, map[string]string{"huella": "no-vigente"}, 409)
	if patches != 0 {
		t.Fatal("movió antes de confirmar")
	}
	request("POST", ruta, map[string]string{"huella": plan.Huella}, 200)
	if patches != 1 || folders["legado_1"].Parents[0] != *c.DriveCarpetaID || folders["ajena_1"].Parents[0] != "unidad_1" {
		t.Fatal("traslado incorrecto")
	}
	request("POST", ruta, map[string]string{"huella": plan.Huella}, 409)
	request("POST", "/api/admin/drive/desconectar", nil, 200)
	request("GET", "/api/admin/drive/picker-token", nil, 409)
	n = posts
	if sinDrive := altaTarea(c.ID); sinDrive.DriveCarpetaID != nil || posts != n {
		t.Fatal("se creó carpeta después de desconectar")
	}
}
