package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

var colorApariencia = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var archivoApariencia = regexp.MustCompile(`^[0-9a-f]{32}\.(jpe?g|png|webp|mp4|webm)$`)
var mimeApariencia = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm"}

func (a *API) handleApariencia(w http.ResponseWriter, r *http.Request) {
	p := a.usuarioActual(r)
	ctx := r.Context()
	previa, e := a.Store.ObtenerApariencia(ctx, p.ID)
	if e != nil {
		ResponderError(w, 503, "apariencia", "No pudimos consultar tu apariencia.")
		return
	}
	if r.Method == http.MethodGet {
		ResponderJSON(w, 200, previa)
		return
	}
	v := store.AparienciaInicial()
	if leerJSONCuerpo(r, 8192, &v) != nil || !aparienciaValida(v) {
		ResponderError(w, 400, "apariencia_invalida", "Revisa los valores de apariencia.")
		return
	}
	if (v.Imagen != "" && v.Imagen != previa.Imagen) || (v.Video != "" && v.Video != previa.Video) {
		ResponderError(w, 400, "fondo_invalido", "Sube el fondo antes de activarlo.")
		return
	}
	if v.Video != "" && v.Imagen == "" {
		ResponderError(w, 400, "fondo_invalido", "Un video necesita su imagen fija.")
		return
	}
	if e := a.Store.GuardarApariencia(ctx, p.ID, v); e != nil {
		ResponderError(w, 503, "apariencia", "No pudimos guardar tu apariencia.")
		return
	}
	ResponderJSON(w, 200, v)
}
func aparienciaValida(v store.Apariencia) bool {
	uno := func(s string, opciones ...string) bool {
		for _, o := range opciones {
			if o == s {
				return true
			}
		}
		return false
	}
	if !uno(v.Modo, "sistema", "claro", "oscuro") || !uno(v.Tema, "rconcept", "rconcept-dark", "glass") || !uno(v.Movimiento, "sistema", "activado", "desactivado") {
		return false
	}
	for _, c := range []string{v.Fondo, v.Texto, v.Acento} {
		if c != "" && !colorApariencia.MatchString(c) {
			return false
		}
	}
	for _, n := range []int{v.Interfaz, v.Contenido} {
		if n != 0 && (n < 12 || n > 28) {
			return false
		}
	}
	return v.Oscurecido >= 0 && v.Oscurecido <= 85
}
func (a *API) handleFondoApariencia(w http.ResponseWriter, r *http.Request) {
	p := a.usuarioActual(r)
	ctx := r.Context()
	v, e := a.Store.ObtenerApariencia(ctx, p.ID)
	if e != nil {
		ResponderError(w, 503, "apariencia", "No pudimos consultar tu apariencia.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 3*1024*1024)
	if e := r.ParseMultipartForm(3 * 1024 * 1024); e != nil {
		ResponderError(w, 400, "fondo_invalido", "El archivo o su miniatura son demasiado grandes.")
		return
	}
	defer r.MultipartForm.RemoveAll()
	leer := func(campo string) ([]byte, string, error) {
		f, _, e := r.FormFile(campo)
		if e != nil {
			return nil, "", e
		}
		defer f.Close()
		d, e := io.ReadAll(f)
		return d, http.DetectContentType(d), e
	}
	guardar := func(d []byte, mime string) (string, error) {
		var id [16]byte
		if _, e := rand.Read(id[:]); e != nil {
			return "", e
		}
		n := hex.EncodeToString(id[:]) + "." + mimeApariencia[mime]
		return n, a.Store.GuardarMedioApariencia(ctx, p.ID, n, mime, d)
	}
	d, mime, e := leer("fondo")
	if e != nil || len(d) > 2500000 || mimeApariencia[mime] == "" {
		ResponderError(w, 400, "fondo_invalido", "El fondo debe ser JPEG, PNG, WebP, MP4 o WebM y pesar hasta 2,5 MB.")
		return
	}
	imagen, mimeImagen := d, mime
	if strings.HasPrefix(mime, "video/") {
		imagen, mimeImagen, e = leer("fotograma")
		if e != nil || len(imagen) > 400000 || !strings.HasPrefix(mimeImagen, "image/") || mimeApariencia[mimeImagen] == "" {
			ResponderError(w, 400, "fondo_invalido", "No pudimos generar el primer fotograma de tu video.")
			return
		}
	}
	v.Imagen, e = guardar(imagen, mimeImagen)
	v.Video = ""
	if e == nil && strings.HasPrefix(mime, "video/") {
		v.Video, e = guardar(d, mime)
	}
	if e == nil {
		e = a.Store.GuardarApariencia(ctx, p.ID, v)
	}
	if e != nil {
		ResponderError(w, 503, "apariencia", "No pudimos guardar el fondo.")
		return
	}
	ResponderJSON(w, 200, v)
}
func (a *API) handleMedioApariencia(w http.ResponseWriter, r *http.Request) {
	p := a.usuarioActual(r)
	n := r.PathValue("archivo")
	if !archivoApariencia.MatchString(n) {
		http.NotFound(w, r)
		return
	}
	v, e := a.Store.ObtenerApariencia(r.Context(), p.ID)
	if e != nil || (v.Imagen != n && v.Video != n) {
		http.NotFound(w, r)
		return
	}
	d, e := a.Store.LeerMedioApariencia(r.Context(), p.ID, n)
	if e != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, n, time.Time{}, bytes.NewReader(d))
}
