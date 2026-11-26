package httpapi

import (
	"bytes"
	"encoding/binary"
	"strings"
)

var tablaCRCOgg = func() [256]uint32 {
	var t [256]uint32
	for i := range 256 {
		r := uint32(i) << 24
		for range 8 {
			if r&0x80000000 != 0 {
				r = (r << 1) ^ 0x04c11db7
			} else {
				r <<= 1
			}
		}
		t[i] = r
	}
	return t
}()

func crcOgg(b []byte) uint32 {
	var crc uint32
	for _, c := range b {
		crc = (crc << 8) ^ tablaCRCOgg[byte(crc>>24)^c]
	}
	return crc
}

func construirPaginaOgg(headerType byte, granule uint64, serial, seq uint32, paquetes [][]byte) []byte {
	var segs []byte
	var cuerpo bytes.Buffer
	for _, p := range paquetes {
		cuerpo.Write(p)
		for rem := len(p); ; {
			if rem >= 255 {
				segs = append(segs, 255)
				rem -= 255
			} else {
				segs = append(segs, byte(rem))
				break
			}
		}
	}
	var out bytes.Buffer
	out.Grow(27 + len(segs) + cuerpo.Len())
	out.WriteString("OggS")
	out.WriteByte(0)
	out.WriteByte(headerType)
	var u64 [8]byte
	binary.LittleEndian.PutUint64(u64[:], granule)
	out.Write(u64[:])
	var u32 [4]byte
	binary.LittleEndian.PutUint32(u32[:], serial)
	out.Write(u32[:])
	binary.LittleEndian.PutUint32(u32[:], seq)
	out.Write(u32[:])
	out.Write([]byte{0, 0, 0, 0}) // CRC placeholder
	out.WriteByte(byte(len(segs)))
	out.Write(segs)
	out.Write(cuerpo.Bytes())
	raw := out.Bytes()
	binary.LittleEndian.PutUint32(raw[22:26], crcOgg(raw))
	return raw
}

func muestrasOpus(pkt []byte) int64 {
	if len(pkt) == 0 {
		return 0
	}
	toc := pkt[0]
	cfg := int(toc >> 3)
	var porCuadro int64
	switch {
	case cfg <= 11:
		porCuadro = [4]int64{480, 960, 1920, 2880}[cfg%4]
	case cfg <= 15:
		porCuadro = [2]int64{480, 960}[cfg&1]
	default:
		porCuadro = [4]int64{120, 240, 480, 960}[cfg%4]
	}
	var n int64 = 1
	switch toc & 0x03 {
	case 1, 2:
		n = 2
	case 3:
		if len(pkt) >= 2 {
			n = int64(pkt[1] & 0x3f)
			if n == 0 {
				n = 1
			}
		}
	}
	return porCuadro * n
}

func extraerTramasBloqueWebM(blk []byte, trackOpus uint64) ([][]byte, bool) {
	track, n, indef := enteroEBML(blk, false)
	if n == 0 || indef || len(blk) < n+3 {
		return nil, false
	}
	if track != trackOpus {
		return nil, true
	}
	flags := blk[n+2]
	payload := blk[n+3:]
	if len(payload) == 0 {
		return nil, true
	}
	lacing := (flags >> 1) & 0x03
	switch lacing {
	case 0:
		return [][]byte{payload}, true
	case 1: // Xiph lacing
		cnt := int(payload[0])
		pos := 1
		tams := make([]int, 0, cnt+1)
		for range cnt {
			tam := 0
			for {
				if pos >= len(payload) {
					return nil, false
				}
				v := int(payload[pos])
				pos++
				tam += v
				if v < 255 {
					break
				}
			}
			tams = append(tams, tam)
		}
		var out [][]byte
		for _, tam := range tams {
			if pos+tam > len(payload) {
				return nil, false
			}
			out = append(out, payload[pos:pos+tam])
			pos += tam
		}
		if pos <= len(payload) {
			out = append(out, payload[pos:])
		}
		return out, true
	case 2: // Fixed-size lacing
		cnt := int(payload[0]) + 1
		rest := payload[1:]
		if cnt <= 0 || len(rest)%cnt != 0 {
			return nil, false
		}
		tam := len(rest) / cnt
		out := make([][]byte, 0, cnt)
		for i := range cnt {
			out = append(out, rest[i*tam:(i+1)*tam])
		}
		return out, true
	case 3: // EBML lacing
		cnt := int(payload[0])
		pos := 1
		if cnt == 0 {
			return [][]byte{payload[1:]}, true
		}
		primero, k, indefTam := enteroEBML(payload[pos:], false)
		if k == 0 || indefTam {
			return nil, false
		}
		pos += k
		tams := make([]int, 0, cnt+1)
		prev := int64(primero)
		tams = append(tams, int(prev))
		for range cnt - 1 {
			raw, k, indefDelta := enteroEBML(payload[pos:], false)
			if k == 0 || indefDelta {
				return nil, false
			}
			pos += k
			bias := int64((uint64(1) << (7*k - 1)) - 1)
			prev += int64(raw) - bias
			if prev < 0 {
				return nil, false
			}
			tams = append(tams, int(prev))
		}
		var out [][]byte
		for _, tam := range tams {
			if pos+tam > len(payload) {
				return nil, false
			}
			out = append(out, payload[pos:pos+tam])
			pos += tam
		}
		if pos <= len(payload) {
			out = append(out, payload[pos:])
		}
		return out, true
	}
	return nil, false
}

