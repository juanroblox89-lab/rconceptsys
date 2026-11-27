package httpapi

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"unicode"
)

const mibAdjunto = 1024 * 1024
const parteAdjunto = 2 * mibAdjunto

type formatoAdjunto struct {
	tipo, mime string
	maximo     int
}

func mensajeTamanoAdjunto(tamano int, f formatoAdjunto) string {
	switch f.tipo {
	case "imagen":
		if tamano <= 0 {
			return "La imagen está vacía."
		}
		return fmt.Sprintf("La imagen supera el límite de %d MB.", f.maximo/mibAdjunto)
	case "audio":
		if tamano <= 0 {
			return "El audio está vacío."
		}
		return fmt.Sprintf("El audio supera el límite de %d MB.", f.maximo/mibAdjunto)
	case "video":
		if tamano <= 0 {
			return "El video está vacío."
		}
		return fmt.Sprintf("El video supera el límite de %d MB.", f.maximo/mibAdjunto)
	default:
		if tamano <= 0 {
			return "El archivo está vacío."
		}
		return fmt.Sprintf("El archivo supera el límite de %d MB.", f.maximo/mibAdjunto)
	}
}

func formatoAsignacion(nombre, tipo string) (formatoAdjunto, bool) {
	ext := strings.ToLower(filepath.Ext(nombre))
	var f formatoAdjunto
	switch ext {
	case ".jpg", ".jpeg":
		f = formatoAdjunto{"imagen", "image/jpeg", 10 * mibAdjunto}
	case ".png":
		f = formatoAdjunto{"imagen", "image/png", 10 * mibAdjunto}
	case ".webp":
		f = formatoAdjunto{"imagen", "image/webp", 10 * mibAdjunto}
	case ".heic":
		f = formatoAdjunto{"imagen", "image/heic", 10 * mibAdjunto}
	case ".mp4":
		f = formatoAdjunto{"video", "video/mp4", 50 * mibAdjunto}
	case ".mov":
		f = formatoAdjunto{"video", "video/quicktime", 50 * mibAdjunto}
	case ".webm":
		if tipo == "audio" {
			f = formatoAdjunto{"audio", "audio/webm", 25 * mibAdjunto}
		} else {
			f = formatoAdjunto{"video", "video/webm", 50 * mibAdjunto}
		}
	case ".ogg", ".opus":
		f = formatoAdjunto{"audio", "audio/ogg", 25 * mibAdjunto}
	case ".m4a":
		f = formatoAdjunto{"audio", "audio/mp4", 25 * mibAdjunto}
	case ".mp3":
		f = formatoAdjunto{"audio", "audio/mpeg", 25 * mibAdjunto}
	case ".wav":
		f = formatoAdjunto{"audio", "audio/wav", 25 * mibAdjunto}
	default:
		return f, false
	}
	return f, tipo == f.tipo
}

func nombreSeguroAdjunto(nombre string) (string, error) {
	nombre = strings.TrimSpace(filepath.Base(strings.ReplaceAll(nombre, "\\", "/")))
	if nombre == "." || nombre == "" || len([]rune(nombre)) > 180 || strings.IndexFunc(nombre, unicode.IsControl) >= 0 {
		return "", errors.New("Nombre de archivo inválido.")
	}
	return nombre, nil
}

