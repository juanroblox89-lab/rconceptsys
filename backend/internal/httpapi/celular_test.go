package httpapi

import (
	"testing"
)

func TestCelularPorIndicativo(t *testing.T) {
	for _, c := range []struct{ indicativo, entrada, salida string }{
		{"+57", "(300) 555-0100", "+573005550100"},
		{"+57", "6015550100", ""},
		{"+34", "612345678", "+34612345678"},
		{"+34", "312345678", ""},
		{"+54", "91155550101", "+5491155550101"},
		{"+99", "3005550100", ""},
		{"+57", "", ""},
	} {
		if v := normalizarCelular(c.indicativo, c.entrada); v != c.salida {
			t.Errorf("%s %q: obtuve %q, esperaba %q", c.indicativo, c.entrada, v, c.salida)
		}
	}
}
