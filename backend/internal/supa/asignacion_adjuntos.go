package supa

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"rconceptsys/backend/internal/store"
)

const tablaAdjuntos = "asignacion_adjuntos"

func (s *SupabaseStore) ReservarAdjunto(ctx context.Context, a *store.AdjuntoAsignacion) (*store.AdjuntoAsignacion, error) {
	var filas []*store.AdjuntoAsignacion
	err := s.client.RPC(ctx, "rc_reservar_adjunto", map[string]any{"p": a}, &filas)
	if err == nil && len(filas) == 0 {
		return nil, store.ErrCupoAdjuntos
	}
	return primeraFilaAdjunto(filas, err)
}

func primeraFilaAdjunto(filas []*store.AdjuntoAsignacion, err error) (*store.AdjuntoAsignacion, error) {
	if err != nil {
		return nil, err
	}
	if len(filas) == 0 {
		return nil, store.ErrNotFound
	}
	return filas[0], nil
}

func filtrosAdjunto(tarea int64, id string) url.Values {
	return url.Values{"tarea_id": {"eq." + strconv.FormatInt(tarea, 10)}, "id": {"eq." + id}}
}

func (s *SupabaseStore) ListarAdjuntos(ctx context.Context, tarea int64) ([]*store.AdjuntoAsignacion, error) {
	return s.ListarAdjuntosPorOrigen(ctx, tarea, "asignacion", nil)
}

func (s *SupabaseStore) ListarAdjuntosPorOrigen(ctx context.Context, tarea int64, origen string, historialID *int64) ([]*store.AdjuntoAsignacion, error) {
	if origen == "" {
		origen = "asignacion"
	}
	q := url.Values{
		"tarea_id":       {"eq." + strconv.FormatInt(tarea, 10)},
		"origen":         {"eq." + origen},
		"estado_archivo": {"eq.listo"},
		"order":          {"cupo"},
	}
	if historialID != nil {
		q.Set("historial_id", "eq."+strconv.FormatInt(*historialID, 10))
	}
	filas := make([]*store.AdjuntoAsignacion, 0)
	err := s.client.REST(ctx, http.MethodGet, tablaAdjuntos, q, nil, "", &filas)
	return filas, err
}

func (s *SupabaseStore) ObtenerAdjunto(ctx context.Context, tarea int64, id string) (*store.AdjuntoAsignacion, error) {
	var filas []*store.AdjuntoAsignacion
	err := s.client.REST(ctx, http.MethodGet, tablaAdjuntos, filtrosAdjunto(tarea, id), nil, "", &filas)
	return primeraFilaAdjunto(filas, err)
}

func (s *SupabaseStore) CambiarAdjunto(ctx context.Context, a *store.AdjuntoAsignacion, f store.FiltroAdjunto) (*store.AdjuntoAsignacion, error) {
	q := filtrosAdjunto(a.TareaID, a.ID)
	if f.Archivo != "" {
		q.Set("estado_archivo", "eq."+f.Archivo)
	}
	if f.Resumen != "" {
		q.Set("estado_resumen", "eq."+f.Resumen)
	}
	if f.Intento != "" {
		q.Set("resumen_intento", "eq."+f.Intento)
	}
	if !f.AntesDe.IsZero() {
		q.Set("actualizado_en", "lt."+f.AntesDe.UTC().Format(time.RFC3339Nano))
	}
	campos := map[string]any{"estado_archivo": a.EstadoArchivo, "resumir": a.Resumir, "estado_resumen": a.EstadoResumen,
		"resumen": a.Resumen, "transcripcion": a.Transcripcion, "error_resumen": a.ErrorResumen, "proveedor": a.Proveedor, "resumen_intento": a.ResumenIntento,
		"resumen_hasta": a.ResumenHasta, "actualizado_en": time.Now().UTC()}
	var filas []*store.AdjuntoAsignacion
	err := s.client.REST(ctx, http.MethodPatch, tablaAdjuntos, q, campos, "return=representation", &filas)
	return primeraFilaAdjunto(filas, err)
}

func (s *SupabaseStore) BorrarRegistroAdjunto(ctx context.Context, tarea int64, id string) error {
	q := filtrosAdjunto(tarea, id)
	q.Set("estado_archivo", "eq.borrando")
	return s.client.REST(ctx, http.MethodDelete, tablaAdjuntos, q, nil, "", nil)
}

func (s *SupabaseStore) AdjuntosIncompletos(ctx context.Context, antes time.Time) ([]*store.AdjuntoAsignacion, error) {
	q := url.Values{"estado_archivo": {"neq.listo"}, "actualizado_en": {"lt." + antes.UTC().Format(time.RFC3339Nano)}, "order": {"actualizado_en"}, "limit": {"5"}}
	var filas []*store.AdjuntoAsignacion
	err := s.client.REST(ctx, http.MethodGet, tablaAdjuntos, q, nil, "", &filas)
	return filas, err
}