func esElementoSegmento(id uint64) bool {
	switch id {
	case 0x1f43b675, 0x1c53bb6b, 0x1941a469, 0x1254c367, 0x1043a770, 0x114d9b74, 0x1549a966, 0x1654ae6b:
		return true
	}
	return false
}

// reempacarWebMaOggOpus convierte un WebM con pista Opus (incluido el formato en vivo de MediaRecorder)
// en un flujo Ogg Opus estándar en memoria, sin dependencias externas.
func reempacarWebMaOggOpus(b []byte) ([]byte, error) {
	if !bytes.HasPrefix(b, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
		return nil, errFormatoAudio
	}
	var seg []byte
	webm := false
	pos := 0
	for pos < len(b) {
		id, n, _ := enteroEBML(b[pos:], true)
		if n == 0 {
			break
		}
		pos += n
		tam, m, indef := enteroEBML(b[pos:], false)
		if m == 0 {
			break
		}
		pos += m
		if indef {
			tam = uint64(len(b) - pos)
		}
		if tam > uint64(len(b)-pos) {
			break
		}
		cuerpo := b[pos : pos+int(tam)]
		if id == 0x1a45dfa3 {
			recorrerEBML(cuerpo, func(cid uint64, p []byte) {
				if cid == 0x4282 && strings.TrimRight(string(p), "\x00") == "webm" {
					webm = true
				}
			})
		} else if id == 0x18538067 {
			seg = cuerpo
			break
		}
		pos += int(tam)
	}
	if !webm || len(seg) == 0 {
		return nil, errFormatoAudio
	}

	var trackOpus uint64
	var opusHead []byte
	var canales byte = 1
	var paquetes [][]byte

	sp := 0
	for sp < len(seg) {
		id, n, _ := enteroEBML(seg[sp:], true)
		if n == 0 {
			break
		}
		sp += n
		tam, m, indef := enteroEBML(seg[sp:], false)
		if m == 0 {
			break
		}
		sp += m

		if id == 0x1654ae6b { // Tracks
			if indef || tam > uint64(len(seg)-sp) {
				return nil, errFormatoAudio
			}
			recorrerEBML(seg[sp:sp+int(tam)], func(tid uint64, tp []byte) {
				if tid != 0xae {
					return
				}
				var num uint64
				var tipo byte
				var codec string
				var priv []byte
				var ch byte = 1
				recorrerEBML(tp, func(fid uint64, fp []byte) {
					switch fid {
					case 0xd7:
						for _, x := range fp {
							num = (num << 8) | uint64(x)
						}
					case 0x83:
						if len(fp) == 1 {
							tipo = fp[0]
						}
					case 0x86:
						codec = strings.TrimRight(string(fp), "\x00")
					case 0x63a2:
						priv = fp
					case 0xe1:
						recorrerEBML(fp, func(aid uint64, ap []byte) {
							if aid == 0x9f && len(ap) >= 1 {
								var v uint64
								for _, x := range ap {
									v = (v << 8) | uint64(x)
								}
								if v >= 1 && v <= 2 {
									ch = byte(v)
								}
							}
						})
					}
				})
				if tipo == 2 && codec == "A_OPUS" && num > 0 && trackOpus == 0 {
					trackOpus = num
					canales = ch
					if len(priv) >= 19 && bytes.HasPrefix(priv, []byte("OpusHead")) {
						opusHead = priv
					}
				}
			})
			sp += int(tam)
			continue
		}

		if id == 0x1f43b675 { // Cluster
			if trackOpus == 0 {
				return nil, errFormatoAudio
			}
			finCluster := len(seg)
			if !indef {
				if tam > uint64(len(seg)-sp) {
					break
				}
				finCluster = sp + int(tam)
			}
			cp := sp
			for cp < finCluster {
				cid, cn, _ := enteroEBML(seg[cp:], true)
				if cn == 0 {
					break
				}
				if indef && esElementoSegmento(cid) {
					break
				}
				cp += cn
				ctam, cm, cindef := enteroEBML(seg[cp:], false)
				if cm == 0 {
					break
				}
				cp += cm
				if cindef || ctam > uint64(finCluster-cp) {
					break
				}
				cbody := seg[cp : cp+int(ctam)]
				cp += int(ctam)
				switch cid {
				case 0xa3: // SimpleBlock
					tramas, ok := extraerTramasBloqueWebM(cbody, trackOpus)
					if !ok {
						return nil, errFormatoAudio
					}
					paquetes = append(paquetes, tramas...)
				case 0xa0: // BlockGroup
					recorrerEBML(cbody, func(bid uint64, bp []byte) {
						if bid == 0xa1 {
							if tramas, ok := extraerTramasBloqueWebM(bp, trackOpus); ok {
								paquetes = append(paquetes, tramas...)
							}
						}
					})
				}
			}
			sp = cp
			continue
		}

		if indef || tam > uint64(len(seg)-sp) {
			break
		}
		sp += int(tam)
	}

	if trackOpus == 0 || len(paquetes) == 0 {
		return nil, errFormatoAudio
	}
	if len(opusHead) == 0 {
		opusHead = make([]byte, 19)
		copy(opusHead[:8], "OpusHead")
		opusHead[8] = 1
		opusHead[9] = canales
		binary.LittleEndian.PutUint16(opusHead[10:12], 312)
		binary.LittleEndian.PutUint32(opusHead[12:16], 48000)
	}
	var opusTags bytes.Buffer
	opusTags.WriteString("OpusTags")
	var u32 [4]byte
	binary.LittleEndian.PutUint32(u32[:], 8)
	opusTags.Write(u32[:])
	opusTags.WriteString("rconcept")
	binary.LittleEndian.PutUint32(u32[:], 0)
	opusTags.Write(u32[:])

	const serial uint32 = 0x52434F50
	var out bytes.Buffer
	out.Write(construirPaginaOgg(0x02, 0, serial, 0, [][]byte{opusHead}))
	out.Write(construirPaginaOgg(0x00, 0, serial, 1, [][]byte{opusTags.Bytes()}))

	var granule uint64
	var seq uint32 = 2
	const maxPaquetesPagina = 20
	for i := 0; i < len(paquetes); {
		fin := min(i+maxPaquetesPagina, len(paquetes))
		grupo := paquetes[i:fin]
		// Asegurar que la suma de segmentos Ogg de la página no exceda 255.
		segs := 0
		fin = i
		for _, p := range grupo {
			s := len(p)/255 + 1
			if segs+s > 255 {
				break
			}
			segs += s
			fin++
		}
		if fin == i {
			// Un paquete excepcionalmente grande > 64KB: dividir en páginas de continuación si hiciera falta.
			p := paquetes[i]
			granule += uint64(muestrasOpus(p))
			var ht byte
			if i+1 == len(paquetes) {
				ht = 0x04
			}
			out.Write(construirPaginaOgg(ht, granule, serial, seq, [][]byte{p}))
			seq++
			i++
			continue
		}
		lote := paquetes[i:fin]
		for _, p := range lote {
			granule += uint64(muestrasOpus(p))
		}
		var ht byte
		if fin == len(paquetes) {
			ht = 0x04
		}
		out.Write(construirPaginaOgg(ht, granule, serial, seq, lote))
		seq++
		i = fin
	}
	return out.Bytes(), nil
}