func validarMedioAdjunto(b []byte, f formatoAdjunto) bool {
	if len(b) == 0 || len(b) > f.maximo {
		return false
	}
	switch f.mime {
	case "image/jpeg", "image/png", "image/webp":
		return http.DetectContentType(b) == f.mime
	case "audio/wav":
		return len(b) >= 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WAVE"
	case "audio/mpeg":
		return http.DetectContentType(b) == f.mime || (len(b) >= 4 && b[0] == 0xff && b[1]&0xe0 == 0xe0 && b[1]&0x18 != 0x08 && b[1]&0x06 != 0 && b[2]&0xf0 != 0xf0 && b[2]&0x0c != 0x0c)
	case "audio/ogg":
		if len(b) < 28 || string(b[:4]) != "OggS" || b[4] != 0 {
			return false
		}
		inicio := 27 + int(b[26])
		if inicio >= len(b) {
			return false
		}
		return bytes.HasPrefix(b[inicio:], []byte("OpusHead")) || bytes.HasPrefix(b[inicio:], []byte("\x01vorbis")) || bytes.HasPrefix(b[inicio:], []byte("\x7fFLAC")) || bytes.HasPrefix(b[inicio:], []byte("Speex   "))
	case "audio/webm", "video/webm":
		audio, video := pistasWebM(b)
		if f.tipo == "audio" {
			return audio && !video
		}
		return video
	case "image/heic":
		return recorrerCajas(b, func(typ string, p []byte) bool {
			if typ != "ftyp" || len(p) < 8 {
				return false
			}
			for i := 0; i+4 <= len(p); i += 4 {
				if i == 4 {
					continue
				}
				switch string(p[i : i+4]) {
				case "heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs":
					return true
				}
			}
			return false
		})
	case "audio/mp4", "video/mp4", "video/quicktime":
		var audio, video, quick bool
		recorrerCajas(b, func(typ string, p []byte) bool {
			if typ == "ftyp" && len(p) >= 4 {
				quick = string(p[:4]) == "qt  "
			}
			if typ == "moov" {
				recorrerCajas(p, func(typ string, p []byte) bool {
					if typ == "trak" {
						recorrerCajas(p, func(typ string, p []byte) bool {
							if typ == "mdia" {
								recorrerCajas(p, func(typ string, p []byte) bool {
									if typ == "hdlr" && len(p) >= 12 {
										audio = audio || string(p[8:12]) == "soun"
										video = video || string(p[8:12]) == "vide"
									}
									return false
								})
							}
							return false
						})
					}
					return false
				})
			}
			return false
		})
		if f.tipo == "audio" {
			return audio && !video && !quick
		}
		return video && (f.mime == "video/quicktime" || !quick)
	}
	return false
}

func recorrerCajas(b []byte, fn func(string, []byte) bool) bool {
	for len(b) >= 8 {
		tam, header := uint64(binary.BigEndian.Uint32(b)), 8
		if tam == 1 {
			if len(b) < 16 {
				return false
			}
			tam, header = binary.BigEndian.Uint64(b[8:]), 16
		}
		if tam == 0 {
			tam = uint64(len(b))
		}
		if tam < uint64(header) || tam > uint64(len(b)) {
			return false
		}
		if fn(string(b[4:8]), b[header:tam]) {
			return true
		}
		b = b[tam:]
	}
	return false
}

func enteroEBML(b []byte, id bool) (uint64, int, bool) {
	if len(b) == 0 || b[0] == 0 {
		return 0, 0, false
	}
	n := 1
	marca := byte(0x80)
	for b[0]&marca == 0 {
		n++
		marca >>= 1
	}
	if n > len(b) || (id && n > 4) {
		return 0, 0, false
	}
	v := uint64(b[0])
	if !id {
		v = uint64(b[0] &^ marca)
	}
	for _, c := range b[1:n] {
		v = v<<8 | uint64(c)
	}
	return v, n, !id && v == (uint64(1)<<(7*n))-1
}

func recorrerEBML(b []byte, fn func(uint64, []byte)) {
	for len(b) > 0 {
		id, n, _ := enteroEBML(b, true)
		if n == 0 {
			return
		}
		b = b[n:]
		tam, n, indefinido := enteroEBML(b, false)
		if n == 0 {
			return
		}
		b = b[n:]
		if indefinido {
			tam = uint64(len(b))
		}
		if tam > uint64(len(b)) {
			return
		}
		fn(id, b[:tam])
		b = b[tam:]
	}
}

func pistasWebM(b []byte) (audio, video bool) {
	if !bytes.HasPrefix(b, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
		return false, false
	}
	webm := false
	recorrerEBML(b, func(id uint64, p []byte) {
		if id == 0x1a45dfa3 {
			recorrerEBML(p, func(id uint64, p []byte) {
				if id == 0x4282 && strings.TrimRight(string(p), "\x00") == "webm" {
					webm = true
				}
			})
		}
		if id == 0x18538067 {
			recorrerEBML(p, func(id uint64, p []byte) {
				if id != 0x1654ae6b {
					return
				}
				recorrerEBML(p, func(id uint64, p []byte) {
					if id != 0xae {
						return
					}
					recorrerEBML(p, func(id uint64, p []byte) {
						if id == 0x83 && len(p) == 1 {
							audio = audio || p[0] == 2
							video = video || p[0] == 1
						}
					})
				})
			})
		}
	})
	return audio && webm, video && webm
}