func (s *SupabaseStore) ReclamarResumenAdjunto(ctx context.Context, intento string) (*store.AdjuntoAsignacion, error) {
	var filas []*store.AdjuntoAsignacion
	err := s.client.RPC(ctx, "rc_reclamar_resumen_adjunto", map[string]string{"p_intento": intento}, &filas)
	return primeraFilaAdjunto(filas, err)
}

func (s *SupabaseStore) ReclamarResumenAdjuntoPorID(ctx context.Context, tarea int64, id, intento string) (*store.AdjuntoAsignacion, bool, error) {
	ahora := time.Now().UTC()
	vence := ahora.Add(3 * time.Minute)
	campos := map[string]any{
		"estado_resumen":  "procesando",
		"resumen_intento": intento,
		"resumen_hasta":   vence,
		"actualizado_en":  ahora,
	}
	q := filtrosAdjunto(tarea, id)
	q.Set("estado_archivo", "eq.listo")
	q.Set("resumir", "eq.true")
	q.Set("estado_resumen", "eq.pendiente")
	var filas []*store.AdjuntoAsignacion
	if err := s.client.REST(ctx, http.MethodPatch, tablaAdjuntos, q, campos, "return=representation", &filas); err != nil {
		return nil, false, err
	}
	if len(filas) > 0 {
		return filas[0], true, nil
	}
	actual, err := s.ObtenerAdjunto(ctx, tarea, id)
	if err != nil {
		return nil, false, err
	}
	if actual.EstadoArchivo != "listo" {
		return nil, false, store.ErrNotFound
	}
	if actual.Resumir && actual.EstadoResumen == "procesando" && (actual.ResumenHasta == nil || !actual.ResumenHasta.After(ahora)) && actual.ResumenIntento != nil {
		qExp := filtrosAdjunto(tarea, id)
		qExp.Set("estado_archivo", "eq.listo")
		qExp.Set("resumir", "eq.true")
		qExp.Set("estado_resumen", "eq.procesando")
		qExp.Set("resumen_intento", "eq."+*actual.ResumenIntento)
		var filasExp []*store.AdjuntoAsignacion
		if err := s.client.REST(ctx, http.MethodPatch, tablaAdjuntos, qExp, campos, "return=representation", &filasExp); err != nil {
			return nil, false, err
		}
		if len(filasExp) > 0 {
			return filasExp[0], true, nil
		}
		actual, err = s.ObtenerAdjunto(ctx, tarea, id)
		if err != nil {
			return nil, false, err
		}
	}
	return actual, false, nil
}

func (s *SupabaseStore) GuardarObjetoAdjunto(ctx context.Context, ruta, mime string, datos []byte, reemplazar bool) error {
	c := s.client
	u := c.baseURL + "/storage/v1/object/" + store.BucketAdjuntosAsignacion + "/" + ruta
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(datos))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mime)
	req.Header.Set("Cache-Control", "private, no-store, max-age=0")
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("apikey", c.serviceKey)
	if reemplazar {
		req.Header.Set("x-upsert", "true")
	}
	// El objeto final puede ser de 50 MiB; el contexto pone el límite de la operación.
	cliente := *c.http
	cliente.Timeout = 45 * time.Second
	res, err := cliente.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("storage subir: HTTP %d", res.StatusCode)
	}
	return nil
}

func (s *SupabaseStore) LeerObjetoAdjunto(ctx context.Context, ruta string, maximo int) ([]byte, error) {
	c := s.client
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/storage/v1/object/authenticated/"+store.BucketAdjuntosAsignacion+"/"+ruta, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("apikey", c.serviceKey)
	cliente := *c.http
	cliente.Timeout = 20 * time.Second
	res, err := cliente.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return nil, store.ErrNotFound
	}
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("storage leer: HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, int64(maximo)+1))
	if len(b) > maximo {
		return nil, errors.New("objeto fuera de límite")
	}
	return b, err
}

func (s *SupabaseStore) BorrarObjetosAdjunto(ctx context.Context, rutas []string) error {
	c := s.client
	return c.do(ctx, http.MethodDelete, c.baseURL+"/storage/v1/object/"+store.BucketAdjuntosAsignacion, map[string]any{"prefixes": rutas}, "", nil)
}

func (s *SupabaseStore) FirmarObjetoAdjunto(ctx context.Context, ruta, descarga string, segundos int) (string, error) {
	c := s.client
	clave := store.BucketAdjuntosAsignacion + "/" + ruta
	var res struct {
		Firmada string `json:"signedURL"`
	}
	err := c.do(ctx, http.MethodPost, c.baseURL+"/storage/v1/object/sign/"+clave, map[string]int{"expiresIn": segundos}, "", &res)
	if err != nil {
		return "", err
	}
	// Storage devuelve /object/sign/... relativo al servicio, no al host.
	u, err := url.Parse(res.Firmada)
	if err != nil || u.IsAbs() || u.Host != "" || u.Path != "/object/sign/"+clave || u.Query().Get("token") == "" {
		return "", errors.New("firma inválida de Storage")
	}
	if descarga != "" {
		q := u.Query()
		q.Set("download", descarga)
		u.RawQuery = q.Encode()
	}
	return c.baseURL + "/storage/v1" + u.String(), nil
}
