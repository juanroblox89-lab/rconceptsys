package store

import (
	"context"
	"testing"
	"time"
)

func TestRetencionProtegeContenidoYExigeQuinceDias(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStore()
	ahora := time.Now().UTC()
	antiguo := ahora.Add(-16 * 24 * time.Hour)
	nuevo := ahora.Add(-14 * 24 * time.Hour)
	drive := "https://drive.google.com/drive/folders/qa-sintetico"
	ruta := "actor/123-voz.wav"
	for i, caso := range []struct {
		tipo      string
		fecha     time.Time
		conservar bool
		url       *string
		purga     bool
	}{
		{AdjuntoAudio, antiguo, false, nil, true}, {AdjuntoImagen, nuevo, false, nil, false}, {AdjuntoVideo, antiguo, true, nil, false},
		{AdjuntoDrive, antiguo, false, &drive, false}, {AdjuntoAudio, antiguo, false, &drive, false}, {AdjuntoArchivo, antiguo, false, nil, false},
	} {
		id := int64(i + 1)
		mid := int64(1)
		m.adjuntos[id] = &ChatAdjunto{ID: id, Tipo: caso.tipo, CreadoEn: caso.fecha, Conservar: caso.conservar, URLExterna: caso.url, StoragePath: &ruta, MensajeID: &mid}
		m.archivosAdjuntos[id] = []byte("original")
	}
	m.mensajes = []*ChatMensaje{{ID: 1, Cuerpo: "Texto intacto", CreadoEn: antiguo}}
	m.adjuntosAsignacion = make(map[string]*AdjuntoAsignacion)
	m.objetosAsignacion = make(map[string][]byte)
	texto := "Transcripción intacta"
	descripcion := "Descripción intacta"
	for _, caso := range []struct {
		id        string
		estado    EstadoTarea
		cierre    *time.Time
		subida    time.Time
		conservar bool
		resumen   string
		purga     bool
	}{
		{"aprobada", EstadoTareaAceptada, &antiguo, antiguo, false, "listo", true}, {"cancelada", EstadoTareaCancelada, &antiguo, antiguo, false, "listo", true},
		{"abierta", EstadoTareaPendiente, &antiguo, antiguo, false, "listo", false}, {"revision", EstadoTareaHecha, &antiguo, antiguo, false, "listo", false},
		{"devuelta", EstadoTareaRechazada, &antiguo, antiguo, false, "listo", false}, {"cierre-reciente", EstadoTareaAceptada, &nuevo, antiguo, false, "listo", false},
		{"sin-cierre", EstadoTareaCancelada, nil, antiguo, false, "listo", false}, {"subida-reciente", EstadoTareaCancelada, &antiguo, nuevo, false, "listo", false},
		{"protegida", EstadoTareaAceptada, &antiguo, antiguo, true, "listo", false}, {"procesando", EstadoTareaAceptada, &antiguo, antiguo, false, "procesando", false},
	} {
		tid := int64(len(m.tareas) + 1)
		m.tareas[tid] = &Tarea{ID: tid, Estado: caso.estado, ResueltaEn: caso.cierre, Descripcion: &descripcion}
		m.adjuntosAsignacion[caso.id] = &AdjuntoAsignacion{ID: caso.id, TareaID: tid, Tipo: "audio", EstadoArchivo: "listo", Ruta: caso.id, CreadoEn: caso.subida, Conservar: caso.conservar, EstadoResumen: caso.resumen, Resumen: []string{"Resumen intacto"}, Transcripcion: &texto}
		m.objetosAsignacion[caso.id] = []byte("original")
	}
	conteo, err := m.PurgarRetencion(ctx)
	if err != nil || conteo != (ConteoPurga{Chat: 1, Asignaciones: 2}) {
		t.Fatalf("conteo=%+v error=%v", conteo, err)
	}
	for id, a := range m.adjuntos {
		_, objeto := m.archivosAdjuntos[id]
		esperado := id == 1
		if (a.PurgadoEn != nil) != esperado || objeto == esperado {
			t.Errorf("chat %d: objeto=%v marca=%v", id, objeto, a.PurgadoEn)
		}
	}
	for id, a := range m.adjuntosAsignacion {
		_, objeto := m.objetosAsignacion[id]
		esperado := id == "aprobada" || id == "cancelada"
		if (a.PurgadoEn != nil) != esperado || objeto == esperado || a.EstadoArchivo != "listo" || a.Resumen[0] != "Resumen intacto" || *a.Transcripcion != texto {
			t.Errorf("asignación %s: %+v objeto=%v", id, a, objeto)
		}
	}
	if m.mensajes[0].Cuerpo != "Texto intacto" || *m.tareas[1].Descripcion != descripcion || *m.adjuntos[4].URLExterna != drive {
		t.Fatal("alteró el historial")
	}
	if otro, err := m.PurgarRetencion(ctx); err != nil || otro != (ConteoPurga{}) {
		t.Fatalf("segunda ejecución: %+v, %v", otro, err)
	}
}
