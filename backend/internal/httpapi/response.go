package httpapi

import (
	"encoding/json"
	"net/http"
)

type ErrorDetalle struct {
	Codigo  string `json:"codigo"`
	Mensaje string `json:"mensaje"`
}

type ErrorResponse struct {
	Error ErrorDetalle `json:"error"`
}

func ResponderJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

func ResponderError(w http.ResponseWriter, status int, codigo string, mensaje string) {
	ResponderJSON(w, status, ErrorResponse{
		Error: ErrorDetalle{
			Codigo:  codigo,
			Mensaje: mensaje,
		},
	})
}
