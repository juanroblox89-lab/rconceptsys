package httpapi

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestManualRIAContieneRutas(t *testing.T) {
	raiz := filepath.Join("..", "..", "..")
	docs := filepath.Join(raiz, "docs", "ria")
	leer := func(p string) string {
		b, e := os.ReadFile(p)
		if e != nil {
			t.Fatal(e)
		}
		return strings.ReplaceAll(string(b), "\r\n", "\n")
	}
	for f, compilado := range map[string]string{"conocimiento.md": riaConocimiento, "manual-equipo.md": riaManualEquipo, "manual-admin.md": riaManualAdmin} {
		if leer(filepath.Join(docs, f)) != compilado {
			t.Errorf("Documento %s no actualizado en Go: node scripts/verificar-ria.mjs --generar", f)
		}
	}
	fsManual, e := filepath.Glob(filepath.Join(docs, "manual-*.md"))
	if e != nil {
		t.Fatal(e)
	}
	var manual strings.Builder
	for _, f := range fsManual {
		manual.WriteString(leer(f))
	}
	texto := manual.String()
	registro := func(r string) {
		t.Helper()
		if !strings.Contains(texto, "`"+r+"`") {
			t.Errorf("Ruta no documentada: %s", r)
		}
	}
	app := filepath.Join(raiz, "app")
	pages := regexp.MustCompile(`^(page|route)\.[jt]sx?$`)
	if e := filepath.WalkDir(app, func(p string, d fs.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if d.IsDir() || !pages.MatchString(d.Name()) {
			return nil
		}
		rel, e := filepath.Rel(app, filepath.Dir(p))
		if e != nil {
			return e
		}
		var seg []string
		for _, v := range strings.Split(filepath.ToSlash(rel), "/") {
			if v != "." && !(strings.HasPrefix(v, "(") && strings.HasSuffix(v, ")")) {
				seg = append(seg, v)
			}
		}
		registro("/" + strings.Join(seg, "/"))
		return nil
	}); e != nil {
		t.Fatal(e)
	}
	archivos, e := filepath.Glob("*.go")
	if e != nil {
		t.Fatal(e)
	}
	patron := regexp.MustCompile(`"((?:GET|POST|PATCH|PUT|DELETE) /api/admin/[^"\n]+)"`)
	for _, f := range archivos {
		if strings.HasSuffix(f, "_test.go") || strings.HasSuffix(f, "_gen.go") {
			continue
		}
		for _, m := range patron.FindAllStringSubmatch(leer(f), -1) {
			registro(m[1])
		}
	}
}
