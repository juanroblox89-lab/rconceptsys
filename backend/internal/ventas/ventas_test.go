// Tests del dominio F4 (ventas): estados de lead, duplicados por teléfono
// normalizado + nombre parecido, reactivación (match teléfono/nombre),
// vencidas de próxima acción, idempotencia de client_id y tope de fotos.
// Solo stdlib, sin store.
package ventas

import "testing"

func TestTransicionLead(t *testing.T) {
	orden := []string{LeadProspecto, LeadEnContacto, LeadPropuesta, LeadNegociacion}
	for i, de := range orden {
		if !TransicionLeadValida(de, de) {
			t.Errorf("igual-estado %q debería ser válido (idempotencia)", de)
		}
		if i+1 < len(orden) {
			if !TransicionLeadValida(de, orden[i+1]) {
				t.Errorf("%q → %q debería ser válido", de, orden[i+1])
			}
		}
		if TransicionLeadValida(de, LeadGanado) && de != LeadNegociacion {
			t.Errorf("%q → ganado debería ser inválido (solo desde negociación)", de)
		}
	}
	if !TransicionLeadValida(LeadProspecto, LeadPerdido) {
		t.Error("prospecto → perdido debería ser válido (perdido con motivo desde abierto)")
	}
	if TransicionLeadValida(LeadGanado, LeadPerdido) || TransicionLeadValida(LeadPerdido, LeadProspecto) {
		t.Error("ganado/perdido son finales")
	}
	if !EsEstadoLead(LeadGanado) || EsEstadoLead("otra") {
		t.Error("vocabulario de estados")
	}
	if LeadAbierto(LeadGanado) || LeadAbierto(LeadPerdido) || !LeadAbierto(LeadProspecto) {
		t.Error("LeadAbierto")
	}
}

func TestNormalizarTelefono(t *testing.T) {
	casos := map[string]string{
		"+57 300 123-4567": "3001234567",
		"300 111 2233":     "3001112233",
		"(604) 444-5566":   "6044445566",
		"":                 "",
	}
	for in, quiere := range casos {
		if got := NormalizarTelefono(in); got != quiere {
			t.Errorf("NormalizarTelefono(%q) = %q, quería %q", in, got, quiere)
		}
	}
}

func TestNombreParecido(t *testing.T) {
	if !NombreParecido("El Tizón Dorado", "el tizon dorado sucursal") {
		t.Error("tildes/mayúsculas deberían normalizarse")
	}
	if !NombreParecido("Ricos Pandeyucas", "Pandeyucas Ricos") {
		t.Error("palabras en otro orden deberían parecerse")
	}
	if NombreParecido("Villa Grande", "Kantel") {
		t.Error("negocios distintos no deberían parecerse")
	}
	if NombreParecido("El Bar", "La Tienda") {
		t.Error("solo artículos en común no bastan")
	}
}

func TestEsDuplicado(t *testing.T) {
	base := Lead{Negocio: "El Tizón Dorado", Telefono: "300 111 2233"}
	mismoTel := Lead{Negocio: "Otro Nombre", Telefono: "+57 300-111-2233"}
	if !EsDuplicado(base, mismoTel) {
		t.Error("mismo teléfono normalizado = duplicado")
	}
	mismoNombre := Lead{Negocio: "el tizon dorado", Telefono: "999"}
	if !EsDuplicado(base, mismoNombre) {
		t.Error("nombre parecido = duplicado")
	}
	distinto := Lead{Negocio: "Kantel Tech", Telefono: "311 000 1111"}
	if EsDuplicado(base, distinto) {
		t.Error("negocio distinto no es duplicado")
	}
	sinTel := Lead{Negocio: "Kantel Tech"}
	if EsDuplicado(sinTel, Lead{Negocio: "Otro"}) {
		t.Error("sin teléfono ni nombre parecido no es duplicado")
	}
}

func TestEsVencidaLead(t *testing.T) {
	if !EsVencida("2026-01-01", LeadEnContacto, "2026-09-27") {
		t.Error("acción pasada en lead abierto = vencida")
	}
	if EsVencida("2026-10-01", LeadEnContacto, "2026-09-27") {
		t.Error("acción futura no vence")
	}
	if EsVencida("2026-01-01", LeadGanado, "2026-09-27") {
		t.Error("ganado nunca vence")
	}
	if EsVencida("", LeadEnContacto, "2026-09-27") {
		t.Error("sin fecha no vence")
	}
}

func TestClientIDYFoto(t *testing.T) {
	if !ClientIDValido("550e8400-e29b-41d4-a716-446655440000") {
		t.Error("UUID válido")
	}
	if !ClientIDValido("") {
		t.Error("vacío válido (visita online)")
	}
	if ClientIDValido("con espacios no") {
		t.Error("espacios inválidos")
	}
	if !FotoTamanoValido(500*1024) || FotoTamanoValido(500*1024+1) || !FotoTamanoValido(0) {
		t.Error("tope 500 KB")
	}
	if !OrigenValido("visita") || !OrigenValido("") || OrigenValido("otro") {
		t.Error("orígenes")
	}
	if !ResultadoVisitaValido("volver") || ResultadoVisitaValido("tal vez") {
		t.Error("resultados de visita")
	}
}
