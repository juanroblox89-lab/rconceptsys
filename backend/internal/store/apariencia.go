package store

import "context"

type Apariencia struct {
	Modo       string `json:"modo"`
	Tema       string `json:"tema"`
	Fondo      string `json:"fondo,omitempty"`
	Texto      string `json:"texto,omitempty"`
	Acento     string `json:"acento,omitempty"`
	Interfaz   int    `json:"interfaz,omitempty"`
	Contenido  int    `json:"contenido,omitempty"`
	Movimiento string `json:"movimiento"`
	Contraste  bool   `json:"contraste"`
	Oscurecido int    `json:"oscurecido"`
	Imagen     string `json:"imagen,omitempty"`
	Video      string `json:"video,omitempty"`
}

func AparienciaInicial() Apariencia {
	return Apariencia{Modo: "sistema", Tema: "rconcept", Movimiento: "sistema", Oscurecido: 32}
}

type StoreApariencia interface {
	ObtenerApariencia(context.Context, string) (Apariencia, error)
	GuardarApariencia(context.Context, string, Apariencia) error
	GuardarMedioApariencia(context.Context, string, string, string, []byte) error
	LeerMedioApariencia(context.Context, string, string) ([]byte, error)
}

func (m *MemoryStore) ObtenerApariencia(_ context.Context, p string) (Apariencia, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if v, ok := m.apariencias[p]; ok {
		return v, nil
	}
	return AparienciaInicial(), nil
}
func (m *MemoryStore) GuardarApariencia(_ context.Context, p string, v Apariencia) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.apariencias == nil {
		m.apariencias = map[string]Apariencia{}
	}
	m.apariencias[p] = v
	return nil
}
func (m *MemoryStore) GuardarMedioApariencia(_ context.Context, p, n, _ string, d []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.mediosApariencia == nil {
		m.mediosApariencia = map[string][]byte{}
	}
	m.mediosApariencia[p+"/"+n] = d
	return nil
}
func (m *MemoryStore) LeerMedioApariencia(_ context.Context, p, n string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	d, ok := m.mediosApariencia[p+"/"+n]
	if !ok {
		return nil, ErrNotFound
	}
	return d, nil
}
