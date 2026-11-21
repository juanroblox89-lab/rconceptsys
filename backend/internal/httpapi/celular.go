package httpapi

import (
	"net/http"
	"regexp"
	"strings"
)

var formatosCelular = map[string]*regexp.Regexp{
	"+57":  regexp.MustCompile(`^3[0-9]{9}$`),
	"+1":   regexp.MustCompile(`^[2-9][0-9]{2}[2-9][0-9]{6}$`),
	"+52":  regexp.MustCompile(`^[2-9][0-9]{9}$`),
	"+34":  regexp.MustCompile(`^[67][0-9]{8}$`),
	"+54":  regexp.MustCompile(`^9[1-3][0-9]{9}$`),
	"+56":  regexp.MustCompile(`^9[0-9]{8}$`),
	"+51":  regexp.MustCompile(`^9[0-9]{8}$`),
	"+593": regexp.MustCompile(`^9[0-9]{8}$`),
	"+58":  regexp.MustCompile(`^4[0-9]{9}$`),
	"+55":  regexp.MustCompile(`^[1-9][0-9]9[0-9]{8}$`),
	"+507": regexp.MustCompile(`^6[0-9]{7}$`),
	"+506": regexp.MustCompile(`^[5-8][0-9]{7}$`),
}

func normalizarCelular(indicativo, numero string) string {
	numero = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(numero))
	if f := formatosCelular[indicativo]; f != nil && f.MatchString(numero) {
		return indicativo + numero
	}
	return ""
}
func (a *API) handleCelular(w http.ResponseWriter, r *http.Request) {
	p := a.usuarioActual(r)
	ctx := r.Context()
	if r.Method == http.MethodGet {
		v, e := a.Store.ObtenerCelular(ctx, p.ID)
		if e != nil {
			ResponderError(w, 503, "celular", "No pudimos consultar tu celular.")
			return
		}
		ResponderJSON(w, 200, map[string]string{"celular": v})
		return
	}
	var req struct {
		Indicativo string `json:"indicativo"`
		Numero     string `json:"numero"`
	}
	if leerJSONCuerpo(r, 2048, &req) != nil {
		ResponderError(w, 400, "celular_invalido", "Selecciona el país y escribe un celular válido.")
		return
	}
	v := normalizarCelular(req.Indicativo, req.Numero)
	if v == "" {
		ResponderError(w, 400, "celular_invalido", "Escribe un número válido para el indicativo seleccionado.")
		return
	}
	if e := a.Store.GuardarCelular(ctx, p.ID, v); e != nil {
		ResponderError(w, 503, "celular", "No pudimos guardar tu celular.")
		return
	}
	ResponderJSON(w, 200, map[string]string{"celular": v})
}
