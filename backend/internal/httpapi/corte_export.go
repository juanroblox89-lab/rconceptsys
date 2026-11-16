package httpapi

import (
	"fmt"
	"strings"

	"rconceptsys/backend/internal/store"
)

// ==========================================================
// F5: exportación de cortes de pago (CSV y PDF sin dependencias)
// ==========================================================

// nombreArchivoCorte arma el nombre del archivo a descargar.
func nombreArchivoCorte(c *store.Corte, ext string) string {
	return fmt.Sprintf("corte-%s-%s-a-%s.%s", c.Periodo, c.Desde, c.Hasta, ext)
}

// CSVCorte devuelve el corte en CSV (separador coma, UTF-8).
func CSVCorte(c *store.Corte) string {
	var b strings.Builder
	b.WriteString("Persona,Rol,Total,Tareas,Pagado\n")
	for _, l := range c.Lineas {
		nombre := ""
		rol := ""
		if l.Perfil != nil {
			nombre = l.Perfil.Nombre
			if len(l.Perfil.Roles) > 0 {
				nombres := make([]string, 0, len(l.Perfil.Roles))
				for _, r := range l.Perfil.Roles {
					nombres = append(nombres, r.Nombre)
				}
				rol = strings.Join(nombres, " y ")
			}
		}
		pagado := "no"
		if l.PagadaEn != nil {
			pagado = "sí"
		}
		fmt.Fprintf(&b, "%s,%s,%d,%d,%s\n", csvEscapar(nombre), csvEscapar(rol), l.Total, l.Tareas, pagado)
	}
	fmt.Fprintf(&b, "Total,,%d,%d,\n", c.Total, totalTareasCorte(c))
	return b.String()
}

func csvEscapar(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

func totalTareasCorte(c *store.Corte) int {
	total := 0
	for _, l := range c.Lineas {
		total += l.Tareas
	}
	return total
}

// pesos formatea un valor entero como "$1.234.567".
func pesos(v int64) string {
	s := fmt.Sprintf("%d", v)
	if v < 0 {
		s = s[1:]
	}
	var partes []string
	for len(s) > 3 {
		partes = append([]string{s[len(s)-3:]}, partes...)
		s = s[:len(s)-3]
	}
	partes = append([]string{s}, partes...)
	salida := "$" + strings.Join(partes, ".")
	if v < 0 {
		salida = "-" + salida
	}
	return salida
}

// PDFCorte genera un PDF de una página con el resumen del corte.
// Se escribe a mano (sin librerías) con Helvetica, para no agregar dependencias.
func PDFCorte(c *store.Corte) []byte {
	const ancho, alto = 595.0, 842.0
	const margenX = 56.0

	var b strings.Builder
	y := alto - 90.0

	texto := func(s string, tamano float64) {
		b.WriteString("BT\n")
		fmt.Fprintf(&b, "/F1 %.1f Tf\n", tamano)
		fmt.Fprintf(&b, "1 0 0 1 %.1f %.1f Tm\n", margenX, y)
		fmt.Fprintf(&b, "(%s) Tj\n", pdfEscapar(s))
		b.WriteString("ET\n")
		y -= tamano + 8
	}

	texto("Corte de pagos · RConcept Systems", 16)
	texto(fmt.Sprintf("Periodo: %s del %s al %s", c.Periodo, c.Desde, c.Hasta), 10)
	y -= 6
	texto("Persona · Total · Tareas · Estado", 10)
	y -= 4

	for _, l := range c.Lineas {
		nombre := "(sin perfil)"
		if l.Perfil != nil && l.Perfil.Nombre != "" {
			nombre = l.Perfil.Nombre
		}
		estado := "pendiente"
		if l.PagadaEn != nil {
			estado = "pagado"
		}
		texto(fmt.Sprintf("%s · %s · %d tareas · %s", recortar(nombre, 34), pesos(l.Total), l.Tareas, estado), 10)
		if y < 70 {
			break
		}
	}

	y -= 10
	texto(fmt.Sprintf("Total del corte: %s en %d tareas", pesos(c.Total), totalTareasCorte(c)), 12)

	b.WriteString("BT\n/F1 8 Tf\n")
	fmt.Fprintf(&b, "1 0 0 1 %.1f 56 Tm\n", margenX)
	b.WriteString("(Generado por rconceptsys. Totales sobre tareas aprobadas en el periodo.) Tj\n")
	b.WriteString("ET\n")

	contenido := b.String()

	objetos := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.0f %.0f] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", ancho, alto),
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(contenido), contenido),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
		"<< /Title (Corte de pagos) /Producer (rconceptsys) >>",
	}

	var pdf strings.Builder
	pdf.WriteString("%PDF-1.4\n")
	offsets := make([]int, 0, len(objetos)+1)
	for i, obj := range objetos {
		offsets = append(offsets, pdf.Len())
		fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", i+1, obj)
	}
	xref := pdf.Len()
	fmt.Fprintf(&pdf, "xref\n0 %d\n", len(objetos)+1)
	pdf.WriteString("0000000000 65535 f \n")
	for _, off := range offsets {
		fmt.Fprintf(&pdf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&pdf, "trailer\n<< /Size %d /Root 1 0 R /Info 6 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objetos)+1, xref)
	return []byte(pdf.String())
}

// pdfEscapar escapa los caracteres especiales del texto PDF.
func pdfEscapar(s string) string {
	reemplazos := []struct{ de, a string }{
		{`\`, `\\`},
		{`(`, `\(`},
		{`)`, `\)`},
	}
	salida := s
	for _, r := range reemplazos {
		salida = strings.ReplaceAll(salida, r.de, r.a)
	}
	// Los caracteres fuera de Latin-1 se cambian por su equivalente simple.
	var out strings.Builder
	for _, r := range salida {
		if r < 256 {
			out.WriteRune(r)
			continue
		}
		out.WriteRune('?')
	}
	return out.String()
}
